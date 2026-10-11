import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadRulesFromDir } from "../triage/loadFiles";
import { addDays, dayDiff, jakartaDate } from "./dates";
import {
  consecutiveMissedBefore,
  deriveSnapshot,
  latestPerDay,
  persistenceDays,
  symptomCodesFromJson,
  type HistoryCheckin,
  type PatientFacts,
  type TodayInput,
} from "./history";
import { loadRiskPointsFromDir } from "./points";
import { scoreRisk } from "./score";

const RULES_DIR = fileURLToPath(new URL("../../../../rules", import.meta.url));
const rules = loadRulesFromDir(RULES_DIR);
const points = loadRiskPointsFromDir(RULES_DIR);

// Day N of March 2026 as YYYY-MM-DD.
const d = (n: number) => `2026-03-${String(n).padStart(2, "0")}`;
let seq = 0;
const row = (
  day: number,
  dose: string | null,
  codes: string[] = [],
  extra: Partial<HistoryCheckin> = {},
): HistoryCheckin => ({
  occurredOn: d(day),
  createdAt: ++seq,
  doseStatus: dose,
  symptomCodes: codes,
  textRedacted: null,
  triageLevel: "GREEN",
  ...extra,
});

const patient: PatientFacts = { registeredOn: d(1), hasPmo: true, pickups: [] };
const today = (over: Partial<TodayInput> = {}): TodayInput => ({
  doseStatus: "yes",
  moodFlags: { stopIntent: false, stigma: false },
  symptomCodes: [],
  level: "GREEN",
  ...over,
});

describe("date helpers", () => {
  it("dayDiff and addDays work across month and year ends", () => {
    expect(dayDiff("2026-02-27", "2026-03-02")).toBe(3);
    expect(dayDiff("2026-03-02", "2026-02-27")).toBe(-3);
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("jakartaDate shifts by +7 hours", () => {
    expect(jakartaDate(new Date("2026-03-10T16:59:59Z"))).toBe("2026-03-10");
    expect(jakartaDate(new Date("2026-03-10T17:00:00Z"))).toBe("2026-03-11");
  });
});

describe("latest check-in per day", () => {
  it("keeps the latest of each calendar day, newest day first", () => {
    const rows = [row(5, "no"), row(5, "yes"), row(7, "no"), row(6, "partial")];
    const latest = latestPerDay(rows);
    expect(latest.map((r) => [r.occurredOn, r.doseStatus])).toEqual([
      [d(7), "no"],
      [d(6), "partial"],
      [d(5), "yes"],
    ]);
  });
  it("is independent of input order", () => {
    const a = row(5, "no");
    const b = row(5, "yes"); // created later
    expect(latestPerDay([b, a])[0].doseStatus).toBe("yes");
    expect(latestPerDay([a, b])[0].doseStatus).toBe("yes");
  });
});

describe("consecutive misses", () => {
  it("stop at a taken dose: no, no, yes, no gives 2", () => {
    const latest = latestPerDay([row(9, "no"), row(8, "no"), row(7, "yes"), row(6, "no")]);
    expect(consecutiveMissedBefore(d(10), latest)).toBe(2);
  });
  it("a day without a check-in breaks the run", () => {
    const latest = latestPerDay([row(8, "no")]); // day 9 has no check-in
    expect(consecutiveMissedBefore(d(10), latest)).toBe(0);
  });
  it("a partial dose neither counts nor extends the run", () => {
    const latest = latestPerDay([row(9, "partial"), row(8, "no")]);
    expect(consecutiveMissedBefore(d(10), latest)).toBe(0);
  });
  it("counts a long unbroken run", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => row(n, "no"));
    expect(consecutiveMissedBefore(d(10), latestPerDay(rows))).toBe(9);
  });
});

describe("symptom persistence", () => {
  it("nausea in every check-in back to one made 6 days ago is 7 days", () => {
    const earlier = latestPerDay([4, 5, 6, 7, 8, 9].map((n) => row(n, "yes", ["nausea_mild"])));
    expect(persistenceDays("nausea_mild", d(10), earlier)).toBe(7);
  });
  it("resets after a check-in that did not report it", () => {
    const earlier = latestPerDay([
      row(4, "yes", ["nausea_mild"]),
      row(5, "yes", ["nausea_mild"]),
      row(6, "yes", []), // gap
      row(7, "yes", ["nausea_mild"]),
      row(8, "yes", ["nausea_mild"]),
    ]);
    expect(persistenceDays("nausea_mild", d(10), earlier)).toBe(4); // from day 7
  });
  it("is 1 when it first appears today", () => {
    expect(persistenceDays("nausea_mild", d(10), latestPerDay([row(9, "yes", [])]))).toBe(1);
    expect(persistenceDays("nausea_mild", d(10), [])).toBe(1);
  });
});

describe("deriveSnapshot with today's input (check-in time)", () => {
  it("builds the scored-day facts from the input and history", () => {
    const history = [row(9, "no"), row(8, "no"), row(7, "yes")];
    const snap = deriveSnapshot({
      asOf: d(10),
      history,
      rules,
      patient: { ...patient, hasPmo: false, pickups: [{ dueDate: d(9), done: false }] },
      today: today({ doseStatus: "no", level: "YELLOW", moodFlags: { stopIntent: true, stigma: false } }),
    });
    expect(snap).toEqual({
      doseStatus: "no",
      consecutiveMissedBefore: 2,
      stopIntent: true,
      stigma: false,
      maxPersistenceDays: 0,
      level: "YELLOW",
      missedPickup: true,
      hasPmo: false,
      daysSinceLastCheckin: 0,
    });
  });

  it("ignores a check-in already stored for the scored day and later days", () => {
    const history = [row(10, "no"), row(11, "no"), row(9, "no")];
    const snap = deriveSnapshot({ asOf: d(10), history, rules, patient, today: today() });
    expect(snap.consecutiveMissedBefore).toBe(1);
  });

  it("persistence from history, and a stated duration overrides when larger", () => {
    const history = [4, 5, 6, 7, 8, 9].map((n) => row(n, "yes", ["nausea_mild"]));
    const base = { asOf: d(10), history, rules, patient };
    expect(
      deriveSnapshot({ ...base, today: today({ symptomCodes: ["nausea_mild"] }) }).maxPersistenceDays,
    ).toBe(7);
    expect(
      deriveSnapshot({
        ...base,
        today: today({ symptomCodes: ["nausea_mild"], statedDurationDays: { nausea_mild: 14 } }),
      }).maxPersistenceDays,
    ).toBe(14);
    expect(
      deriveSnapshot({
        ...base,
        today: today({ symptomCodes: ["nausea_mild"], statedDurationDays: { nausea_mild: 2 } }),
      }).maxPersistenceDays,
    ).toBe(7);
    // a duration stated for a code not among today's chips still counts
    expect(
      deriveSnapshot({ ...base, today: today({ statedDurationDays: { appetite_loss: 8 } }) }).maxPersistenceDays,
    ).toBe(8);
  });

  it("the longest of several symptoms is used, 0 when there are none", () => {
    const history = [row(9, "yes", ["a_code"])];
    const base = { asOf: d(10), history, rules, patient };
    expect(deriveSnapshot({ ...base, today: today({ symptomCodes: ["a_code", "b_code"] }) }).maxPersistenceDays).toBe(2);
    expect(deriveSnapshot({ ...base, today: today() }).maxPersistenceDays).toBe(0);
  });
});

describe("deriveSnapshot for the queue (no today input)", () => {
  it("uses the most recent check-in on or before the date, and counts silent days from it", () => {
    const history = [row(5, "no"), row(6, "no", [], { textRedacted: "mau berhenti dan malu", triageLevel: "YELLOW" })];
    const snap = deriveSnapshot({ asOf: d(9), history, rules, patient });
    expect(snap).toMatchObject({
      doseStatus: "no",
      consecutiveMissedBefore: 1,
      stopIntent: true,
      stigma: true,
      level: "YELLOW",
      daysSinceLastCheckin: 3,
    });
  });

  it("silence: 2 days is below the threshold, 3 days reaches it", () => {
    const history = [row(7, "yes")];
    const two = deriveSnapshot({ asOf: d(9), history, rules, patient });
    const three = deriveSnapshot({ asOf: d(10), history, rules, patient });
    expect(two.daysSinceLastCheckin).toBe(2);
    expect(three.daysSinceLastCheckin).toBe(3);
    expect(scoreRisk(two, points).reasons.map((r) => r.factor)).not.toContain("no_checkin");
    expect(scoreRisk(three, points).reasons.map((r) => r.factor)).toContain("no_checkin");
  });

  it("a patient registered 4 days ago who never checked in scores 3 for silence", () => {
    const snap = deriveSnapshot({
      asOf: d(10),
      history: [],
      rules,
      patient: { ...patient, registeredOn: d(6) },
    });
    expect(snap).toMatchObject({ doseStatus: null, level: null, daysSinceLastCheckin: 4 });
    expect(scoreRisk(snap, points)).toMatchObject({ score: 3, reasons: [{ factor: "no_checkin" }] });
  });

  it("ignores check-ins after the evaluation date", () => {
    const snap = deriveSnapshot({ asOf: d(5), history: [row(4, "yes"), row(8, "no")], rules, patient });
    expect(snap.doseStatus).toBe("yes");
    expect(snap.daysSinceLastCheckin).toBe(1);
  });

  it("treats an unknown dose string as no check-in dose and tolerates missing text", () => {
    const snap = deriveSnapshot({ asOf: d(5), history: [row(5, "weird"), row(4, null)], rules, patient });
    expect(snap.doseStatus).toBeNull();
    expect(snap.stopIntent).toBe(false);
  });

  it("uses the persistence of the most recent check-in's symptoms", () => {
    const history = [row(1, "yes", ["nausea_mild"]), row(2, "yes", ["nausea_mild"]), row(3, "yes", ["nausea_mild"]),
      row(4, "yes", ["nausea_mild"]), row(5, "yes", ["nausea_mild"]), row(6, "yes", ["nausea_mild"]), row(7, "yes", ["nausea_mild"])];
    expect(deriveSnapshot({ asOf: d(8), history, rules, patient }).maxPersistenceDays).toBe(7);
  });
});

describe("missed pickup", () => {
  const history = [row(5, "yes")];
  const withPickup = (dueDate: string, done: boolean) =>
    deriveSnapshot({ asOf: d(6), history, rules, patient: { ...patient, pickups: [{ dueDate, done }] } });
  it("is true when the due date has passed without being marked done", () => {
    expect(withPickup(d(5), false).missedPickup).toBe(true);
  });
  it("is false when done, or when due today or later", () => {
    expect(withPickup(d(5), true).missedPickup).toBe(false);
    expect(withPickup(d(6), false).missedPickup).toBe(false);
    expect(withPickup(d(9), false).missedPickup).toBe(false);
  });
});

describe("evaluation date is an input", () => {
  it("two dates over the same history differ only in the date-dependent factors", () => {
    const pickups = [{ dueDate: d(8), done: false }];
    const history = [row(6, "no", ["nausea_mild"], { triageLevel: "YELLOW" })];
    const p = { ...patient, pickups };
    const early = deriveSnapshot({ asOf: d(7), history, rules, patient: p });
    const late = deriveSnapshot({ asOf: d(12), history, rules, patient: p });
    const { daysSinceLastCheckin: e1, missedPickup: e2, ...earlyRest } = early;
    const { daysSinceLastCheckin: l1, missedPickup: l2, ...lateRest } = late;
    expect(earlyRest).toEqual(lateRest);
    expect([e1, e2]).toEqual([1, false]);
    expect([l1, l2]).toEqual([6, true]);
  });
});

describe("symptomCodesFromJson", () => {
  it("accepts lists of codes, {code} objects and nested chips/symptoms/extracted", () => {
    expect(symptomCodesFromJson(["b", "a"])).toEqual(["a", "b"]);
    expect(symptomCodesFromJson([{ code: "x" }, { code: "y" }])).toEqual(["x", "y"]);
    expect(symptomCodesFromJson({ chips: ["c"], extracted: [{ code: "d" }], symptoms: ["e"] })).toEqual(["c", "d", "e"]);
    expect(symptomCodesFromJson({ chips: ["c", "c"] })).toEqual(["c"]);
  });
  it("returns an empty list for null, numbers and unrelated objects", () => {
    expect(symptomCodesFromJson(null)).toEqual([]);
    expect(symptomCodesFromJson(5)).toEqual([]);
    expect(symptomCodesFromJson({ other: ["z"] })).toEqual([]);
    expect(symptomCodesFromJson(undefined)).toEqual([]);
  });
});
