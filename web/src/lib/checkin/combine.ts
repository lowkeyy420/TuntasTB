import { maxLevel } from "@/lib/triage/engine";
import type { Level } from "@/lib/triage/types";

/** add-symptom-extraction design ("Confidence threshold"): below this, at least YELLOW. */
export const MIN_CONFIDENCE = 0.6;

/** The parts of a schema-valid `checkin_triage` output the combination reads. */
export interface FlowLevelInput {
  level: Level;
  extracted: {
    symptoms: { code: string }[];
    unknown_symptoms: string[];
    confidence: number;
  };
}

/**
 * Final level of a check-in (add-symptom-extraction design, phase B):
 *   - flow not called (no note): the local level;
 *   - invalid/missing output, timeout or error (`flow === null`): max(local, YELLOW), fallback;
 *   - valid output: max(local, flow.level, floor), floor YELLOW when the flow
 *     reports unknown symptoms, a code not in the table, or confidence < 0.6.
 * Mirrored in Python by eval/tuntas_eval/scoring.py `combine`; fixture
 * rules/fixtures/combine-parity.jsonl keeps the two equal.
 */
export function combineFlowLevel(
  local: Level,
  flow: FlowLevelInput | null,
  knownCodes: ReadonlySet<string>,
  called = true,
): { level: Level; fallback: boolean } {
  if (!called) return { level: local, fallback: false };
  if (flow === null) return { level: maxLevel(local, "YELLOW"), fallback: true };
  const ex = flow.extracted;
  const floor: Level =
    ex.unknown_symptoms.length > 0 ||
    ex.symptoms.some((s) => !knownCodes.has(s.code)) ||
    !(ex.confidence >= MIN_CONFIDENCE)
      ? "YELLOW"
      : "GREEN";
  return { level: maxLevel(maxLevel(local, flow.level), floor), fallback: false };
}
