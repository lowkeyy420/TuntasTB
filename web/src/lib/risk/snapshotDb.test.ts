import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { buildRiskSnapshot, type RiskDb } from "./snapshotDb";
import { mergeMoodFlags } from "./mood";

// Database-backed: runs only when TEST_DATABASE_URL points at a migrated Postgres.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("buildRiskSnapshot (database)", () => {
  const client = postgres(url ?? "postgres://unused", { max: 2 });
  const db = drizzle(client, { schema }) as RiskDb;
  let puskesmasId: string;
  const patientIds: Record<string, string> = {};

  const d = (n: number) => `2026-03-${String(n).padStart(2, "0")}`;
  const at = (n: number, hour = 9) => new Date(`2026-03-${String(n).padStart(2, "0")}T0${hour}:00:00Z`);

  async function newPatient(label: string, over: Partial<typeof schema.patients.$inferInsert> = {}) {
    const [p] = await db
      .insert(schema.patients)
      .values({
        puskesmasId,
        code: `RISK-${label}-${Math.random().toString(36).slice(2, 8)}`,
        startDate: d(1),
        phase: "intensive",
        pmoContactHash: "hash",
        createdAt: at(1),
        ...over,
      })
      .returning();
    patientIds[label] = p.id;
    return p.id;
  }

  async function addCheckin(
    patientId: string,
    day: number,
    dose: string,
    over: Partial<typeof schema.checkins.$inferInsert> = {},
  ) {
    await db.insert(schema.checkins).values({
      patientId,
      clientId: `c-${day}-${Math.random().toString(36).slice(2, 8)}`,
      occurredOn: d(day),
      doseStatus: dose,
      symptomsJson: [],
      triageLevel: "GREEN",
      createdAt: at(day),
      ...over,
    });
  }

  beforeAll(async () => {
    const [p] = await db
      .insert(schema.puskesmas)
      .values({ name: `Risk test ${Math.random().toString(36).slice(2, 8)}`, phone: "021-000" })
      .returning();
    puskesmasId = p.id;
  });

  afterAll(async () => {
    await db.delete(schema.puskesmas).where(eq(schema.puskesmas.id, puskesmasId)); // cascades
    await client.end();
  });

  it("consecutive misses stop at a taken dose and a day without a check-in breaks the run", async () => {
    const pid = await newPatient("runs");
    await addCheckin(pid, 6, "no");
    await addCheckin(pid, 7, "yes");
    await addCheckin(pid, 8, "no");
    await addCheckin(pid, 9, "no");
    const today = {
      doseStatus: "no" as const,
      moodFlags: { stopIntent: false, stigma: false },
      symptomCodes: [],
      level: "GREEN" as const,
    };
    expect((await buildRiskSnapshot(db, pid, d(10), today)).consecutiveMissedBefore).toBe(2);

    const pid2 = await newPatient("gap");
    await addCheckin(pid2, 8, "no"); // day 9 missing
    expect((await buildRiskSnapshot(db, pid2, d(10), today)).consecutiveMissedBefore).toBe(0);
  });

  it("uses the latest check-in of each calendar day", async () => {
    const pid = await newPatient("latest");
    await addCheckin(pid, 9, "no", { createdAt: at(9, 1) });
    await addCheckin(pid, 9, "yes", { createdAt: at(9, 8) }); // later the same day
    const snap = await buildRiskSnapshot(db, pid, d(10));
    expect(snap.doseStatus).toBe("yes");
  });

  it("persistence: 7-day run, reset after a gap", async () => {
    const pid = await newPatient("persist");
    for (const n of [4, 5, 6, 7, 8, 9]) await addCheckin(pid, n, "yes", { symptomsJson: ["nausea_mild"] });
    const today = {
      doseStatus: "yes" as const,
      moodFlags: mergeMoodFlags({ stopIntent: false, stigma: false }, []),
      symptomCodes: ["nausea_mild"],
      level: "GREEN" as const,
    };
    expect((await buildRiskSnapshot(db, pid, d(10), today)).maxPersistenceDays).toBe(7);

    const pid2 = await newPatient("persist-gap");
    await addCheckin(pid2, 4, "yes", { symptomsJson: ["nausea_mild"] });
    await addCheckin(pid2, 5, "yes", { symptomsJson: [] });
    await addCheckin(pid2, 6, "yes", { symptomsJson: { chips: ["nausea_mild"] } });
    await addCheckin(pid2, 7, "yes", { symptomsJson: [{ code: "nausea_mild" }] });
    expect((await buildRiskSnapshot(db, pid2, d(8), today)).maxPersistenceDays).toBe(3);
  });

  it("silence: 2 days vs 3 days, and a patient registered 4 days ago who never checked in", async () => {
    const pid = await newPatient("silence");
    await addCheckin(pid, 7, "yes");
    expect((await buildRiskSnapshot(db, pid, d(9))).daysSinceLastCheckin).toBe(2);
    expect((await buildRiskSnapshot(db, pid, d(10))).daysSinceLastCheckin).toBe(3);

    const never = await newPatient("never", { createdAt: at(6) });
    const snap = await buildRiskSnapshot(db, never, d(10));
    expect(snap).toMatchObject({ doseStatus: null, level: null, daysSinceLastCheckin: 4 });
  });

  it("PMO presence and missed pickup", async () => {
    const withPmo = await newPatient("pmo");
    const noPmo = await newPatient("nopmo", { pmoContactHash: null });
    await db.insert(schema.pickups).values([
      { patientId: noPmo, dueDate: d(5) }, // passed, not done
      { patientId: withPmo, dueDate: d(5), doneAt: at(5) }, // done
    ]);
    const a = await buildRiskSnapshot(db, withPmo, d(8));
    const b = await buildRiskSnapshot(db, noPmo, d(8));
    expect([a.hasPmo, a.missedPickup]).toEqual([true, false]);
    expect([b.hasPmo, b.missedPickup]).toEqual([false, true]);
  });

  it("two evaluation dates over the same history differ only in the date-dependent factors", async () => {
    const pid = await newPatient("dates");
    await addCheckin(pid, 6, "no", { triageLevel: "YELLOW", textRedacted: "mau berhenti" });
    await db.insert(schema.pickups).values({ patientId: pid, dueDate: d(8) });
    const early = await buildRiskSnapshot(db, pid, d(7));
    const late = await buildRiskSnapshot(db, pid, d(12));
    const strip = (s: typeof early) => ({ ...s, daysSinceLastCheckin: 0, missedPickup: false });
    expect(strip(early)).toEqual(strip(late));
    expect([early.daysSinceLastCheckin, early.missedPickup]).toEqual([1, false]);
    expect([late.daysSinceLastCheckin, late.missedPickup]).toEqual([6, true]);
    expect(early.stopIntent).toBe(true);
    expect(early.level).toBe("YELLOW");
  });

  it("maps an unrecognised stored triage level to null and rejects an unknown patient", async () => {
    const pid = await newPatient("oddlevel");
    await addCheckin(pid, 5, "yes", { triageLevel: null });
    expect((await buildRiskSnapshot(db, pid, d(6))).level).toBeNull();
    await expect(
      buildRiskSnapshot(db, "00000000-0000-0000-0000-000000000000", d(6)),
    ).rejects.toThrow(/patient not found/);
  });
});
