import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { generateFamilyToken, hashFamilyToken, resolveFamilyToken } from "@/lib/family-token";
import { defaultServiceDeps, submitCheckin, type ServiceDeps } from "./service";
import { checkinBodySchema, type CheckinBodyInput } from "./schema";
import { noEnrich, type Enrich } from "./enrich";

/** Rules-only mode, explicitly: these tests never call Langflow. */
const rulesOnly = (): ServiceDeps => ({ ...defaultServiceDeps(), enrich: noEnrich });

/** A fake flow answering GREEN for "kencingnya merah". */
const greenFlow: Enrich = async () => ({
  ok: true,
  output: {
    extracted: {
      symptoms: [{ code: "urine_orange", quote: "kencingnya merah", duration_days: null }],
      unknown_symptoms: [],
      dose_status: "yes",
      mood_flags: [],
      confidence: 0.9,
    },
    level: "GREEN",
    risk: { score: 0, band: "low" },
    reasons: ["symptom:urine_orange"],
    family_message: "",
    nurse_line: "",
    citations: [],
  },
});

/**
 * Database-backed tests of the transactional store and the service (daily-checkin
 * 1.3, 2.3). Run only when TEST_DATABASE_URL points at a migrated Postgres.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("check-in store and service (database)", () => {
  const client = postgres(url ?? "postgres://unused", { max: 4 });
  const db = drizzle(client, { schema }) as unknown as Database;
  const tag = `CK${Date.now().toString(36).toUpperCase()}`;
  let puskesmasId: string;
  const patientIds: string[] = [];
  let seq = 0;

  const noon = (day: string) => new Date(`${day}T05:00:00Z`);
  const uuid = () => crypto.randomUUID();

  async function newPatient(startDate = "2026-03-01") {
    const token = generateFamilyToken();
    const [p] = await db
      .insert(schema.patients)
      .values({
        puskesmasId,
        code: `${tag}-${++seq}`.slice(0, 20),
        startDate,
        phase: "intensive",
        pmoContactHash: "hash",
        familyTokenHash: hashFamilyToken(token),
        consentAt: new Date(),
        createdAt: new Date("2026-03-01T01:00:00Z"),
      })
      .returning();
    patientIds.push(p.id);
    const patient = await resolveFamilyToken(db, token);
    return patient!;
  }

  const body = (over: Partial<CheckinBodyInput>) =>
    checkinBodySchema.parse({ clientId: uuid(), doseStatus: "yes", ...over });

  const rowsOf = (patientId: string) =>
    db.select().from(schema.checkins).where(eq(schema.checkins.patientId, patientId));
  const alertsOf = (patientId: string) =>
    db.select().from(schema.alerts).where(eq(schema.alerts.patientId, patientId));

  beforeAll(async () => {
    const [p] = await db
      .insert(schema.puskesmas)
      .values({ name: `${tag} Puskesmas`, phone: "021-777" })
      .returning();
    puskesmasId = p.id;
  });

  afterAll(async () => {
    if (patientIds.length > 0) {
      await db.delete(schema.auditLog).where(
        inArray(
          schema.auditLog.actor,
          patientIds.map((id) => `family:${id}`),
        ),
      );
    }
    await db.delete(schema.puskesmas).where(eq(schema.puskesmas.id, puskesmasId)); // cascades
    await client.end();
  });

  it("stores the three demo check-ins with level, risk and reply, and one alert only for RED", async () => {
    const green = await newPatient("2026-03-01");
    const g = await submitCheckin(
      db,
      green,
      body({ text: "kencingnya merah" }),
      { ...rulesOnly(), enrich: greenFlow },
      noon("2026-03-18"),
    );
    const yellow = await newPatient("2026-03-01");
    const y = await submitCheckin(
      db,
      yellow,
      body({ text: "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti" }),
      rulesOnly(),
      noon("2026-04-10"),
    );
    const red = await newPatient("2026-03-01");
    const r = await submitCheckin(db, red, body({ text: "matanya kuning" }), rulesOnly(), noon("2026-03-23"));

    expect([g.kind, y.kind, r.kind]).toEqual(["ok", "ok", "ok"]);
    const [gr] = await rowsOf(green.id);
    const [yr] = await rowsOf(yellow.id);
    const [rr] = await rowsOf(red.id);
    expect(gr).toMatchObject({
      treatmentDay: 18,
      triageLevel: "GREEN",
      localLevel: "GREEN",
      flowLevel: "GREEN",
      fallbackUsed: false,
      riskBand: "low",
    });
    expect(yr).toMatchObject({ treatmentDay: 41, triageLevel: "YELLOW", riskBand: "high", riskScore: 8 });
    expect(rr).toMatchObject({ treatmentDay: 23, triageLevel: "RED", fallbackUsed: true, flowLevel: null });
    expect(rr.replyTemplateUsed).toBe(true);
    expect(rr.replyReplaceReason).toBe("no_generated");
    expect(yr.nurseLine).toBe("mual 7 hari + bilang sudah sembuh atau mau berhenti");
    expect(yr.replyAction).toMatch(/^Jangan berhenti dulu/);

    expect(await alertsOf(green.id)).toHaveLength(0);
    expect(await alertsOf(yellow.id)).toHaveLength(0);
    const redAlerts = await alertsOf(red.id);
    expect(redAlerts).toHaveLength(1);
    expect(redAlerts[0]).toMatchObject({
      checkinId: rr.id,
      puskesmasId,
      level: "RED",
      acknowledgedAt: null,
      acknowledgedBy: null,
    });
  });

  it("a repeated request returns the stored result and inserts nothing (1.3)", async () => {
    const patient = await newPatient();
    const first = body({ text: "matanya kuning" });
    const a = await submitCheckin(db, patient, first, rulesOnly(), noon("2026-03-23"));
    const b = await submitCheckin(db, patient, first, rulesOnly(), noon("2026-03-23"));
    expect(a.kind).toBe("ok");
    expect(b).toEqual(a);
    expect(await rowsOf(patient.id)).toHaveLength(1);
    expect(await alertsOf(patient.id)).toHaveLength(1);
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actor, `family:${patient.id}`));
    expect(audits.filter((x) => x.action === "checkin.create")).toHaveLength(1);
  });

  it("two simultaneous requests with the same client id store one check-in", async () => {
    const patient = await newPatient();
    const same = body({ chips: ["urine_orange"] });
    const [a, b] = await Promise.all([
      submitCheckin(db, patient, same, rulesOnly(), noon("2026-03-18")),
      submitCheckin(db, patient, same, rulesOnly(), noon("2026-03-18")),
    ]);
    expect(a).toEqual(b);
    expect(await rowsOf(patient.id)).toHaveLength(1);
  });

  it("redacts the note: the phone number is stored nowhere (spec: note is redacted before storage)", async () => {
    const patient = await newPatient();
    const result = await submitCheckin(
      db,
      patient,
      body({ text: "mual, telepon 081234567890" }),
      rulesOnly(),
      noon("2026-03-18"),
    );
    const [row] = await rowsOf(patient.id);
    expect(row.textRedacted).toContain("[TELEPON]");
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actor, `family:${patient.id}`));
    expect(JSON.stringify([row, audits, result])).not.toContain("081234567890");
  });

  it("the stored text goes only through the enrich seam after redaction", async () => {
    const patient = await newPatient();
    const enrich = vi.fn<Enrich>(noEnrich);
    const deps: ServiceDeps = { ...defaultServiceDeps(), enrich };
    await submitCheckin(
      db,
      patient,
      body({ text: "mual, telepon 081234567890, nik 3171234567890123" }),
      deps,
      noon("2026-03-18"),
    );
    expect(JSON.stringify(enrich.mock.calls)).not.toMatch(/081234567890|3171234567890123/);
  });

  it("writes an audit entry for the family actor, the check-in as target, without the note", async () => {
    const patient = await newPatient();
    await submitCheckin(db, patient, body({ text: "mual sedikit" }), rulesOnly(), noon("2026-03-18"));
    const [row] = await rowsOf(patient.id);
    const entries = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.target, `checkin:${row.id}`));
    const entry = entries.find((e) => e.action === "checkin.create")!;
    expect(entry).toMatchObject({ actor: `family:${patient.id}`, action: "checkin.create" });
    // Phase A: the local level, marked fallback until the flow result is applied.
    expect(entry.metaJson).toEqual({ level: row.localLevel, fallbackUsed: true });
    expect(entry.at).toBeInstanceOf(Date);
    const enrichEntry = entries.find((e) => e.action === "checkin.enrich")!;
    expect(enrichEntry.metaJson).toEqual({
      flow_called: true,
      flow_level: null,
      final_level: row.triageLevel,
      fallback_reason: "disabled",
      reply_template_used: true,
      reply_replace_reason: "no_generated",
    });
    expect(JSON.stringify(entries)).not.toContain("mual sedikit");
  });

  it("stores an offline check-in for its own day and a bad device date for the receive day", async () => {
    const patient = await newPatient("2026-03-01");
    await submitCheckin(db, patient, body({ occurredOn: "2026-03-03" }), rulesOnly(), noon("2026-03-04"));
    await submitCheckin(db, patient, body({ occurredOn: "2026-03-20" }), rulesOnly(), noon("2026-03-04"));
    const rows = (await rowsOf(patient.id)).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    expect(rows.map((r) => [r.occurredOn, r.treatmentDay])).toEqual([
      ["2026-03-03", 3],
      ["2026-03-04", 4],
    ]);
  });

  it("YELLOW and GREEN create no alert; an unknown chip is at least YELLOW", async () => {
    const patient = await newPatient();
    await submitCheckin(db, patient, body({ chips: ["sesuatu_baru"] }), rulesOnly(), noon("2026-03-18"));
    const [row] = await rowsOf(patient.id);
    expect(["YELLOW", "RED"]).toContain(row.triageLevel);
    expect(row.triageLevel).toBe("YELLOW");
    expect(await alertsOf(patient.id)).toHaveLength(0);
  });

  it("a failing alert insert rolls the whole check-in back (2.3)", async () => {
    const patient = await newPatient();
    const fn = `ck_fail_alert_${tag.toLowerCase()}`;
    await db.execute(
      sql.raw(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'alert blocked'; END $$ LANGUAGE plpgsql`),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON alerts FOR EACH ROW WHEN (NEW.patient_id = '${patient.id}') EXECUTE FUNCTION ${fn}()`,
      ),
    );
    try {
      await expect(
        submitCheckin(db, patient, body({ text: "matanya kuning" }), rulesOnly(), noon("2026-03-23")),
      ).rejects.toThrow();
      expect(await rowsOf(patient.id)).toHaveLength(0);
      expect(await alertsOf(patient.id)).toHaveLength(0);
      const audits = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.actor, `family:${patient.id}`));
      expect(audits).toHaveLength(0);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${fn} ON alerts`));
      await db.execute(sql.raw(`DROP FUNCTION ${fn}()`));
    }
  });

  it("refuses the twenty-first check-in of a day and stores nothing (3.2)", async () => {
    const patient = await newPatient();
    const now = noon("2026-03-18");
    for (let i = 0; i < 20; i++) {
      const r = await submitCheckin(db, patient, body({}), rulesOnly(), now);
      expect(r.kind).toBe("ok");
    }
    const over = await submitCheckin(db, patient, body({}), rulesOnly(), now);
    expect(over).toEqual({ kind: "limit" });
    expect(await rowsOf(patient.id)).toHaveLength(20);
    // The next day starts a fresh count.
    const next = await submitCheckin(db, patient, body({}), rulesOnly(), noon("2026-03-19"));
    expect(next.kind).toBe("ok");
    // A retry of a stored check-in is still answered at the limit.
    const [first] = await rowsOf(patient.id);
    const retry = await submitCheckin(
      db,
      patient,
      checkinBodySchema.parse({ clientId: first.clientId, doseStatus: "yes" }),
      rulesOnly(),
      now,
    );
    expect(retry.kind).toBe("ok");
  });
});
