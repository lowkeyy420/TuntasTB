import type { CompiledDuration, CompiledEntry } from "./types";

/** True when `phrase` (already normalised) occurs in `sentence` on token boundaries. */
export function hasPhrase(sentence: string, phrase: string): boolean {
  return ` ${sentence} `.includes(` ${phrase} `);
}

/** True when any of the normalised phrases occurs in any sentence. */
export function hasAny(sentences: string[], phrases: string[]): boolean {
  return sentences.some((s) => phrases.some((p) => hasPhrase(s, p)));
}

/**
 * True when the entry matches: one of its `any` phrases occurs, or one term
 * from every `combo` group occurs in the same sentence.
 */
export function matchEntry(sentences: string[], entry: CompiledEntry): boolean {
  if (hasAny(sentences, entry.any)) return true;
  if (entry.combo.length === 0) return false;
  return sentences.some((s) =>
    entry.combo.every((group) => group.some((p) => hasPhrase(s, p))),
  );
}

/** Codes of all entries that match, in entry order. */
export function matchCodes(sentences: string[], entries: CompiledEntry[]): string[] {
  return entries.filter((e) => matchEntry(sentences, e)).map((e) => e.code);
}

/** Longest duration in days stated in the sentences; 0 when none is stated. */
export function parseDurationDays(
  sentences: string[],
  durations: CompiledDuration[],
): number {
  let best = 0;
  for (const sentence of sentences) {
    for (const d of durations) {
      for (const m of sentence.matchAll(d.re)) {
        const days = d.fixed ?? Number(m[1]) * d.mult;
        if (days > best) best = days;
      }
    }
  }
  return best;
}
