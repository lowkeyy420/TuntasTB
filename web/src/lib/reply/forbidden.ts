import type { Lexicon } from "@/lib/triage/types";

/**
 * Phrase lists behind the reply filter (design.md "Filter").
 *
 * Intended home: the `forbidden_output` block of `rules/lexicon.id.json`, so
 * the eval harness counts violations with the same patterns. That file is not
 * part of this change's write scope yet, so `forbiddenFromLexicon` uses the
 * block when the lexicon has one and these defaults otherwise. Moving the
 * lists into the rule file later needs no change to the filter.
 *
 * All phrases are matched case-insensitively on whole words.
 */
export interface ForbiddenOutput {
  /** Instructions about doses: reduce, increase, double, skip or change the medicine. */
  dosing: string[];
  /** Wording that states or suggests what condition the patient has. */
  diagnosis: string[];
  /** Named conditions a family reply must never mention. */
  conditions: string[];
  /** Medical jargon a primary-school reader would not know. */
  jargon: string[];
  /** Instructions to stop the medicine, forbidden below RED. */
  stop_instructions: string[];
  /** Instructions to keep taking the medicine, forbidden at RED. */
  continue_instructions: string[];
}

export const DEFAULT_FORBIDDEN: ForbiddenOutput = {
  dosing: [
    "kurangi",
    "dikurangi",
    "tambah dosis",
    "tambahkan",
    "ditambah",
    "gandakan",
    "dua kali lipat",
    "lewati",
    "lewatkan",
    "ganti obat",
    "ganti dengan",
    "ganti jadwal",
    "setengah butir",
    "setengah tablet",
  ],
  diagnosis: [
    "anda menderita",
    "anda terkena",
    "anda mengidap",
    "didiagnosis",
    "terdiagnosis",
    "diagnosis",
    "ini tanda penyakit",
    "tanda penyakit",
    "pasti penyakit",
  ],
  conditions: [
    "hepatitis",
    "tbc",
    "tb",
    "tuberkulosis",
    "kanker",
    "diabetes",
    "sirosis",
    "gagal hati",
    "gagal ginjal",
    "stevens-johnson",
    "hiv",
    "covid",
  ],
  jargon: [
    "hepatotoksik",
    "hepatotoksisitas",
    "neuropati",
    "neuritis",
    "ikterus",
    "dermatitis",
    "anafilaksis",
    "nefrotoksik",
    "ototoksik",
    "toksisitas",
    "toksik",
    "metabolit",
    "farmakologi",
    "gastritis",
  ],
  stop_instructions: [
    "berhenti minum",
    "stop obat",
    "stop minum",
    "hentikan obat",
    "hentikan minum",
    "jangan minum obat",
  ],
  continue_instructions: [
    "tetap minum",
    "lanjutkan minum",
    "teruskan minum",
    "lanjut minum",
    "terus minum obat",
  ],
};

const KEYS = Object.keys(DEFAULT_FORBIDDEN) as (keyof ForbiddenOutput)[];

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim() !== "");
}

/**
 * The lists to filter with: the lexicon's `forbidden_output` block when it is
 * well-formed, else the defaults. A key missing from the block falls back to
 * its default, so a partial block can only add strictness, never remove it.
 */
export function forbiddenFromLexicon(lexicon: Lexicon | undefined): ForbiddenOutput {
  const block = (lexicon as { forbidden_output?: Record<string, unknown> } | undefined)
    ?.forbidden_output;
  if (!block || typeof block !== "object") return DEFAULT_FORBIDDEN;
  const out = { ...DEFAULT_FORBIDDEN };
  for (const key of KEYS) {
    const list = block[key];
    if (isStringList(list)) out[key] = [...new Set([...DEFAULT_FORBIDDEN[key], ...list])];
  }
  return out;
}
