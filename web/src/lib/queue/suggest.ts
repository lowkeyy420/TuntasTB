import type { RiskSnapshot } from "@/lib/risk/types";
import type { SuggestedAction } from "./types";

/** Silence of this many days, or this many missed doses in a row, calls for a visit. */
export const VISIT_AFTER_SILENT_DAYS = 3;
export const VISIT_AFTER_MISSED_DOSES = 3;

/**
 * The single suggested action for a queue entry; the first match wins:
 *  1. home visit: silent for 3+ days, or 3+ missed doses in a row (today included);
 *  2. early pickup: the pickup was missed;
 *  3. call: any other patient with a score above 0;
 *  4. none: score 0.
 */
export function suggestAction(snapshot: RiskSnapshot, score: number): SuggestedAction {
  if (score <= 0) return "none";
  const missedInARow = snapshot.consecutiveMissedBefore + (snapshot.doseStatus === "no" ? 1 : 0);
  if (snapshot.daysSinceLastCheckin >= VISIT_AFTER_SILENT_DAYS || missedInARow >= VISIT_AFTER_MISSED_DOSES) {
    return "visit";
  }
  if (snapshot.missedPickup) return "earlyPickup";
  return "call";
}
