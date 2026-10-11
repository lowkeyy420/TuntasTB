import { hasAny } from "../triage/match";
import { normalise } from "../triage/normalise";
import type { Rules } from "../triage/types";

export interface MoodFlags {
  stopIntent: boolean;
  stigma: boolean;
}

/**
 * Stop-intent and stigma expressions in already redacted text, using the
 * shared lexicon and the triage normaliser.
 */
export function detectMoodFlags(redactedText: string, rules: Rules): MoodFlags {
  const sentences = normalise(redactedText);
  return {
    stopIntent: hasAny(sentences, rules.stopIntent),
    stigma: hasAny(sentences, rules.stigma),
  };
}

/**
 * OR-merges lexicon flags with extraction `mood_flags` (`stop_intent`, `stigma`,
 * `boredom`). Extraction can add a flag but never remove one found by the
 * lexicon. `boredom` alone adds nothing: the point list has no boredom factor,
 * and boredom phrases such as "bosan minum obat" are already in the lexicon's
 * stop-intent list.
 */
export function mergeMoodFlags(detected: MoodFlags, extractionFlags: readonly string[]): MoodFlags {
  return {
    stopIntent: detected.stopIntent || extractionFlags.includes("stop_intent"),
    stigma: detected.stigma || extractionFlags.includes("stigma"),
  };
}
