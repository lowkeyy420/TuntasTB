import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { dbFixtures } from "@/test-utils/dbFixtures";
import { ALERT_CHANNEL, parseAlertEvent, type AlertEvent } from "@/lib/alerts/notify";
import { OVERRIDE_NOTE_MIN, overrideSchema } from "@/lib/checkin/override";

/**
 * Timeline and override (nurse-queue 5.1, 5.4, 5.5). Database-backed: run only
 * when TEST_DATABASE_URL points at a migrated Postgres.
 */
const url = process.env.TEST_DATABASE_URL;
const SECRET = "s".repeat(48);

process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = "p".repeat(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

type Ctx = { params: Promise<{ id: string }> };
type CtxHandler = (req: Request, ctx: Ctx) => Promise<Response>;
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("overrideSchema", () => {
  it("needs a level and a note of at least 10 characters after trimming", () => {
    expect(OVERRIDE_NOTE_MIN).toBe(10);
    expect(overrideSchema.safeParse({ level: "RED", note: "Keluarga bilang kulit mulai kuning" }).success).toBe(true);
    for (const bad of [
      { level: "RED", note: "" },
      { level: "RED", note: "pendek" },
      { level: "RED", note: "   sembilan   " },
      { level: "PURPLE", note: "alasan yang cukup panjang" },
      { level: "RED" },
      { level: "RED", note: "alasan yang cukup panjang", extra: 1 },
    ]) {
      expect(overrideSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe.skipIf(!url)("timeline and override (database)", () => {
  const fx = dbFixtures(url ?? "postgres://unused");
  const listener = postgres(url ?? "postgres://unused", { max: 1 });
  const heard: AlertEvent[] = [];
  let unlisten: () => Promise<void>;

  let pkA: string;
  let pkB: string;
  let nurseA: string;
  let nurseA2: string;
  let nurseB: string;
  const cookie: Record<string, string> = {};
  let timelineRoute: { GET: CtxHandler };
  let overrideRoute: { POST: CtxHandler };
  let ackRoute: { POST: CtxHandler };

  const req = (path: string, who: string | null, body?: unknown) =>
    new Request(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(who ? { cookie: cookie[who] } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const override = (checkinId: string, who: string | null, body: unknown) =>
    overrideRoute.POST(req(`/api/nurse/checkins/${checkinId}/override`, who, body), ctx(checkinId));
  const timeline = (patientId: string, who: string | null) =>
    timelineRoute.GET(req(`/api/nurse/patients/${patientId}/timeline`, who), ctx(patientId));

  beforeAll(async () => {
    const l = await listener.listen(ALERT_CHANNEL, (payload) => {
      const event = parseAlertEvent(payload);
      if (event && (event.puskesmasId === pkA || event.puskesmasId === pkB)) heard.push(event);
    });
    unlisten = () => l.unlisten();
    const { createSession } = await import("@/lib/auth/session");
    pkA = (await fx.puskesmas("A")).id;
    pkB = (await fx.puskesmas("B")).id;
    nurseA = (await fx.nurse(pkA)).id;
    nurseA2 = (await fx.nurse(pkA)).id;
    nurseB = (await fx.nurse(pkB)).id;
    cookie.a = `session=${await createSession({ nurseId: nurseA, puskesmasId: pkA }, SECRET)}`;
    cookie.a2 = `session=${await createSession({ nurseId: nurseA2, puskesmasId: pkA }, SECRET)}`;
    cookie.b = `session=${await createSession({ nurseId: nurseB, puskesmasId: pkB }, SECRET)}`;
    timelineRoute = await import("@/app/api/nurse/patients/[id]/timeline/route");
    overrideRoute = await import("@/app/api/nurse/checkins/[id]/override/route");
    ackRoute = await import("@/app/api/nurse/alerts/[id]/ack/route");
  });

  afterAll(async () => {
    await unlisten?.();
    await listener.end();
    await fx.cleanup();
  });

  const day = (n: number) => `2026-03-${String(n).padStart(2, "0")}`;

  describe("GET /api/nurse/patients/[id]/timeline (5.1)", () => {
    it("lists check-ins newest first with level, symptoms, redacted note, score with reasons, reply and alert status", async () => {
      const p = await fx.patient(pkA, { startDate: day(1) });
      await fx.checkin(p.id, { occurredOn: day(10), treatmentDay: 10, createdAt: new Date(`${day(10)}T02:00:00Z`) });
      const yellow = await fx.checkin(p.id, {
        occurredOn: day(11),
        treatmentDay: 11,
        createdAt: new Date(`${day(11)}T12:20:00Z`),
        doseStatus: "partial",
        triageLevel: "YELLOW",
        symptomsJson: { chips: ["nausea_mild", "sesuatu_baru"], symptoms: ["nausea_mild"], redFlags: [], unknown: ["sesuatu_baru"] },
        textRedacted: "mual terus seminggu, katanya sudah sembuh",
        riskScore: 8,
        riskBand: "high",
        riskReasonsJson: [
          { factor: "stop_intent", points: 4, text: "Mengatakan ingin berhenti atau merasa sudah sembuh" },
          { factor: "unresolved_side_effect", points: 3, text: "Keluhan yang sama sudah 7 hari" },
          { factor: "yellow_today", points: 1, text: "Keluhan hari ini perlu dihubungi perawat" },
        ],
        familyMessage: "Keluhan ini perlu diperiksa oleh perawat.",
        replyAction: "Tetap minum obat sesuai jadwal.",
        fallbackUsed: true,
      });
      const red = await fx.checkin(p.id, {
        occurredOn: day(12),
        treatmentDay: 12,
        createdAt: new Date(`${day(12)}T03:00:00Z`),
        triageLevel: "RED",
        symptomsJson: { chips: [], symptoms: [], redFlags: ["jaundice"], unknown: [] },
      });
      const [alert] = await fx.d
        .insert(schema.alerts)
        .values({ checkinId: red.id, patientId: p.id, puskesmasId: pkA, level: "RED" })
        .returning();

      const res = await timeline(p.id, "a");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.patient).toMatchObject({ id: p.id, code: p.code, phase: "intensive" });
      expect(body.checkins.map((c: { occurredOn: string }) => c.occurredOn)).toEqual([day(12), day(11), day(10)]);
      expect(body.reviewStatus.rules).toBe("draft, belum ditinjau klinisi");
      expect(body.reviewStatus.corpus === null || typeof body.reviewStatus.corpus === "string").toBe(true);

      const [newest, middle] = body.checkins;
      expect(newest).toMatchObject({
        id: red.id,
        level: "RED",
        originalLevel: "RED",
        symptoms: ["Mata atau kulit kuning"],
        alert: { status: "open", acknowledgedBy: null },
      });
      expect(middle).toMatchObject({
        id: yellow.id,
        time: "19.20",
        treatmentDay: 11,
        doseStatus: "partial",
        level: "YELLOW",
        symptoms: ["Mual ringan setelah minum obat"],
        unknown: ["sesuatu_baru"],
        note: "mual terus seminggu, katanya sudah sembuh",
        riskScore: 8,
        riskBand: "high",
        familyMessage: "Keluhan ini perlu diperiksa oleh perawat.",
        familyAction: "Tetap minum obat sesuai jadwal.",
        fallbackUsed: true,
        override: null,
        alert: { status: "none" },
      });
      expect(middle.riskReasons).toHaveLength(3);
      expect(middle.riskReasons.map((r: { points: number }) => r.points)).toEqual([4, 3, 1]);
      expect(JSON.stringify(body)).not.toMatch(/pmo|hash|familyToken/i);

      await fx.d.update(schema.alerts).set({ acknowledgedBy: nurseA, acknowledgedAt: new Date() }).where(eq(schema.alerts.id, alert.id));
      const again = await (await timeline(p.id, "a")).json();
      expect(again.checkins[0].alert).toMatchObject({ status: "acknowledged" });
      expect(again.checkins[0].alert.acknowledgedBy).toMatch(/@test\.id$/);
    });

    it("audits the view as patient.read and refuses another Puskesmas, an unknown id and anonymous callers", async () => {
      const p = await fx.patient(pkA);
      expect((await timeline(p.id, "a")).status).toBe(200);
      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, p.id));
      expect(log.map((l) => [l.actor, l.action])).toEqual([[`nurse:${nurseA}`, "patient.read"]]);

      expect((await timeline(p.id, "b")).status).toBe(404);
      expect((await timeline(crypto.randomUUID(), "a")).status).toBe(404);
      expect((await timeline("nope", "a")).status).toBe(404);
      expect((await timeline(p.id, null)).status).toBe(401);
    });

    it("shows the override, with the original level kept beside it", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(5), triageLevel: "YELLOW" });
      await override(c.id, "a", { level: "RED", note: "Keluarga bilang kulit mulai kuning" });
      const [item] = (await (await timeline(p.id, "a")).json()).checkins;
      expect(item).toMatchObject({
        level: "RED",
        originalLevel: "YELLOW",
        override: { level: "RED", note: "Keluarga bilang kulit mulai kuning" },
      });
      expect(item.override.by).toMatch(/@test\.id$/);
    });
  });

  describe("POST /api/nurse/checkins/[id]/override (5.4, 5.5)", () => {
    const row = async (id: string) => (await fx.d.select().from(schema.checkins).where(eq(schema.checkins.id, id)))[0];

    it("stores the override beside the original level and audits nurse, check-in, from and to", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(6), triageLevel: "YELLOW" });
      const res = await override(c.id, "a", { level: "RED", note: "Keluarga bilang kulit mulai kuning" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ checkinId: c.id, level: "RED", originalLevel: "YELLOW", alertCreated: true });

      const stored = await row(c.id);
      expect(stored).toMatchObject({
        triageLevel: "YELLOW",
        overrideLevel: "RED",
        overrideNote: "Keluarga bilang kulit mulai kuning",
        overriddenBy: nurseA,
      });
      expect(stored.overriddenAt).toBeInstanceOf(Date);

      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `checkin:${c.id}`));
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        actor: `nurse:${nurseA}`,
        action: "checkin.override",
        metaJson: expect.objectContaining({ from: "YELLOW", to: "RED", original: "YELLOW", patientId: p.id }),
      });
      expect(JSON.stringify(log[0].metaJson)).not.toContain("kulit");
    });

    it("rejects an empty or short note and a missing level, leaving the level unchanged", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(7), triageLevel: "YELLOW" });
      for (const body of [{ level: "RED", note: "" }, { level: "RED", note: "pendek" }, { note: "alasan yang cukup panjang" }, {}]) {
        const res = await override(c.id, "a", body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect((await res.json()).error).toBe("validation");
      }
      expect((await row(c.id)).overrideLevel).toBeNull();
      expect(await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `checkin:${c.id}`))).toHaveLength(0);
    });

    it("rejects an override to the level already in force", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(7), triageLevel: "YELLOW" });
      const res = await override(c.id, "a", { level: "YELLOW", note: "alasan yang cukup panjang" });
      expect(res.status).toBe(400);
      expect((await res.json()).fields.level).toBe("Level baru sama dengan level saat ini");
    });

    it("redacts the note before storing it", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(8), triageLevel: "GREEN" });
      await override(c.id, "a", { level: "YELLOW", note: "Telepon keluarga di 0812-3456-7890 besok pagi" });
      const stored = (await row(c.id)).overrideNote ?? "";
      expect(stored).toContain("[TELEPON]");
      expect(stored).not.toMatch(/0812/);
    });

    it("raised to RED creates one alert and announces it; the family reply stays as it was", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, {
        occurredOn: day(9),
        triageLevel: "YELLOW",
        familyMessage: "Keluhan ini perlu diperiksa oleh perawat.",
        replyAction: "Tetap minum obat sesuai jadwal.",
      });
      heard.length = 0;
      await override(c.id, "a", { level: "RED", note: "Keluarga bilang kulit mulai kuning" });
      await sleep(300);
      const alerts = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.checkinId, c.id));
      expect(alerts).toHaveLength(1);
      expect(heard).toEqual([{ type: "alert.created", alertId: alerts[0].id, puskesmasId: pkA }]);
      const stored = await row(c.id);
      expect(stored.familyMessage).toBe("Keluhan ini perlu diperiksa oleh perawat.");
      expect(stored.replyAction).toBe("Tetap minum obat sesuai jadwal.");

      // Overriding to RED again (after a change in between) does not add a second alert.
      await override(c.id, "a", { level: "YELLOW", note: "Sudah ditelepon, kulit tidak kuning" });
      await override(c.id, "a", { level: "RED", note: "Keluarga menelepon lagi, kulit kuning" });
      expect(await fx.d.select().from(schema.alerts).where(eq(schema.alerts.checkinId, c.id))).toHaveLength(1);
    });

    it("lowered from RED keeps the alert and its acknowledgement, and the queue then uses the new level", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(10), triageLevel: "RED", doseStatus: "yes" });
      const [alert] = await fx.d
        .insert(schema.alerts)
        .values({ checkinId: c.id, patientId: p.id, puskesmasId: pkA, level: "RED" })
        .returning();
      await ackRoute.POST(
        new Request("http://localhost/x", { method: "POST", headers: { cookie: cookie.a } }),
        ctx(alert.id),
      );
      const before = (await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, alert.id)))[0];
      expect(before.acknowledgedBy).toBe(nurseA);

      const res = await override(c.id, "a2", { level: "YELLOW", note: "Sudah ditelepon, hanya kulit kering" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ level: "YELLOW", originalLevel: "RED", alertCreated: false });

      const after = (await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, alert.id)))[0];
      expect(after.acknowledgedBy).toBe(nurseA);
      expect(after.acknowledgedAt?.getTime()).toBe(before.acknowledgedAt?.getTime());
      expect((await row(c.id)).triageLevel).toBe("RED");

      const { buildQueue } = await import("@/lib/queue/build");
      const queue = await buildQueue(fx.d as never, pkA, day(11));
      const entry = queue.find((e) => e.patientId === p.id);
      expect(entry?.level).toBe("YELLOW");
      expect(entry?.overridden).toBe(true);
    });

    it("another Puskesmas' nurse, an unknown id and an anonymous caller change nothing", async () => {
      const p = await fx.patient(pkA);
      const c = await fx.checkin(p.id, { occurredOn: day(11), triageLevel: "YELLOW" });
      const body = { level: "RED", note: "alasan yang cukup panjang" };
      expect((await override(c.id, "b", body)).status).toBe(404);
      expect((await override(crypto.randomUUID(), "a", body)).status).toBe(404);
      expect((await override("nope", "a", body)).status).toBe(404);
      expect((await override(c.id, null, body)).status).toBe(401);
      expect((await row(c.id)).overrideLevel).toBeNull();
    });
  });
});
