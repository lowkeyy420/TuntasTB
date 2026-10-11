import { redact } from "../redaction/redact";
import { maxLevel, triage } from "./engine";
import { lexiconProtectedTerms } from "./protectedTerms";
import type { Rules, TriageInput, TriageResult } from "./types";

/**
 * Redacts free text and triages it without letting redaction lower the level.
 *
 * Defence in depth: `redact` bounds its address and name patterns and stops
 * before lexicon terms (fed in below), so "rumah di Jalan Mawar mata kuning"
 * keeps "mata kuning". Should any future pattern still hide a flag, the raw
 * text (which exists only in request memory) is triaged locally here as well,
 * and the higher of the two results is returned, so redaction can never lower
 * the level. Only `redactedText` may be stored or sent to an LLM.
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
