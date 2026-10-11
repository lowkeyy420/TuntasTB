import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { generateFamilyToken, hashFamilyToken, resolveFamilyToken } from "@/lib/family-token";
import type { FlowOutput } from "@/lib/langflow/flowSchema";
import { defaultServiceDeps, submitCheckin, type ServiceDeps } from "./service";
import { checkinBodySchema, type CheckinBodyInput } from "./schema";
import type { Enrich } from "./enrich";
import { applyEnrichment, LowerLevelError } from "./store";

/**
 * add-symptom-extraction 6.2-6.4 on a real database: phase A stores the local
 * result (and a RED alert) before the flow answers; phase B can only raise
 * the level, creates a late RED alert, and records local, flow and final
 * levels with the fallback mark. Runs only with TEST_DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL;

function out(
  over: Partial<Omit<FlowOutput, "extracted">> & { extracted?: Partial<FlowOutput["extracted"]> } = {},
): FlowOutput {
  const { extracted, ...rest } = over;
  return {
    extracted: { symptoms: [], unknown_symptoms: [], dose_status: "yes", mood_flags: [], confidence: 0.9, ...extracted },
    level: "GREEN",
    risk: { score: 0, band: "low" },
    reasons: [],
    family_message: "",
    nurse_line: "",
    citations: [],
    ...rest,
  };
}

describe.skipIf(!url)("two-phase check-in (database)", () => {
  const client = postgres(url ?? "postgres://unused", { max: 4 });
  const db = drizzle(client, { schema }) as unknown as Database;
  const tag = `TP${Date.now().toString(36).toUpperCase()}`;
  let puskesmasId: string;
  const patientIds: string[] = [];
  let seq = 0;
  const noon = (day: string) => new Date(`${day}T05:00:00Z`);

  async function newPatient() {
    const token = generateFamilyToken();
    const [p] = await db
      .insert(schema.patients)
      .values({
        puskesmasId,
        code: `${tag}-${++seq}`.slice(0, 20),
        startDate: "2026-03-01",
        phase: "intensive",
        pmoContactHash: "hash",
        familyTokenHash: hashFamilyToken(token),
        consentAt: new Date(),
        createdAt: new Date("2026-03-01T01:00:00Z"),
      })
      .returning();
    patientIds.push(p.id);
    return (await resolveFamilyToken(db, token))!;
  }
  const body = (over: Partial<CheckinBodyInput>) =>
    checkinBodySchema.parse({ clientId: crypto.randomUUID(), doseStatus: "yes", ...over });
  const deps = (enrich: Enrich): ServiceDeps => ({ ...defaultServiceDeps(), enrich });
  const rowsOf = (id: string) => db.select().from(schema.checkins).where(eq(schema.checkins.patientId, id));
  const alertsOf = (id: string) => db.select().from(schema.alerts).where(eq(schema.alerts.patientId, id));

  beforeAll(async () => {
    const [p] = await db.insert(schema.puskesmas).values({ name: `${tag} Puskesmas`, phone: "021-777" }).returning();
    puskesmasId = p.id;
  });
  afterAll(async () => {
    if (patientIds.length > 0) {
      await db
        .delete(schema.auditLog)
        .where(inArray(schema.auditLog.actor, patientIds.map((id) => `family:${id}`)));
    }
    await db.delete(schema.puskesmas).where(eq(schema.puskesmas.id, puskesmasId));
    await client.end();
  });

  it("6.3: a local RED has its alert before a 10 s flow answers", async () => {
    const patient = await newPatient();
    let release!: () => void;
    let flowDone = false;
    const slow: Enrich = () =>
      new Promise((resolve) => {
        const finish = () => {
          flowDone = true;
          resolve({ ok: true, output: out({ level: "RED" }) });
        };
        const timer = setTimeout(finish, 10_000);
        release = () => {
          clearTimeout(timer);
          finish();
        };
      });
    const started = Date.now();
    const pending = submitCheckin(db, patient, body({ text: "matanya kuning" }), deps(slow), noon("2026-03-23"));

    let alerts: Awaited<ReturnType<typeof alertsOf>> = [];
    while (alerts.length === 0 && Date.now() - started < 1000) {
      await new Promise((r) => setTimeout(r, 25));
      alerts = await alertsOf(patient.id);
    }
    expect(alerts).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(flowDone).toBe(false);
    const [row] = await rowsOf(patient.id);
    expect(row).toMatchObject({ localLevel: "RED", triageLevel: "RED", fallbackUsed: true, flowLevel: null });

    release();
    const result = await pending;
    expect(result.kind === "ok" && result.reply.level).toBe("RED");
    expect(await alertsOf(patient.id)).toHaveLength(1); // no second alert
  }, 15_000);

  it("6.2: a YELLOW raised to RED by the flow gets its alert when the result is applied", async () => {
    const patient = await newPatient();
    const flow: Enrich = async () => ({
      ok: true,
      output: out({ level: "RED", extracted: { symptoms: [{ code: "nausea_mild", quote: "mual", duration_days: null }] } }),
    });
    const text = "mual dan pusing banget";
    await submitCheckin(db, patient, body({ text }), deps(flow), noon("2026-03-18"));
    const [row] = await rowsOf(patient.id);
    expect(row.localLevel).toBe("YELLOW");
    expect(row).toMatchObject({ flowLevel: "RED", triageLevel: "RED", fallbackUsed: false });
    const alerts = await alertsOf(patient.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ checkinId: row.id, level: "RED", puskesmasId });
  });

  it("6.2: a flow lower than local leaves RED (and a guard refuses any lowering update)", async () => {
    const patient = await newPatient();
    const flow: Enrich = async () => ({ ok: true, output: out({ level: "GREEN" }) });
    await submitCheckin(db, patient, body({ text: "matanya kuning" }), deps(flow), noon("2026-03-23"));
    const [row] = await rowsOf(patient.id);
    expect(row).toMatchObject({ localLevel: "RED", flowLevel: "GREEN", triageLevel: "RED" });

    const lowering = {
      checkinId: row.id,
      patientId: patient.id,
      puskesmasId,
      // A draft that would store GREEN over RED.
      draft: {
        occurredOn: row.occurredOn,
        treatmentDay: 23,
        doseStatus: "yes" as const,
        symptoms: { chips: [], symptoms: [], redFlags: [], unknown: [] },
        textRedacted: "",
        localLevel: "RED" as const,
        flowLevel: "GREEN" as const,
        level: "GREEN" as const,
        risk: { score: 0, band: "low" as const, reasons: [] },
        nurseLine: "",
        reply: {
          explanation: "x",
          action: "x",
          citations: [],
          contactLine: "x",
          warning: null,
          templateUsed: true,
          replaceReason: null,
        },
        fallbackUsed: false,
        rulesVersion: "x",
      },
      meta: { called: true, flowLevel: "GREEN" as const, finalLevel: "GREEN" as const, fallbackReason: null },
    };
    await expect(applyEnrichment(db, lowering)).rejects.toBeInstanceOf(LowerLevelError);
    const [after] = await rowsOf(patient.id);
    expect(after.triageLevel).toBe("RED");
  });

  it("6.2: a GREEN local raised to YELLOW by the flow", async () => {
    const patient = await newPatient();
    const flow: Enrich = async () => ({
      ok: true,
      output: out({
        level: "YELLOW",
        extracted: { symptoms: [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }], unknown_symptoms: ["telinganya berdenging"] },
      }),
    });
    await submitCheckin(db, patient, body({ text: "kencingnya merah" }), deps(flow), noon("2026-03-18"));
    const [row] = await rowsOf(patient.id);
    expect(row).toMatchObject({ localLevel: "GREEN", flowLevel: "YELLOW", triageLevel: "YELLOW", fallbackUsed: false });
    expect((row.symptomsJson as { unknown: string[] }).unknown).toContain("telinganya berdenging");
    expect(await alertsOf(patient.id)).toHaveLength(0);
  });

  it("6.4: records local, flow and final levels, the fallback mark and the checkin.enrich audit entry", async () => {
    const patient = await newPatient();
    const ok: Enrich = async () => ({
      ok: true,
      output: out({ extracted: { symptoms: [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }] } }),
    });
    await submitCheckin(db, patient, body({ text: "kencingnya merah" }), deps(ok), noon("2026-03-18"));
    const failing = await newPatient();
    const down: Enrich = async () => ({ ok: false, reason: "network" });
    const r = await submitCheckin(db, failing, body({ text: "kencingnya merah" }), deps(down), noon("2026-03-18"));

    const [good] = await rowsOf(patient.id);
    expect(good).toMatchObject({ localLevel: "GREEN", flowLevel: "GREEN", triageLevel: "GREEN", fallbackUsed: false });
    const [bad] = await rowsOf(failing.id);
    expect(bad).toMatchObject({ localLevel: "GREEN", flowLevel: null, triageLevel: "YELLOW", fallbackUsed: true });
    expect(r.kind === "ok" && r.reply).toMatchObject({
      level: "YELLOW",
      fallbackUsed: true,
      warning: "Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas.",
      contact: { name: `${tag} Puskesmas`, phone: "021-777" },
    });

    const audit = async (id: string) =>
      (await db.select().from(schema.auditLog).where(eq(schema.auditLog.target, `checkin:${id}`))).find(
        (e) => e.action === "checkin.enrich",
      );
    expect((await audit(good.id))?.metaJson).toEqual({
      flow_called: true,
      flow_level: "GREEN",
      final_level: "GREEN",
      fallback_reason: null,
      reply_template_used: true,
      reply_replace_reason: "no_generated",
    });
    expect((await audit(bad.id))?.metaJson).toMatchObject({ flow_level: null, final_level: "YELLOW", fallback_reason: "network" });
  });
});
