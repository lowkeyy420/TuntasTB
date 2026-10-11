/**
 * Deterministic free-text redaction.
 *
 * `redact` is a pure function: the same input always produces the same output.
 * It MUST be applied before storing free text and before sending text to any
 * external service (e.g. Langflow). The raw string lives only in request memory.
 *
 * Order matters: NIK (16 digits) runs before phone so a 16-digit number is not
 * half-matched as a phone number.
 *
 * Safety: redaction must never lower a triage level ("redaction never lowers
 * triage"). Address and name patterns are therefore BOUNDED (token cap, clause
 * words, shape rules) and stop before any `protectedTerms` entry. Callers on
 * the server feed the triage lexicon in through `redactWithLexicon`
 * (./withLexicon.ts); `redactAndTriage` (triage/redactTriage.ts) does the same
 * and additionally triages the raw text as defence in depth.
 */

export interface RedactOptions {
  /**
   * Terms (e.g. the triage lexicon) that must never be redacted, matched
   * case-insensitively as whole words. An address or name match stops before
   * the first one, so a symptom written next to it survives.
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

// 4a. Address: jl./jln/jalan followed by a capitalised word or a number. The
//     keyword is matched case-insensitively, but the first street token MUST be
//     truly capitalised or a digit, so "jalan sempoyongan" (a symptom) is not an
//     address. No global `i` flag here: that would let [A-Z] match lowercase.
//     How far the address extends is decided by `redactAddresses`, NOT by "the
//     next comma or period": it is bounded so it can never swallow a symptom.
const ADDRESS_KEYWORD_RE = /\b(?:[Jj][Ll][Nn]?\.?|[Jj]alan|JALAN)\s+(?=[A-Z0-9])/g;

/** At most this many tokens after the keyword belong to an address. */
export const ADDRESS_MAX_TOKENS = 8;

/** Lower-case words that legitimately sit inside an address ("No. 12 RT 03/RW 05"). */
const ADDRESS_WORDS = new Set([
  "no", "nomor", "rt", "rw", "blok", "gg", "gang", "kel", "kec", "kav", "kavling", "dsn", "ds", "desa",
]);

/** Words that start a new clause: an address never continues through them. */
const CLAUSE_WORDS = new Set([
  "dan", "lalu", "terus", "tapi", "karena", "sejak", "saya", "aku", "kami", "yang", "dengan",
  "sudah", "belum", "tidak", "ada", "kok", "pas", "waktu", "kemarin", "hari", "tadi", "malam", "pagi",
]);

// 4b. RT nn/RW nn forms.
const ADDRESS_RTRW_RE = /\bRT\s*\d{1,3}\s*\/\s*RW\s*\d{1,3}\b/gi;

// 5a. Name after an explicit naming phrase: 1-3 capitalised tokens.
const NAME_PHRASE_RE =
  /\b([Nn]ama saya|saya bernama|[Nn]amanya|[Nn]ama (?:anak|ibu|bapak|suami|istri) saya)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
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

/** Strips surrounding quotes/brackets and sentence punctuation from a token. */
const stripPunct = (token: string) =>
  token.replace(/^[("'\u2018\u201c]+/, "").replace(/[)"'\u2019\u201d.;:!?]+$/, "");

/**
 * Replaces each address with [ALAMAT], consuming only tokens that look like
 * part of an address: capitalised words, tokens with a digit and the
 * abbreviations in ADDRESS_WORDS. It stops at a comma, a line end, a sentence
 * end, the token cap, a clause word and any protected (lexicon) term, so a
 * symptom written after an address ("jalan Mawar mata kuning") survives.
 */
function redactAddresses(text: string, protectedSet: Set<string>): string {
  const keyword = new RegExp(ADDRESS_KEYWORD_RE.source, "g");
  let out = "";
  let cursor = 0;
  for (let m = keyword.exec(text); m; m = keyword.exec(text)) {
    const start = m.index;
    if (start < cursor) continue;
    const bodyStart = start + m[0].length;
    const segment = /^[^,\n]*/.exec(text.slice(bodyStart))?.[0] ?? "";
    let end = -1; // end of the last consumed token (exclusive, absolute index)
    let count = 0;
    for (const t of segment.matchAll(/\S+/g)) {
      const core = stripPunct(t[0]);
      const lower = core.toLowerCase();
      if (core === "" || count >= ADDRESS_MAX_TOKENS) break;
      if (protectedSet.has(lower) || (count > 0 && CLAUSE_WORDS.has(lower))) break;
      const shaped =
        /^[A-Z]/.test(core) || /\d/.test(core) || (count > 0 && ADDRESS_WORDS.has(lower));
      if (!shaped) break;
      count++;
      end = bodyStart + (t.index ?? 0) + core.length;
      // A sentence-final period ends the address; "No." and "Jl." do not.
      if (/[.;:!?]$/.test(t[0]) && !ADDRESS_WORDS.has(lower)) break;
    }
    if (end < 0) continue; // first token protected or not address-like: leave the text alone
    out += text.slice(cursor, start) + PLACEHOLDERS.address;
    cursor = end;
    keyword.lastIndex = end;
  }
  return out + text.slice(cursor);
}

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

  // 4. Address (bounded, stops before protected terms).
  out = redactAddresses(out, protectedSet);
  out = out.replace(ADDRESS_RTRW_RE, PLACEHOLDERS.address);

  // 5a. Name after a naming phrase.
  out = out.replace(NAME_PHRASE_RE, (_m, phrase: string, name: string) => {
    // Never swallow a protected (lexicon) term: the name ends at the first one.
    const tokens = name.split(/\s+/);
    const cut = tokens.findIndex((t) => protectedSet.has(t.toLowerCase()));
    if (cut === 0) return `${phrase} ${name}`;
    const kept = cut < 0 ? "" : ` ${tokens.slice(cut).join(" ")}`;
    return `${phrase} ${PLACEHOLDERS.name}${kept}`;
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
