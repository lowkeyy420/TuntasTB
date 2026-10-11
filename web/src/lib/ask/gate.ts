import { checkNurseLine } from "@/lib/reply/filter";
import type { ForbiddenOutput } from "@/lib/reply/forbidden";
import { redactAndTriage } from "@/lib/triage/redactTriage";
import type { Rules } from "@/lib/triage/types";

export interface ScreenedQuestion {
  /** The question with personal details replaced by placeholders. The only text that may leave the app. */
  redacted: string;
  /**
   * `urgent`: the question names a red-flag symptom, so the family is sent to
   * the Puskesmas and nothing is asked of the flow.
   * `forbidden_topic`: it asks for an amount of medicine or what illness
   * someone has, which is always abstained.
   */
  gate: "urgent" | "forbidden_topic" | null;
}

/**
 * Steps 2 to 4 of `POST /api/ask`: redact, scan for red flags, then the topic
 * gate. Both gates are deterministic, so the dosing, diagnosis and warning-sign
 * scenarios never depend on a model obeying its prompt.
 *
 * The red-flag scan reuses the triage lexicon through `redactAndTriage`, which
 * also scans the raw text, so redaction can never hide a warning sign. The
 * topic gate uses the reply filter's dosing/diagnosis lists (the lexicon's
 * `forbidden_output` block) on both the raw and the redacted text.
 */
export function screenQuestion(question: string, rules: Rules, forbidden: ForbiddenOutput): ScreenedQuestion {
  const { redactedText, result } = redactAndTriage({ chips: [], rawText: question }, rules);
  if (result.redFlags.length > 0) return { redacted: redactedText, gate: "urgent" };
  const forbiddenTopic = !checkNurseLine(redactedText, forbidden).ok || !checkNurseLine(question, forbidden).ok;
  return { redacted: redactedText, gate: forbiddenTopic ? "forbidden_topic" : null };
}
