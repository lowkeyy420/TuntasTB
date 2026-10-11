import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRiskPoints, loadRiskPointsFromDir, RiskPointsError, validateRiskPoints } from "./points";
import { bandFor, scoreRisk } from "./score";
import { FACTOR_IDS, type RiskPoints, type RiskSnapshot } from "./types";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const raw = () => JSON.parse(readFileSync(`${RULES_DIR}/risk-points.json`, "utf8"));
const points = loadRiskPointsFromDir(RULES_DIR);

const BASE: RiskSnapshot = {
  doseStatus: "yes",
  consecutiveMissedBefore: 0,
  stopIntent: false,
  stigma: false,
  maxPersistenceDays: 0,
  level: "GREEN",
  missedPickup: false,
  hasPmo: true,
  daysSinceLastCheckin: 0,
};
const score = (over: Partial<RiskSnapshot>) => scoreRisk({ ...BASE, ...over }, points);

describe("point table", () => {
  it("point values equal the plan's list", () => {
    const f = points.factors;
    expect(f.missed_dose_today.points).toBe(2);
    expect(f.consecutive_missed_day).toMatchObject({ points: 2, cap: 10 });
    expect(f.partial_dose.points).toBe(1);
    expect(f.stop_intent.points).toBe(4);
    expect(f.stigma.points).toBe(2);
    expect(f.unresolved_side_effect).toMatchObject({ points: 3, min_days: 7 });
    expect(f.yellow_today.points).toBe(1);
    expect(f.red_today.points).toBe(5);
    expect(f.missed_pickup.points).toBe(4);
    expect(f.no_pmo.points).toBe(2);
    expect(f.no_checkin).toMatchObject({ points: 3, min_days: 3 });
    expect(Object.keys(f)).toEqual([...FACTOR_IDS]);
  });

  it("bands are 0-3 low, 4-7 medium, 8+ high", () => {
    expect(points.bands).toEqual([{ max: 3, band: "low" }, { max: 7, band: "medium" }, { band: "high" }]);
  });

  it("every factor has a Bahasa reason text, none naming the illness", () => {
    for (const id of FACTOR_IDS) {
      const text = points.factors[id].text_id;
      expect(text.length, id).toBeGreaterThan(5);
      expect(text, id).not.toMatch(/\b(TB|TBC|tuberkulosis|TuntasTB)\b/i);
    }
  });

  it("validates and rejects malformed tables", () => {
    expect(validateRiskPoints(raw())).toEqual([]);
    const cases: [string, (d: any) => void, string][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      ["missing version", (d) => delete d.version, "version"],
      ["missing factor", (d) => delete d.factors.no_pmo, "factors.no_pmo"],
      ["factors missing", (d) => delete d.factors, "factors.missed_dose_today"],
      ["negative points", (d) => (d.factors.stigma.points = -1), "stigma.points"],
      ["fractional points", (d) => (d.factors.stigma.points = 1.5), "stigma.points"],
      ["bad cap", (d) => (d.factors.consecutive_missed_day.cap = "x"), "cap"],
      ["missing min_days", (d) => delete d.factors.no_checkin.min_days, "no_checkin.min_days"],
      ["zero min_days", (d) => (d.factors.unresolved_side_effect.min_days = 0), "unresolved_side_effect.min_days"],
      ["blank text", (d) => (d.factors.red_today.text_id = " "), "red_today.text_id"],
      ["one band", (d) => (d.bands = [{ band: "high" }]), "minimal dua band"],
      ["bands not a list", (d) => (d.bands = {}), "minimal dua band"],
      ["unknown band", (d) => (d.bands[0].band = "x"), "bands[0].band"],
      ["band not an object", (d) => (d.bands[0] = 3), "bands[0].band"],
      ["last band with max", (d) => (d.bands[2].max = 99), "band terakhir"],
      ["non-increasing max", (d) => (d.bands[1].max = 3), "bands[1].max"],
      ["missing max", (d) => delete d.bands[0].max, "bands[0].max"],
    ];
    for (const [name, mutate, fragment] of cases) {
      const d = raw();
      mutate(d);
      const errors = validateRiskPoints(d);
      expect(errors.join("\n"), name).toContain(fragment);
      expect(() => loadRiskPoints(d), name).toThrow(RiskPointsError);
    }
    expect(validateRiskPoints(null)).toHaveLength(1);
    expect(validateRiskPoints([])).toHaveLength(1);
  });
});

describe("adherence points", () => {
  it("dose taken, no earlier misses: none", () => {
    expect(score({}).score).toBe(0);
  });
  it("missed today only: 2", () => {
    expect(score({ doseStatus: "no" }).score).toBe(2);
  });
  it("missed today and the two days before: 6", () => {
    expect(score({ doseStatus: "no", consecutiveMissedBefore: 2 }).score).toBe(6);
  });
  it("cap: today plus eight earlier days is 12, of which 10 are for the consecutive days", () => {
    const r = score({ doseStatus: "no", consecutiveMissedBefore: 8 });
    expect(r.score).toBe(12);
    expect(r.reasons.find((x) => x.factor === "consecutive_missed_day")?.points).toBe(10);
  });
  it("partial dose: 1", () => {
    expect(score({ doseStatus: "partial" }).score).toBe(1);
  });
  it("a table without a cap does not cap", () => {
    const uncapped: RiskPoints = JSON.parse(JSON.stringify(points));
    delete uncapped.factors.consecutive_missed_day.cap;
    expect(scoreRisk({ ...BASE, consecutiveMissedBefore: 8 }, uncapped).score).toBe(16);
  });
});

describe("word, side-effect, level and program points", () => {
  it("stop intent 4 and stigma 2, once each", () => {
    expect(score({ stopIntent: true }).score).toBe(4);
    expect(score({ stigma: true }).score).toBe(2);
    expect(score({ stopIntent: true, stigma: true }).score).toBe(6);
  });
  it("unresolved side effect: 3 once from 7 days; none below", () => {
    expect(score({ maxPersistenceDays: 7 }).score).toBe(3);
    expect(score({ maxPersistenceDays: 10 }).score).toBe(3);
    expect(score({ maxPersistenceDays: 3 }).score).toBe(0);
    expect(score({ maxPersistenceDays: 6 }).score).toBe(0);
  });
  it("YELLOW 1, RED 5 and none for YELLOW with RED; GREEN and null none", () => {
    expect(score({ level: "YELLOW" }).score).toBe(1);
    const red = score({ level: "RED" });
    expect(red.score).toBe(5);
    expect(red.reasons.map((r) => r.factor)).toEqual(["red_today"]);
    expect(score({ level: "GREEN" }).score).toBe(0);
    expect(score({ level: null }).score).toBe(0);
  });
  it("missed pickup 4, no PMO 2", () => {
    expect(score({ missedPickup: true }).score).toBe(4);
    expect(score({ hasPmo: false }).score).toBe(2);
  });
  it("silence: 3 from three days, none at two, also for a patient who never checked in", () => {
    expect(score({ daysSinceLastCheckin: 3 }).score).toBe(3);
    expect(score({ daysSinceLastCheckin: 2 }).score).toBe(0);
    expect(score({ doseStatus: null, level: null, daysSinceLastCheckin: 4 }).score).toBe(3);
  });
  it("a zero-point factor adds no reason", () => {
    const zero: RiskPoints = JSON.parse(JSON.stringify(points));
    zero.factors.stigma.points = 0;
    const r = scoreRisk({ ...BASE, stigma: true }, zero);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });
});

describe("total and band", () => {
  it("band boundaries 3, 4, 7, 8", () => {
    expect([3, 4, 7, 8].map((s) => bandFor(s, points))).toEqual(["low", "medium", "medium", "high"]);
    expect(bandFor(0, points)).toBe("low");
    expect(bandFor(500, points)).toBe("high");
  });
  it("demo day 41 is 8 and high", () => {
    const r = score({ stopIntent: true, maxPersistenceDays: 7, level: "YELLOW" });
    expect(r.score).toBe(8);
    expect(r.band).toBe("high");
    expect(r.reasons.map((x) => [x.factor, x.points])).toEqual([
      ["stop_intent", 4],
      ["unresolved_side_effect", 3],
      ["yellow_today", 1],
    ]);
  });
  it("nothing to report is 0, low, with no reasons", () => {
    expect(score({})).toEqual({ score: 0, band: "low", reasons: [] });
  });
  it("RED alone is 5 (the score never replaces the triage level)", () => {
    const r = score({ level: "RED" });
    expect([r.score, r.band]).toEqual([5, "medium"]);
  });
});

describe("reasons", () => {
  it("stop-intent reason carries 4 points and the Bahasa text", () => {
    const r = score({ stopIntent: true });
    expect(r.reasons).toEqual([
      { factor: "stop_intent", points: 4, text: "Mengatakan ingin berhenti atau merasa sudah sembuh" },
    ]);
  });
  it("fills {n} with the number of days", () => {
    const r = score({ consecutiveMissedBefore: 3, maxPersistenceDays: 9, daysSinceLastCheckin: 5 });
    const text = Object.fromEntries(r.reasons.map((x) => [x.factor, x.text]));
    expect(text.consecutive_missed_day).toBe("Tidak minum obat 3 hari berturut-turut sebelumnya");
    expect(text.unresolved_side_effect).toBe("Keluhan yang sama sudah 9 hari");
    expect(text.no_checkin).toBe("Tidak ada laporan selama 5 hari");
  });
  it("are emitted in the fixed factor order", () => {
    const r = score({
      doseStatus: "no", consecutiveMissedBefore: 3, stopIntent: true, stigma: true, maxPersistenceDays: 9,
      level: "RED", missedPickup: true, hasPmo: false, daysSinceLastCheckin: 3,
    });
    const order = r.reasons.map((x) => FACTOR_IDS.indexOf(x.factor));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(r.reasons).toHaveLength(9);
  });
});

// Small seeded PRNG so the generated snapshots are the same on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invariants", () => {
  const rnd = mulberry32(41);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const generated: RiskSnapshot[] = Array.from({ length: 200 }, () => ({
    doseStatus: pick(["yes", "no", "partial", null] as const),
    consecutiveMissedBefore: Math.floor(rnd() * 12),
    stopIntent: rnd() < 0.3,
    stigma: rnd() < 0.3,
    maxPersistenceDays: Math.floor(rnd() * 20),
    level: pick(["GREEN", "YELLOW", "RED", null] as const),
    missedPickup: rnd() < 0.3,
    hasPmo: rnd() < 0.7,
    daysSinceLastCheckin: Math.floor(rnd() * 10),
  }));

  it("reason points sum to the score for 200 generated snapshots", () => {
    for (const s of generated) {
      const r = scoreRisk(s, points);
      expect(r.reasons.reduce((sum, x) => sum + x.points, 0)).toBe(r.score);
      expect(r.reasons.every((x) => x.points > 0)).toBe(true);
      expect(r.band).toBe(bandFor(r.score, points));
      expect(r.score === 0).toBe(r.reasons.length === 0);
    }
  });

  it("100 repeated evaluations are identical", () => {
    for (const s of generated.slice(0, 20)) {
      const first = JSON.stringify(scoreRisk(s, points));
      for (let i = 0; i < 100; i++) expect(JSON.stringify(scoreRisk(s, points))).toBe(first);
    }
  });

  it("does not mutate the snapshot", () => {
    const s = { ...BASE, doseStatus: "no" as const, consecutiveMissedBefore: 3 };
    const copy = JSON.stringify(s);
    scoreRisk(s, points);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("risk parity fixture (shared with pytest)", () => {
  const cases = readFileSync(`${RULES_DIR}/fixtures/risk-parity.jsonl`, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as {
      id: string;
      snapshot: RiskSnapshot;
      expected: { score: number; band: string; factors: string[] };
    });

  it("has at least 40 unique cases covering every factor, the cap and each band boundary", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const factors = new Set(cases.flatMap((c) => c.expected.factors));
    for (const id of FACTOR_IDS) expect(factors.has(id), `factor ${id}`).toBe(true);
    const scores = new Set(cases.map((c) => c.expected.score));
    for (const s of [3, 4, 7, 8]) expect(scores.has(s), `score ${s}`).toBe(true);
    expect(cases.some((c) => c.snapshot.consecutiveMissedBefore * 2 > 10)).toBe(true);
    expect(new Set(cases.map((c) => c.expected.band))).toEqual(new Set(["low", "medium", "high"]));
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const r = scoreRisk(c.snapshot, points);
    expect(r.score).toBe(c.expected.score);
    expect(r.band).toBe(c.expected.band);
    expect(r.reasons.map((x) => x.factor)).toEqual(c.expected.factors);
  });
});
