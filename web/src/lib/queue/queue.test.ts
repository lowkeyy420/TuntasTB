import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { dbFixtures } from "@/test-utils/dbFixtures";
import type { Database } from "@/lib/db";
import { buildQueue } from "./build";
import { internalQueue, nurseQueue } from "./service";

// Database-backed: runs only when TEST_DATABASE_URL points at a migrated Postgres.
const url = process.env.TEST_DATABASE_URL;

const ASOF = "2026-03-20";
const day = (offset: number) => new Date(Date.parse(`${ASOF}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)("buildQueue (database)", () => {
  let queries = 0;
  const fx = dbFixtures(url ?? "postgres://unused", () => queries++);
  const db = fx.d as unknown as Database;
  afterAll(() => fx.cleanup());

  const nausea = { chips: ["nausea_mild"], symptoms: ["nausea_mild"], unknown: [] };

  async function patient(pk: string, code: string, over: Partial<typeof schema.patients.$inferInsert> = {}) {
    return fx.patient(pk, { code: `${fx.tag}-${code}`.slice(0, 20), createdAt: new Date(`${day(-60)}T02:00:00Z`), ...over });
  }

  it("ranks higher risk first, breaks ties by recency, and lists never-reported patients last", async () => {
    const pk = await fx.puskesmas();
    const a = await patient(pk.id, "A"); // missed 3 days in a row: 2 + 2*2 = 6
    for (const o of [-1, -2, -3]) await fx.checkin(a.id, { occurredOn: day(o), doseStatus: "no" });
    const b = await patient(pk.id, "B"); // missed one day: 2
    await fx.checkin(b.id, { occurredOn: day(-1), doseStatus: "no" });
    const c = await patient(pk.id, "C"); // tie at 2, checked in more recently than B
    await fx.checkin(c.id, { occurredOn: day(-1), doseStatus: "no", createdAt: new Date(`${day(-1)}T10:00:00Z`) });
    const f = await patient(pk.id, "F"); // score 0, reported
    await fx.checkin(f.id, { occurredOn: day(-1) });
    const e = await patient(pk.id, "E"); // score 0, never reported (registered today)
    await fx.d.update(schema.patients).set({ createdAt: new Date(`${ASOF}T02:00:00Z`) }).where(eq(schema.patients.id, e.id));

    const entries = await buildQueue(db, pk.id, ASOF);
    expect(entries.map((x) => [x.code.split("-")[1], x.score])).toEqual([
      ["A", 6],
      ["C", 2],
      ["B", 2],
      ["F", 0],
      ["E", 0],
    ]);
    expect(entries[4].latestCheckinAt).toBeNull();
    expect(entries[4].reason).toBe("Belum pernah lapor.");
    expect(entries[3].reason).toBe("Tidak ada keluhan atau tanda risiko.");
  });

  it("falls back to the code when score and recency tie", async () => {
    const pk = await fx.puskesmas();
    const same = new Date(`${day(-1)}T10:00:00Z`);
    for (const code of ["Z", "M"]) {
      const p = await patient(pk.id, code);
      await fx.checkin(p.id, { occurredOn: day(-1), createdAt: same });
    }
    expect((await buildQueue(db, pk.id, ASOF)).map((x) => x.code.split("-")[1])).toEqual(["M", "Z"]);
  });

  it("a patient silent for 3 days whose last check-in scored 2 now scores 5", async () => {
    const pk = await fx.puskesmas();
    const p = await patient(pk.id, "S");
    await fx.checkin(p.id, { occurredOn: day(-3), doseStatus: "no" });
    const [entry] = await buildQueue(db, pk.id, ASOF);
    expect(entry.score).toBe(5);
    expect(entry.reasons.map((r) => r.factor)).toEqual(["missed_dose_today", "no_checkin"]);
    expect(entry.reasons[1].text).toBe("Tidak ada laporan selama 3 hari");
    expect(entry.suggestedAction).toBe("visit");
    expect(entry.daysSinceLastCheckin).toBe(3);
  });

  it("uses the last check-in even when it is older than the 14-day window", async () => {
    const pk = await fx.puskesmas();
    const p = await patient(pk.id, "OLD");
    await fx.checkin(p.id, { occurredOn: day(-30) });
    const [entry] = await buildQueue(db, pk.id, ASOF);
    expect(entry.daysSinceLastCheckin).toBe(30);
    expect(entry.reasons.map((r) => r.text)).toContain("Tidak ada laporan selama 30 hari");
    expect(entry.latestCheckinAt).not.toBeNull();
  });

  it("scores the effective level: a nurse override replaces the stored one", async () => {
    const pk = await fx.puskesmas();
    const p = await patient(pk.id, "OV");
    await fx.checkin(p.id, { occurredOn: day(-1), triageLevel: "YELLOW", overrideLevel: "RED", overrideNote: "Keluarga bilang kulit kuning" });
    const [entry] = await buildQueue(db, pk.id, ASOF);
    expect(entry.level).toBe("RED");
    expect(entry.overridden).toBe(true);
    expect(entry.reasons.map((r) => r.factor)).toEqual(["red_today"]);
    expect(entry.score).toBe(5);
  });

  it("reproduces the demo morning: the day 41 patient is first with 7 days of nausea and 'sudah sembuh'", async () => {
    const pk = await fx.puskesmas();
    const dimas = await patient(pk.id, "D41", { startDate: day(-41) }); // yesterday was day 41... today is day 42
    for (let o = -7; o <= -1; o++) {
      await fx.checkin(dimas.id, {
        occurredOn: day(o),
        symptomsJson: nausea,
        triageLevel: o === -1 ? "YELLOW" : "GREEN",
        textRedacted: o === -1 ? "mual terus seminggu, katanya sudah sembuh, mau berhenti" : null,
      });
    }
    for (const code of ["L1", "L2", "L3"]) {
      const p = await patient(pk.id, code);
      await fx.checkin(p.id, { occurredOn: day(-1) });
    }
    const entries = await buildQueue(db, pk.id, ASOF);
    const first = entries[0];
    expect(first.code).toContain("D41");
    expect([first.score, first.band, first.level]).toEqual([8, "high", "YELLOW"]);
    expect(first.reasons.map((r) => [r.factor, r.points])).toEqual([
      ["stop_intent", 4],
      ["unresolved_side_effect", 3],
      ["yellow_today", 1],
    ]);
    expect(first.reason).toContain("mual 7 hari");
    expect(first.reason).toContain("sudah sembuh");
    expect(first.suggestedAction).toBe("call");
    expect(entries.slice(1).every((x) => x.score === 0)).toBe(true);
  });

  it("prefers the stored one-liner while factors match, and rebuilds it when they changed", async () => {
    const pk = await fx.puskesmas();
    const same = await patient(pk.id, "ST");
    await fx.checkin(same.id, {
      occurredOn: day(-1),
      doseStatus: "no",
      nurseLine: "kalimat tersimpan",
      riskReasonsJson: [{ factor: "missed_dose_today", points: 2, text: "x" }],
    });
    const changed = await patient(pk.id, "CH");
    await fx.checkin(changed.id, {
      occurredOn: day(-4),
      doseStatus: "no",
      nurseLine: "kalimat lama",
      riskReasonsJson: [{ factor: "missed_dose_today", points: 2, text: "x" }],
    });
    const stored = Object.fromEntries((await buildQueue(db, pk.id, ASOF)).map((e) => [e.code.split("-")[1], e.reason]));
    expect(stored.ST).toBe("kalimat tersimpan");
    expect(stored.CH).toBe("tidak minum obat hari ini + tidak lapor 4 hari");
    const det = Object.fromEntries(
      (await buildQueue(db, pk.id, ASOF, { reasonSource: "deterministic" })).map((e) => [e.code.split("-")[1], e.reason]),
    );
    expect(det.ST).toBe("tidak minum obat hari ini");
  });

  it("raises a patient with a missed pickup", async () => {
    const pk = await fx.puskesmas();
    const p = await patient(pk.id, "PK");
    await fx.checkin(p.id, { occurredOn: day(-1) });
    await fx.d.insert(schema.pickups).values({ patientId: p.id, dueDate: day(-2) });
    const [entry] = await buildQueue(db, pk.id, ASOF);
    expect([entry.score, entry.suggestedAction]).toEqual([4, "earlyPickup"]);
    expect(entry.reason).toBe("jadwal ambil obat terlewat");
  });

  it("returns an empty queue for a Puskesmas without patients", async () => {
    const pk = await fx.puskesmas();
    expect(await buildQueue(db, pk.id, ASOF)).toEqual([]);
  });

  it("never lists a patient of another Puskesmas", async () => {
    const one = await fx.puskesmas();
    const two = await fx.puskesmas();
    await patient(one.id, "X1");
    await patient(two.id, "X2");
    expect((await buildQueue(db, one.id, ASOF)).map((e) => e.code.split("-")[1])).toEqual(["X1"]);
  });

  it("reads a fixed number of times however many patients there are (nurse-queue 1.1)", async () => {
    const small = await fx.puskesmas();
    const large = await fx.puskesmas();
    for (let i = 0; i < 2; i++) {
      const p = await patient(small.id, `Q${i}`);
      if (i === 0) await fx.checkin(p.id, { occurredOn: day(-1) }); // one reports, one is quiet, as in `large`
    }
    for (let i = 0; i < 12; i++) {
      const p = await patient(large.id, `R${i}`);
      if (i % 2 === 0) await fx.checkin(p.id, { occurredOn: day(-1) });
      if (i % 3 === 0) await fx.d.insert(schema.pickups).values({ patientId: p.id, dueDate: day(-1) });
    }
    queries = 0;
    await buildQueue(db, small.id, ASOF);
    const forSmall = queries;
    queries = 0;
    await buildQueue(db, large.id, ASOF);
    const forLarge = queries;
    expect(forSmall).toBe(forLarge);
    expect(forLarge).toBeLessThanOrEqual(4);
  });
});

describe.skipIf(!url)("queue services (database)", () => {
  const fx = dbFixtures(url ?? "postgres://unused");
  const db = fx.d as unknown as Database;
  afterAll(() => fx.cleanup());
  const now = new Date(`${ASOF}T01:00:00Z`); // 08.00 WIB

  it("the nurse queue is scoped to the session's Puskesmas and audited as queue.read", async () => {
    const mine = await fx.puskesmas();
    const other = await fx.puskesmas();
    const nurse = await fx.nurse(mine.id);
    const p = await fx.patient(mine.id, { code: `${fx.tag}-MINE`.slice(0, 20) });
    await fx.patient(other.id, { code: `${fx.tag}-OTHER`.slice(0, 20) });
    await fx.checkin(p.id, { occurredOn: day(-1), doseStatus: "no", createdAt: new Date(`${day(-1)}T12:20:00Z`) });

    const res = await nurseQueue(db, { nurseId: nurse.id, puskesmasId: mine.id }, now);
    expect(res.date).toBe(ASOF);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ code: `${fx.tag}-MINE`.slice(0, 20), score: 2, action: "call", lastCheckin: "kemarin 19.20" });
    expect(res.entries[0].factors).toEqual([{ text: "Tidak minum obat hari ini", points: 2 }]);

    const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `nurse:${nurse.id}`));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "queue.read", target: mine.id, metaJson: { count: 1 } });
  });

  it("the internal queue carries no free text, ids or contact, ranks entries and audits as system:internal", async () => {
    const pk = await fx.puskesmas();
    const p = await fx.patient(pk.id, { code: `${fx.tag}-INT`.slice(0, 20), pmoContactHash: "SECRET-HASH" });
    await fx.checkin(p.id, {
      occurredOn: day(-1),
      textRedacted: "catatan rahasia keluarga",
      nurseLine: "kalimat tersimpan rahasia",
      familyMessage: "pesan keluarga",
      triageLevel: "YELLOW",
      riskReasonsJson: [{ factor: "yellow_today", points: 1, text: "x" }],
    });
    const res = await internalQueue(db, pk.id, ASOF);
    expect(res).toMatchObject({ puskesmas_id: pk.id, date: ASOF });
    expect(res.entries).toEqual([
      {
        rank: 1,
        code: `${fx.tag}-INT`.slice(0, 20),
        treatment_day: 48,
        score: 1,
        band: "low",
        level: "YELLOW",
        reason: "Tidak ada keluhan atau tanda risiko.",
        suggested_action: "telepon",
      },
    ]);
    const text = JSON.stringify(res);
    for (const secret of ["rahasia", "SECRET-HASH", p.id, "pesan keluarga"]) expect(text).not.toContain(secret);
    const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, pk.id));
    expect(log.map((l) => [l.actor, l.action])).toEqual([["system:internal", "internal_queue.read"]]);
  });
});
