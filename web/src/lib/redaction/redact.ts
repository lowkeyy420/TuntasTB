/**
 * Deterministic free-text redaction.
 *
 * `redact` is a pure function: the same input always produces the same output.
 * It MUST be applied before storing free text and before sending text to any
 * external service (e.g. Langflow). The raw string lives only in request memory.
 *
 * Order matters: NIK (16 digits) runs before phone so a 16-digit number is not
 * half-matched as a phone number.
 */

export interface RedactOptions {
  /**
   * Terms (e.g. the triage lexicon) that must never be redacted even if they
   * look like a name. Matched case-insensitively as whole words.
   */
  protectedTerms?: string[];
}

export const PLACEHOLDERS = {
  email: "[EMAIL]",
  nik: "[NIK]",
  phone: "[TELEPON]",
  address: "[ALAMAT]",
  name: "[NAMA]",
} as const;

// 1. Email.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// 2. NIK: exactly 16 digits, optional single space/dot/dash separators.
//    Guarded by boundaries so it does not grab part of a longer number run.
const NIK_RE = /(?<!\d)(?:\d[\s.-]?){15}\d(?!\d)/g;

// 3. Phone: +62 / 62 / 0 prefix, 9-13 digits, spaces or dashes allowed.
const PHONE_RE =
  /(?<![\w])(?:\+62|62|0)[\s-]?\d(?:[\s-]?\d){7,11}(?![\w])/g;

// 4a. Address: jl./jln/jalan followed by a capitalised word or a number,
//     up to the next comma, period or line end. The keyword is matched
//     case-insensitively, but the following street token MUST be truly
//     capitalised or a digit, so "jalan sempoyongan" (a symptom) is not an
//     address. No global `i` flag here: that would let [A-Z] match lowercase.
const ADDRESS_STREET_RE =
  /\b(?:[Jj][Ll]\.?|[Jj][Ll][Nn]\.?|[Jj]alan|JALAN)\s+(?:[A-Z][\w'-]*|\d)[^,.\n]*/g;
// 4b. RT nn/RW nn forms.
const ADDRESS_RTRW_RE = /\bRT\s*\d{1,3}\s*\/\s*RW\s*\d{1,3}\b/gi;

// 5a. Name after an explicit naming phrase: 1-3 capitalised tokens.
const NAME_PHRASE_RE =
  /\b(nama saya|saya bernama|namanya|nama (?:anak|ibu|bapak|suami|istri) saya)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
// 5b. A capitalised token directly after bare "saya" (not a common word).
const NAME_BARE_SAYA_RE = /\bsaya\s+([A-Z][a-z]+)\b/g;

// Common Indonesian words that may follow "saya" and are NOT names.
const COMMON_AFTER_SAYA = new Set([
  "mual",
  "merasa",
  "sudah",
  "tidak",
  "mau",
  "ingin",
  "akan",
  "masih",
  "baru",
  "sedang",
  "belum",
  "pergi",
  "minum",
  "makan",
  "batuk",
  "demam",
  "lelah",
  "pusing",
  "sakit",
  "bisa",
  "harus",
  "kira",
  "pikir",
  "rasa",
  "lagi",
  "juga",
  "hanya",
  "cuma",
  "punya",
  "dan",
  "atau",
  "tapi",
  "karena",
]);

export function redact(text: string, options: RedactOptions = {}): string {
  const protectedSet = new Set(
    (options.protectedTerms ?? []).map((t) => t.toLowerCase()),
  );

  let out = text;

  // 1. Email.
  out = out.replace(EMAIL_RE, PLACEHOLDERS.email);

  // 2. NIK before phone.
  out = out.replace(NIK_RE, PLACEHOLDERS.nik);

  // 3. Phone.
  out = out.replace(PHONE_RE, PLACEHOLDERS.phone);

  // 4. Address.
  out = out.replace(ADDRESS_STREET_RE, PLACEHOLDERS.address);
  out = out.replace(ADDRESS_RTRW_RE, PLACEHOLDERS.address);

  // 5a. Name after a naming phrase.
  out = out.replace(NAME_PHRASE_RE, (_m, phrase: string, name: string) => {
    // Respect protected terms: if the whole captured name is protected, keep it.
    if (protectedSet.has(name.toLowerCase())) return `${phrase} ${name}`;
    return `${phrase} ${PLACEHOLDERS.name}`;
  });

  // 5b. Capitalised token after bare "saya".
  out = out.replace(NAME_BARE_SAYA_RE, (match, token: string) => {
    const lower = token.toLowerCase();
    if (COMMON_AFTER_SAYA.has(lower)) return match;
    if (protectedSet.has(lower)) return match;
    return `saya ${PLACEHOLDERS.name}`;
  });

  return out;
}
