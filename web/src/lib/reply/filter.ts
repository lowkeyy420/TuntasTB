import type { Level } from "@/lib/triage/types";
import type { ForbiddenOutput } from "./forbidden";
import type { Citation, SourceManifest } from "./sources";

/**
 * The reply filter: a blocklist between a generated explanation and the
 * screen. When in doubt it rejects; the cost of over-rejecting is a more
 * generic (static) sentence, never an unsafe one.
 *
 * The same content checks run over every static template in a unit test, so
 * an unsafe template edit fails CI.
 */

export type RejectReason =
  | "empty"
  | "level_mismatch"
  | "reassurance"
  | "dosing"
  | "diagnosis"
  | "contradiction"
  | "jargon"
  | "sentence_length"
  | "citation"
  | "too_long";

export type FilterResult = { ok: true } | { ok: false; reason: RejectReason };

export const MAX_REPLY_WORDS = 60;
export const MAX_SENTENCE_WORDS = 20;

const OK: FilterResult = { ok: true };
const fail = (reason: RejectReason): FilterResult => ({ ok: false, reason });

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const WORD_EDGE_BEFORE = "(?<![\\p{L}\\p{N}])";
const WORD_EDGE_AFTER = "(?![\\p{L}\\p{N}])";

/** Words are counted by splitting on whitespace after trimming. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Whole-word, case-insensitive match of any phrase. `before` blocks a match after e.g. a negation. */
function hasPhrase(text: string, phrases: readonly string[], before = ""): boolean {
  const alternatives = phrases.map((p) => p.replace(ESCAPE, "\\$&").replace(/\s+/g, "\\s+")).join("|");
  const re = new RegExp(`${before}${WORD_EDGE_BEFORE}(?:${alternatives || "(?!)"})${WORD_EDGE_AFTER}`, "iu");
  return re.test(text);
}

// "aman" as a whole word. "nyaman" and "keamanan" are different words.
const REASSURANCE = /(?<![\p{L}\p{N}])aman(?![\p{L}\p{N}])/iu;
const DOSE_AMOUNT = /\d+\s*(?:mg|miligram)(?![\p{L}\p{N}])/iu;
const DOSE_COUNT = /\d+\s*(?:tablet|butir|kapsul|pil)(?![\p{L}\p{N}])/iu;
// "jangan berhenti minum" is the opposite of a stop instruction.
const NOT_NEGATED = "(?<!(?:jangan|tidak\\s+boleh)\\s+)";

function sentenceTooLong(text: string): boolean {
  return text.split(/[.!?]+/).some((s) => wordCount(s) > MAX_SENTENCE_WORDS);
}

/**
 * The content checks shared by generated and static text: everything except
 * the checks that need the flow (level it was written for, citation).
 */
export function checkContent(text: string, level: Level, forbidden: ForbiddenOutput): FilterResult {
  if (text.trim() === "") return fail("empty");
  if (REASSURANCE.test(text)) return fail("reassurance");
  const unsafe = checkNurseLine(text, forbidden);
  if (!unsafe.ok) return unsafe;
  const contradicts =
    level === "RED"
      ? hasPhrase(text, forbidden.continue_instructions)
      : hasPhrase(text, forbidden.stop_instructions, NOT_NEGATED);
  if (contradicts) return fail("contradiction");
  if (hasPhrase(text, forbidden.jargon)) return fail("jargon");
  if (sentenceTooLong(text)) return fail("sentence_length");
  return OK;
}

export interface GeneratedContext {
  /** The final triage level the reply is shown for. */
  level: Level;
  /** The level the flow wrote the message for. */
  flowLevel: Level | null | undefined;
  citations: readonly Citation[];
  manifest: SourceManifest;
  forbidden: ForbiddenOutput;
  /** The fixed action shown with the explanation; counted in the word limit. */
  action: string;
}

/**
 * Checks a generated explanation. Returns `{ ok: true }` or the first failing
 * reason, in the documented order: empty, level mismatch, reassurance,
 * dosing, diagnosis, contradiction, jargon, sentence length, citation, length.
 */
export function checkGenerated(text: string | null | undefined, ctx: GeneratedContext): FilterResult {
  const body = text ?? "";
  if (body.trim() === "") return fail("empty");
  if (ctx.flowLevel !== ctx.level) return fail("level_mismatch");
  const content = checkContent(body, ctx.level, ctx.forbidden);
  if (!content.ok) return content;
  const [only] = ctx.citations;
  if (ctx.citations.length !== 1 || !Object.hasOwn(ctx.manifest, only.id)) return fail("citation");
  if (wordCount(body) + wordCount(ctx.action) > MAX_REPLY_WORDS) return fail("too_long");
  return OK;
}

/** Content checks for a static template or variant. */
export function checkStatic(text: string, level: Level, forbidden: ForbiddenOutput): FilterResult {
  return checkContent(text, level, forbidden);
}

/** Dosing then diagnosis checks. Also the only checks the one-line nurse note must pass. */
export function checkNurseLine(text: string, forbidden: ForbiddenOutput): FilterResult {
  if (DOSE_AMOUNT.test(text) || DOSE_COUNT.test(text) || hasPhrase(text, ["dosis", ...forbidden.dosing])) {
    return fail("dosing");
  }
  if (hasPhrase(text, [...forbidden.diagnosis, ...forbidden.conditions])) return fail("diagnosis");
  return OK;
}
