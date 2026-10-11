import {
  type FactorId,
  type RiskPoints,
  type RiskReason,
  type RiskResult,
  type RiskSnapshot,
} from "./types";

/**
 * Transparent, deterministic dropout-risk score: a sum of documented points.
 * Pure function of (snapshot, points): no clock, no randomness, no LLM.
 * The score only orders the nurse's list; it never changes a triage level.
 *
 * Reasons are emitted in the fixed order of FACTOR_IDS, and their points always
 * sum to the score.
 */
export function scoreRisk(snapshot: RiskSnapshot, points: RiskPoints): RiskResult {
  const reasons: RiskReason[] = [];
  const add = (factor: FactorId, pts: number, n = 0): void => {
    if (pts <= 0) return;
    reasons.push({ factor, points: pts, text: points.factors[factor].text_id.replace("{n}", String(n)) });
  };
  const f = points.factors;

  if (snapshot.doseStatus === "no") add("missed_dose_today", f.missed_dose_today.points);
  if (snapshot.consecutiveMissedBefore > 0) {
    const raw = snapshot.consecutiveMissedBefore * f.consecutive_missed_day.points;
    add(
      "consecutive_missed_day",
      Math.min(raw, f.consecutive_missed_day.cap ?? Number.POSITIVE_INFINITY),
      snapshot.consecutiveMissedBefore,
    );
  }
  if (snapshot.doseStatus === "partial") add("partial_dose", f.partial_dose.points);
  if (snapshot.stopIntent) add("stop_intent", f.stop_intent.points);
  if (snapshot.stigma) add("stigma", f.stigma.points);
  if (snapshot.maxPersistenceDays >= (f.unresolved_side_effect.min_days as number)) {
    add("unresolved_side_effect", f.unresolved_side_effect.points, snapshot.maxPersistenceDays);
  }
  if (snapshot.level === "YELLOW") add("yellow_today", f.yellow_today.points);
  if (snapshot.level === "RED") add("red_today", f.red_today.points);
  if (snapshot.missedPickup) add("missed_pickup", f.missed_pickup.points);
  if (!snapshot.hasPmo) add("no_pmo", f.no_pmo.points);
  if (snapshot.daysSinceLastCheckin >= (f.no_checkin.min_days as number)) {
    add("no_checkin", f.no_checkin.points, snapshot.daysSinceLastCheckin);
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return { score, band: bandFor(score, points), reasons };
}

/** Band for a score: the first band whose `max` is not below the score; the last band has no max. */
export function bandFor(score: number, points: RiskPoints) {
  const rule = points.bands.find((b) => b.max === undefined || score <= b.max);
  return (rule as NonNullable<typeof rule>).band;
}
