import { detectMoodFlags, type MoodFlags } from "./mood";
import { addDays, dayDiff } from "./dates";
import type { Level, Rules } from "../triage/types";
import type { DoseStatus, RiskSnapshot } from "./types";

/** One stored check-in, reduced to what scoring needs. */
export interface HistoryCheckin {
  /** Jakarta calendar day, `YYYY-MM-DD`. */
  occurredOn: string;
  /** Creation instant in ms; the latest check-in of a day wins. */
  createdAt: number;
  doseStatus: string | null;
  symptomCodes: string[];
  textRedacted: string | null;
  triageLevel: Level | null;
}

export interface PatientFacts {
  /** Jakarta calendar day the patient was registered. */
  registeredOn: string;
  hasPmo: boolean;
  pickups: { dueDate: string; done: boolean }[];
}

/** Check-in-day facts supplied by the caller when scoring a check-in being made now. */
export interface TodayInput {
  doseStatus: DoseStatus;
  /** Already merged lexicon + extraction flags (see `mergeMoodFlags`). */
  moodFlags: MoodFlags;
  symptomCodes: string[];
  /** Durations stated in today's text or by extraction, per symptom code. */
  statedDurationDays?: Record<string, number>;
  /** Final triage level after combining local and flow results. */
  level: Level | null;
}

export interface DeriveArgs {
  /** Evaluation date (Jakarta calendar day). */
  asOf: string;
  history: HistoryCheckin[];
  patient: PatientFacts;
  rules: Rules;
  today?: TodayInput;
}

const DOSE: readonly string[] = ["yes", "no", "partial"];
const toDose = (s: string | null): DoseStatus => (s !== null && DOSE.includes(s) ? (s as DoseStatus) : null);

/** The latest check-in of each calendar day, newest day first. */
export function latestPerDay(history: HistoryCheckin[]): HistoryCheckin[] {
  const byDay = new Map<string, HistoryCheckin>();
  for (const row of history) {
    const current = byDay.get(row.occurredOn);
    if (current === undefined || row.createdAt > current.createdAt) byDay.set(row.occurredOn, row);
  }
  return [...byDay.values()].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
}

/** Days before `day` with an unbroken run of dose status "no"; a day without a check-in ends the run. */
export function consecutiveMissedBefore(day: string, latest: HistoryCheckin[]): number {
  const byDay = new Map(latest.map((r) => [r.occurredOn, r]));
  let count = 0;
  for (let d = addDays(day, -1); byDay.get(d)?.doseStatus === "no"; d = addDays(d, -1)) count++;
  return count;
}

/**
 * Persistence of a symptom on `day`: walk back through the earlier check-ins
 * (latest per day, newest first) while each one contains the code; the result
 * is the number of days from the earliest of those to `day`, inclusive.
 */
export function persistenceDays(code: string, day: string, earlier: HistoryCheckin[]): number {
  let earliest = day;
  for (const row of earlier) {
    if (!row.symptomCodes.includes(code)) break;
    earliest = row.occurredOn;
  }
  return dayDiff(earliest, day) + 1;
}

/**
 * Builds the `RiskSnapshot` for an evaluation date from explicit inputs.
 *
 * With `today` (scoring a check-in being made now) the scored day is `asOf`
 * and `daysSinceLastCheckin` is 0. Without it (queue read) the scored day is
 * the most recent check-in on or before `asOf`, and `daysSinceLastCheckin`
 * counts from it (or from registration when there is none).
 */
export function deriveSnapshot({ asOf, history, patient, rules, today }: DeriveArgs): RiskSnapshot {
  const latest = latestPerDay(history.filter((r) => r.occurredOn <= asOf));
  const lastRow = latest[0];

  let day = asOf;
  let doseStatus: DoseStatus = null;
  let flags: MoodFlags = { stopIntent: false, stigma: false };
  let codes: string[] = [];
  let stated: Record<string, number> = {};
  let level: Level | null = null;
  let daysSinceLastCheckin: number;

  if (today !== undefined) {
    ({ doseStatus, level } = today);
    flags = today.moodFlags;
    codes = today.symptomCodes;
    stated = today.statedDurationDays ?? {};
    daysSinceLastCheckin = 0;
  } else if (lastRow !== undefined) {
    day = lastRow.occurredOn;
    doseStatus = toDose(lastRow.doseStatus);
    flags = detectMoodFlags(lastRow.textRedacted ?? "", rules);
    codes = lastRow.symptomCodes;
    level = lastRow.triageLevel;
    daysSinceLastCheckin = dayDiff(day, asOf);
  } else {
    daysSinceLastCheckin = dayDiff(patient.registeredOn, asOf);
  }

  const earlier = latest.filter((r) => r.occurredOn < day);
  const allCodes = [...new Set([...codes, ...Object.keys(stated)])];
  const maxPersistenceDays = Math.max(
    0,
    ...allCodes.map((c) => Math.max(persistenceDays(c, day, earlier), stated[c] ?? 0)),
  );

  return {
    doseStatus,
    consecutiveMissedBefore: consecutiveMissedBefore(day, earlier),
    stopIntent: flags.stopIntent,
    stigma: flags.stigma,
    maxPersistenceDays,
    level,
    missedPickup: patient.pickups.some((p) => !p.done && p.dueDate < asOf),
    hasPmo: patient.hasPmo,
    daysSinceLastCheckin,
  };
}

/**
 * Symptom codes from a stored `symptoms_json` value. Tolerant of the shapes
 * the check-in change may use: a list of codes, a list of `{code}` objects, or
 * an object with `chips` / `symptoms` / `extracted` lists of either kind.
 */
export function symptomCodesFromJson(json: unknown): string[] {
  const codes = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") codes.add(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object" && v !== null) {
      const o = v as Record<string, unknown>;
      if (typeof o.code === "string") codes.add(o.code);
      for (const key of ["chips", "symptoms", "extracted"]) visit(o[key]);
    }
  };
  visit(json);
  return [...codes].sort();
}
