import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { dbFixtures } from "@/test-utils/dbFixtures";
import type { Database } from "@/lib/db";
import { addDays } from "@/lib/risk/dates";
import { todayJakarta } from "@/lib/time";
import { doneSchema, rescheduleSchema } from "./schema";
import { backfillPickups, createFirstPickup } from "./service";

/**
 * Pickup storage, routes and risk integration (pickup-planner 2.x, 3.x, 4.1, 6.x).
 * Database-backed: run only when TEST_DATABASE_URL points at a migrated Postgres.
 */
const url = process.env.TEST_DATABASE_URL;
const SECRET = "s".repeat(48);
const PEPPER = "p".repeat(48);

process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = PEPPER;
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

type Ctx2 = { params: Promise<{ id: string; pickupId: string }> };
type Handler2 = (req: Request, ctx: Ctx2) => Promise<Response>;
type Handler = (req: Request) => Promise<Response>;

const today = () => todayJakarta();
const iso = (offset: number) => addDays(today(), offset);

describe("pickup request schemas", () => {
  it("done: optional real date, nothing else", () => {
    expect(doneSchema.safeParse({}).success).toBe(true);
    expect(doneSchema.safeParse({ doneOn: "2026-03-08" }).success).toBe(true);
    for (const bad of [{ doneOn: "2026-02-30" }, { doneOn: "8 Maret" }, { doneOn: 5 }, { extra: 1 }]) {
      expect(doneSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("reschedule: a real due date is required", () => {
    expect(rescheduleSchema.safeParse({ dueDate: "2026-03-10" }).success).toBe(true);
    for (const bad of [{}, { dueDate: "" }, { dueDate: "2026-13-01" }]) {
      expect(rescheduleSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe.skipIf(!url)("pickups (database)", () => {
  const fx = dbFixtures(url ?? "postgres://unused");
  const db = fx.d as unknown as Database;
  let pkA: string;
  let pkB: string;
  let nurseA: string;
  let nurseB: string;
  const cookie: Record<string, string> = {};
  let doneRoute: { POST: Handler2 };
  let patchRoute: { PATCH: Handler2 };
  let familyRoute: { GET: Handler };
  let tokens: typeof import("@/lib/family-token");
  let patientsService: typeof import("@/lib/patients/service");

  const openOf = async (patientId: string) =>
    fx.d.select().from(schema.pickups).where(and(eq(schema.pickups.patientId, patientId), isNull(schema.pickups.doneAt)));
  const allOf = async (patientId: string) => fx.d.select().from(schema.pickups).where(eq(schema.pickups.patientId, patientId));

  const ctx = (id: string, pickupId: string): Ctx2 => ({ params: Promise.resolve({ id, pickupId }) });
  const post = (patientId: string, pickupId: string, who: string | null, body?: unknown, bearer?: string) =>
    doneRoute.POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(who ? { cookie: cookie[who] } : {}),
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ctx(patientId, pickupId),
    );
  const patch = (patientId: string, pickupId: string, who: string | null, body: unknown) =>
    patchRoute.PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(who ? { cookie: cookie[who] } : {}) },
        body: JSON.stringify(body),
      }),
      ctx(patientId, pickupId),
    );
  const familyGet = (token: string | null) =>
    familyRoute.GET(new Request("http://localhost/api/family/pickup", { headers: token ? { authorization: `Bearer ${token}` } : {} }));

  /** A patient with an open pickup due `dueOffset` days from today. */
  async function patientWithPickup(dueOffset: number, over: Partial<typeof schema.patients.$inferInsert> = {}, puskesmasId = pkA) {
    const token = tokens.generateFamilyToken();
    const p = await fx.patient(puskesmasId, {
      startDate: iso(-60),
      pickupIntervalDays: 7,
      familyTokenHash: tokens.hashFamilyToken(token),
      ...over,
    });
    const [pickup] = await fx.d.insert(schema.pickups).values({ patientId: p.id, dueDate: iso(dueOffset) }).returning();
    return { patient: p, pickup, token };
  }

  beforeAll(async () => {
    tokens = await import("@/lib/family-token");
    patientsService = await import("@/lib/patients/service");
    const { createSession } = await import("@/lib/auth/session");
    pkA = (await fx.puskesmas("A")).id;
    pkB = (await fx.puskesmas("B")).id;
    nurseA = (await fx.nurse(pkA)).id;
    nurseB = (await fx.nurse(pkB)).id;
    cookie.a = `session=${await createSession({ nurseId: nurseA, puskesmasId: pkA }, SECRET)}`;
    cookie.b = `session=${await createSession({ nurseId: nurseB, puskesmasId: pkB }, SECRET)}`;
    doneRoute = await import("@/app/api/nurse/patients/[id]/pickups/[pickupId]/done/route");
    patchRoute = await import("@/app/api/nurse/patients/[id]/pickups/[pickupId]/route");
    familyRoute = await import("@/app/api/family/pickup/route");
  });

  afterAll(() => fx.cleanup());

  describe("schedule storage (2.1, 2.2, 2.3)", () => {
    it("a second open pickup for one patient is refused by the database (2.1)", async () => {
      const { patient } = await patientWithPickup(5);
      await expect(fx.d.insert(schema.pickups).values({ patientId: patient.id, dueDate: iso(9) })).rejects.toThrow();
      // A closed pickup next to an open one is fine.
      await fx.d.insert(schema.pickups).values({ patientId: patient.id, dueDate: iso(-9), doneAt: new Date() });
      expect(await openOf(patient.id)).toHaveLength(1);
    });

    it("registration creates exactly one open pickup at the expected date (2.2)", async () => {
      const session = { nurseId: nurseA, puskesmasId: pkA };
      const now = new Date();
      const input = (code: string, startDate: string, interval: number) => ({
        code: `${fx.tag}-${code}`.slice(0, 20),
        startDate,
        phase: "intensive" as const,
        pickupIntervalDays: interval,
        pmoPhone: null,
      });
      const fresh = await patientsService.createPatient(db, session, input("N1", today(), 7), PEPPER, now);
      expect(fresh.patient).toMatchObject({ nextPickupDue: iso(7), pickupState: "upcoming" });
      expect(await openOf(fresh.patient.id)).toHaveLength(1);
      expect((await openOf(fresh.patient.id))[0].dueDate).toBe(iso(7));

      // Registered mid-treatment: the next multiple of the interval from the start date.
      const late = await patientsService.createPatient(db, session, input("N2", iso(-19), 7), PEPPER, now);
      expect(late.patient.nextPickupDue).toBe(iso(-19 + 21));
      expect(await openOf(late.patient.id)).toHaveLength(1);
    });

    it("createFirstPickup does nothing when an open pickup exists", async () => {
      const { patient } = await patientWithPickup(3);
      await createFirstPickup(db, patient, today());
      expect(await openOf(patient.id)).toHaveLength(1);
    });

    it("backfill creates a pickup for patients without one and creates no duplicates when run twice (2.3)", async () => {
      const own = (await fx.puskesmas("backfill")).id; // its own Puskesmas: other tests' patients stay out of it
      const lonely = await fx.patient(own, { startDate: iso(-20), pickupIntervalDays: 7 });
      const covered = await patientWithPickup(2, {}, own);
      const first = await backfillPickups(db, new Date(), own);
      expect(first).toBe(1);
      const pickups = await openOf(lonely.id);
      expect(pickups).toHaveLength(1);
      expect(pickups[0].dueDate).toBe(iso(-20 + 21));
      const second = await backfillPickups(db, new Date(), own);
      expect(second).toBe(0);
      expect(await allOf(lonely.id)).toHaveLength(1);
      expect(await openOf(covered.patient.id)).toHaveLength(1);
    });
  });

  describe("POST .../pickups/[pickupId]/done (3.1, 3.2)", () => {
    it("marks done today by default and schedules the next one interval days later; audited", async () => {
      const { patient, pickup } = await patientWithPickup(0);
      const res = await post(patient.id, pickup.id, "a", {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyDone).toBe(false);
      expect(body.next).toMatchObject({ dueDate: iso(7), state: "upcoming" });

      const [stored] = await fx.d.select().from(schema.pickups).where(eq(schema.pickups.id, pickup.id));
      expect(stored.doneAt).toBeInstanceOf(Date);
      const open = await openOf(patient.id);
      expect(open).toHaveLength(1);
      expect(open[0].dueDate).toBe(iso(7));

      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `pickup:${pickup.id}`));
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ actor: `nurse:${nurseA}`, action: "pickup.done" });
    });

    it("accepts no body at all, and a backdated completion schedules from that day", async () => {
      const a = await patientWithPickup(1);
      expect((await post(a.patient.id, a.pickup.id, "a")).status).toBe(200);
      expect((await openOf(a.patient.id))[0].dueDate).toBe(iso(7));

      const b = await patientWithPickup(-2);
      const res = await post(b.patient.id, b.pickup.id, "a", { doneOn: iso(-1) });
      expect(res.status).toBe(200);
      expect((await openOf(b.patient.id))[0].dueDate).toBe(iso(-1 + 7));
    });

    it("done late and done early follow the done date, not the old due date", async () => {
      const late = await patientWithPickup(-2);
      await post(late.patient.id, late.pickup.id, "a", { doneOn: today() });
      expect((await openOf(late.patient.id))[0].dueDate).toBe(iso(7));
      const early = await patientWithPickup(2);
      await post(early.patient.id, early.pickup.id, "a", { doneOn: iso(0) });
      expect((await openOf(early.patient.id))[0].dueDate).toBe(iso(7));
    });

    it("rejects a future date, a date before the start and a malformed date; the pickup stays open", async () => {
      const { patient, pickup } = await patientWithPickup(1, { startDate: iso(-30) });
      const future = await post(patient.id, pickup.id, "a", { doneOn: iso(1) });
      expect(future.status).toBe(400);
      expect((await future.json()).fields.doneOn).toMatch(/masa depan/);
      expect((await post(patient.id, pickup.id, "a", { doneOn: iso(-31) })).status).toBe(400);
      expect((await post(patient.id, pickup.id, "a", { doneOn: "kemarin" })).status).toBe(400);
      expect((await openOf(patient.id))[0].id).toBe(pickup.id);
      expect(await allOf(patient.id)).toHaveLength(1);
    });

    it("a double submission leaves exactly one new open pickup", async () => {
      const { patient, pickup } = await patientWithPickup(0);
      const [one, two] = await Promise.all([post(patient.id, pickup.id, "a", {}), post(patient.id, pickup.id, "a", {})]);
      expect([one.status, two.status]).toEqual([200, 200]);
      const flags = [(await one.json()).alreadyDone, (await two.json()).alreadyDone].sort();
      expect(flags).toEqual([false, true]);
      expect(await openOf(patient.id)).toHaveLength(1);
      expect(await allOf(patient.id)).toHaveLength(2);
      const third = await post(patient.id, pickup.id, "a", {});
      expect((await third.json()).alreadyDone).toBe(true);
      expect(await allOf(patient.id)).toHaveLength(2);
    });

    it("rejects another Puskesmas, mismatched ids, an unknown pickup and an anonymous caller", async () => {
      const { patient, pickup } = await patientWithPickup(0);
      const other = await patientWithPickup(0);
      expect((await post(patient.id, pickup.id, "b", {})).status).toBe(404);
      expect((await post(patient.id, other.pickup.id, "a", {})).status).toBe(404); // pickup of another patient
      expect((await post(patient.id, crypto.randomUUID(), "a", {})).status).toBe(404);
      expect((await post("x", "y", "a", {})).status).toBe(404);
      expect((await post(patient.id, pickup.id, null, {})).status).toBe(401);
      const [stored] = await fx.d.select().from(schema.pickups).where(eq(schema.pickups.id, pickup.id));
      expect(stored.doneAt).toBeNull();
    });

    it("a family link token cannot mark a pickup done (3.2)", async () => {
      const { patient, pickup, token } = await patientWithPickup(0);
      const res = await post(patient.id, pickup.id, null, {}, token);
      expect(res.status).toBe(401);
      const [stored] = await fx.d.select().from(schema.pickups).where(eq(schema.pickups.id, pickup.id));
      expect(stored.doneAt).toBeNull();
    });
  });

  describe("PATCH .../pickups/[pickupId] (3.3)", () => {
    it("moves the due date of an open pickup and audits from and to", async () => {
      const { patient, pickup } = await patientWithPickup(2);
      const res = await patch(patient.id, pickup.id, "a", { dueDate: iso(4) });
      expect(res.status).toBe(200);
      expect((await res.json()).pickup).toMatchObject({ dueDate: iso(4), state: "upcoming", daysUntil: 4 });
      expect((await openOf(patient.id))[0].dueDate).toBe(iso(4));
      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `pickup:${pickup.id}`));
      expect(log[0]).toMatchObject({ actor: `nurse:${nurseA}`, action: "pickup.reschedule", metaJson: expect.objectContaining({ from: iso(2), to: iso(4) }) });
    });

    it("refuses a pickup that is already done (409), a date out of range (400), other Puskesmas and bad input", async () => {
      const { patient, pickup } = await patientWithPickup(0);
      await post(patient.id, pickup.id, "a", {});
      const closed = await patch(patient.id, pickup.id, "a", { dueDate: iso(3) });
      expect(closed.status).toBe(409);
      expect((await closed.json()).error).toBe("closed");

      const open = await patientWithPickup(2, { startDate: iso(-30) });
      expect((await patch(open.patient.id, open.pickup.id, "a", { dueDate: iso(-31) })).status).toBe(400);
      expect((await patch(open.patient.id, open.pickup.id, "a", { dueDate: iso(400) })).status).toBe(400);
      expect((await patch(open.patient.id, open.pickup.id, "a", { dueDate: "nope" })).status).toBe(400);
      expect((await patch(open.patient.id, open.pickup.id, "b", { dueDate: iso(3) })).status).toBe(404);
      expect((await patch(open.patient.id, open.pickup.id, null, { dueDate: iso(3) })).status).toBe(401);
      expect((await openOf(open.patient.id))[0].dueDate).toBe(iso(2));
    });

    it("a past due date is allowed within the treatment: the pickup is then missed", async () => {
      const { patient, pickup } = await patientWithPickup(2);
      const res = await patch(patient.id, pickup.id, "a", { dueDate: iso(-1) });
      expect((await res.json()).pickup).toMatchObject({ state: "missed", daysOverdue: 1 });
    });
  });

  describe("interval change (3.4) and patient list (3.5)", () => {
    it("changing the interval keeps the open due date and applies to the next pickup", async () => {
      const { patient, pickup } = await patientWithPickup(3, { pickupIntervalDays: 7 });
      const session = { nurseId: nurseA, puskesmasId: pkA };
      const updated = await patientsService.updatePatient(db, session, patient.id, { pickupIntervalDays: 14 });
      expect(updated?.nextPickupDue).toBe(iso(3));
      expect((await openOf(patient.id))[0].dueDate).toBe(iso(3));
      await post(patient.id, pickup.id, "a", { doneOn: today() });
      expect((await openOf(patient.id))[0].dueDate).toBe(iso(14));
    });

    it("the nurse list shows next due, state and days overdue (a pickup 3 days overdue)", async () => {
      const overdue = await patientWithPickup(-3);
      const soon = await patientWithPickup(2);
      const none = await fx.patient(pkA);
      const list = await patientsService.listPatients(db, { nurseId: nurseA, puskesmasId: pkA });
      const byId = new Map(list.map((p) => [p.id, p]));
      expect(byId.get(overdue.patient.id)).toMatchObject({
        pickupId: overdue.pickup.id,
        nextPickupDue: iso(-3),
        pickupState: "missed",
        daysOverdue: 3,
      });
      expect(byId.get(soon.patient.id)).toMatchObject({ pickupState: "nudge", daysOverdue: 0, nextPickupDue: iso(2) });
      expect(byId.get(none.id)).toMatchObject({ pickupId: null, nextPickupDue: null, pickupState: null, daysOverdue: 0 });
    });

    it("getPatient carries the pickup as well", async () => {
      const { patient } = await patientWithPickup(0);
      const view = await patientsService.getPatient(db, { nurseId: nurseA, puskesmasId: pkA }, patient.id);
      expect(view).toMatchObject({ pickupState: "due_today", nextPickupDue: iso(0) });
    });
  });

  describe("GET /api/family/pickup (4.1)", () => {
    it("returns the countdown, state and Puskesmas contact, and audits pickup.read", async () => {
      const { patient, pickup, token } = await patientWithPickup(5);
      const res = await familyGet(token);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = await res.json();
      expect(body.pickup).toEqual({ dueDate: iso(5), daysUntil: 5, state: "upcoming", daysOverdue: 0 });
      expect(body.contact.phone).toBe("021-555-0100");
      expect(JSON.stringify(body)).not.toMatch(/patient|hash/i);
      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `family:${patient.id}`));
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ action: "pickup.read", target: `pickup:${pickup.id}` });
    });

    it.each([
      [2, "nudge", 2, 0],
      [1, "nudge", 1, 0],
      [0, "due_today", 0, 0],
      [-3, "missed", -3, 3],
    ])("due in %i days -> %s", async (offset, state, days, overdue) => {
      const { token } = await patientWithPickup(offset);
      const body = await (await familyGet(token)).json();
      expect(body.pickup).toMatchObject({ state, daysUntil: days, daysOverdue: overdue });
    });

    it("a patient with no pickup scheduled gets `pickup: null`", async () => {
      const token = tokens.generateFamilyToken();
      await fx.patient(pkA, { familyTokenHash: tokens.hashFamilyToken(token) });
      const body = await (await familyGet(token)).json();
      expect(body.pickup).toBeNull();
      expect(body.contact.name).toContain(fx.tag);
    });

    it("rejects a revoked, unknown or missing token with the same 404, and a missing consent with 403", async () => {
      const revoked = await patientWithPickup(5, { tokenRevokedAt: new Date() });
      const res = await familyGet(revoked.token);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
      expect((await familyGet(tokens.generateFamilyToken())).status).toBe(404);
      expect((await familyGet(null)).status).toBe(404);
      const noConsent = await patientWithPickup(5, { consentAt: null });
      const denied = await familyGet(noConsent.token);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "consent_required" });
    });
  });

  describe("risk integration (6.1, 6.2)", () => {
    async function scoreFor(patientId: string, asOf = today()) {
      const { buildRiskSnapshot } = await import("@/lib/risk/snapshotDb");
      const { scoreRisk } = await import("@/lib/risk/score");
      const { loadRiskPointsFromDir } = await import("@/lib/risk/points");
      return scoreRisk(await buildRiskSnapshot(db as never, patientId, asOf), loadRiskPointsFromDir());
    }

    it("a patient scoring 2 scores 6 once the pickup is missed, and 2 again after it is marked done", async () => {
      const { patient, pickup } = await patientWithPickup(0);
      await fx.checkin(patient.id, { occurredOn: today(), doseStatus: "no", createdAt: new Date() });
      expect((await scoreFor(patient.id)).score).toBe(2); // due today: not missed

      const tomorrow = iso(1);
      const missed = await scoreFor(patient.id, tomorrow);
      // On the next day the check-in is a day old, so only the pickup differs from a plain "2".
      expect(missed.reasons.map((r) => r.factor)).toContain("missed_pickup");
      expect(missed.reasons.find((r) => r.factor === "missed_pickup")?.points).toBe(4);

      await patchRoute.PATCH(
        new Request("http://localhost/x", { method: "PATCH", headers: { cookie: cookie.a, "content-type": "application/json" }, body: JSON.stringify({ dueDate: iso(-1) }) }),
        ctx(patient.id, pickup.id),
      );
      const now = await scoreFor(patient.id);
      expect(now.score).toBe(6);
      expect(now.reasons.map((r) => r.factor)).toEqual(["missed_dose_today", "missed_pickup"]);

      await post(patient.id, pickup.id, "a", {});
      const after = await scoreFor(patient.id);
      expect(after.score).toBe(2);
      expect(after.reasons.map((r) => r.factor)).toEqual(["missed_dose_today"]);
    });

    it("a pickup due today adds no points", async () => {
      const { patient } = await patientWithPickup(0);
      await fx.checkin(patient.id, { occurredOn: today(), createdAt: new Date() });
      expect((await scoreFor(patient.id)).score).toBe(0);
    });
  });
});
