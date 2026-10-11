import type { Lexicon, LexiconEntry } from "./types";

function entryTerms(entry: LexiconEntry): string[] {
  return [...(entry.any ?? []), ...(entry.combo ?? []).flat()];
}

/**
 * Every lexicon keyword (phrases and their single words) for use as the
 * redactor's `protectedTerms`, so a symptom word is never swallowed as a name.
 */
export function lexiconProtectedTerms(lexicon: Lexicon): string[] {
  const phrases = [
    ...Object.values(lexicon.symptoms).flatMap(entryTerms),
    ...Object.values(lexicon.red_flags).flatMap(entryTerms),
    ...(lexicon.watch_words ?? []),
    ...lexicon.stop_intent,
    ...lexicon.stigma,
  ];
  const terms = new Set<string>();
  for (const phrase of phrases) {
    const lower = phrase.toLowerCase();
    terms.add(lower);
    for (const word of lower.split(/\s+/)) terms.add(word);
  }
  return [...terms].sort();
}
