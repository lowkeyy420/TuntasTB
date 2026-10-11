import { defaultRules } from "@/lib/triage/loadFiles";
import { lexiconProtectedTerms } from "@/lib/triage/protectedTerms";
import { redact } from "./redact";

let terms: string[] | undefined;

/** The triage lexicon (`rules/lexicon.id.json`) as the redactor's protected terms. Server only. */
export function defaultProtectedTerms(): string[] {
  terms ??= lexiconProtectedTerms(defaultRules().lexicon);
  return terms;
}

/**
 * `redact` fed with the lexicon by default, so no server caller can forget
 * `protectedTerms`. Prefer `redactAndTriage` when the text is also triaged.
 */
export function redactWithLexicon(text: string): string {
  return redact(text, { protectedTerms: defaultProtectedTerms() });
}
