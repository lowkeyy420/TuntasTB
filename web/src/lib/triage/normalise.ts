/**
 * Text normalisation shared (step for step) with the Python component.
 *
 * Order: lower-case; split into sentences on . ! ? ; and line breaks; per
 * sentence replace every character outside a-z/0-9 with a space; collapse
 * runs of three or more identical letters to one; strip one of the suffixes
 * -nya, -ku, -mu from each token (only when at least three letters remain).
 * Specified in `rules/README.md`; parity is tested via `rules/fixtures/normalise.json`.
 */

const SENTENCE_SPLIT = /[.!?;\r\n]+/;
const NON_ALNUM = /[^a-z0-9]+/g;
const REPEATED_LETTERS = /([a-z])\1{2,}/g;
const SUFFIXES = ["nya", "ku", "mu"];
const MIN_STEM = 3;

function stem(token: string): string {
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= MIN_STEM) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/** Normalise one sentence (no sentence splitting). Returns tokens joined by single spaces. */
export function normaliseSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(NON_ALNUM, " ")
    .replace(REPEATED_LETTERS, "$1")
    .split(" ")
    .filter((t) => t !== "")
    .map(stem)
    .join(" ");
}

/** Normalise free text into non-empty normalised sentences. */
export function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .split(SENTENCE_SPLIT)
    .map(normaliseSentence)
    .filter((s) => s !== "");
}
