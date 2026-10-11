import { redact } from "../redaction/redact";
import { maxLevel, triage } from "./engine";
import { lexiconProtectedTerms } from "./protectedTerms";
import type { Rules, TriageInput, TriageResult } from "./types";

/**
 * Redacts free text and triages it without letting redaction lower the level.
 *
 * Why: the address pattern in `redact` runs to the next comma or period, so
 * "rumah di Jalan Mawar mata kuning" becomes "rumah di [ALAMAT]" and the red
 * flag is lost. The raw text exists only in request memory and is triaged
 * locally here; only `redactedText` may be stored or sent to an LLM. The
 * higher of the two results is returned, so redaction can never lower the level.
 */
export function redactAndTriage(
  input: Omit<TriageInput, "text"> & { rawText: string },
  rules: Rules,
): { redactedText: string; result: TriageResult } {
  const { rawText, ...rest } = input;
  const redactedText = redact(rawText, { protectedTerms: lexiconProtectedTerms(rules.lexicon) });
  const onRedacted = triage({ ...rest, text: redactedText }, rules);
  const onRaw = triage({ ...rest, text: rawText }, rules);
  const result = maxLevel(onRaw.level, onRedacted.level) === onRedacted.level ? onRedacted : onRaw;
  return { redactedText, result };
}
