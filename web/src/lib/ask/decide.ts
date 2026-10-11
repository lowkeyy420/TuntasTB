import { checkContent, wordCount, type RejectReason } from "@/lib/reply/filter";
import type { ForbiddenOutput } from "@/lib/reply/forbidden";
import type { Citation, SourceManifest } from "@/lib/reply/sources";
import { flowOutputSchema } from "./schema";

/** Longest answer shown, in words (guideline-qa "Answer length and language"). */
export const MAX_ANSWER_WORDS = 80;

/** The outcome of one flow call: its parsed JSON output, or a failure of any kind. */
export type FlowCall = { ok: true; output: unknown } | { ok: false };

export type AbstainReason =
  | "call_failed"
  | "invalid_output"
  | "flow_abstained"
  | "empty_answer"
  | "no_citation"
  | "citation_not_in_manifest"
  | "citation_not_retrieved"
  | "too_long"
  // Content checks of the reply filter (reassurance, dosing, diagnosis, jargon, ...).
  | Exclude<RejectReason, "too_long">;

export type Decision =
  | { kind: "answer"; text: string; citations: Citation[] }
  | { kind: "abstain"; reason: AbstainReason };

export interface DecideContext {
  /** `corpus/manifest.json` as id -> label. */
  manifest: SourceManifest;
  forbidden: ForbiddenOutput;
}

const abstain = (reason: AbstainReason): Decision => ({ kind: "abstain", reason });

/**
 * Decides whether a flow result may be shown. Abstaining is the default: an
 * answer has to pass every check, in this order, and the first failure is the
 * recorded reason.
 *
 *  1. the call succeeded and its output matches the flow schema
 *  2. the flow did not abstain and the answer is not empty
 *  3. at least one citation; each is in the manifest and among the sections
 *     the flow retrieved
 *  4. the reply filter's content checks (reassurance, dosing, diagnosis,
 *     jargon), imported rather than copied so there is one meaning of
 *     "forbidden". They run at the GREEN level, the only one without a
 *     level-specific meaning for an answer that is not about a check-in.
 *  5. at most 80 words
 *
 * Labels come from the manifest, never from the flow.
 */
export function decide(call: FlowCall, ctx: DecideContext): Decision {
  if (!call.ok) return abstain("call_failed");
  const parsed = flowOutputSchema.safeParse(call.output);
  if (!parsed.success) return abstain("invalid_output");
  const out = parsed.data;

  if (out.abstained) return abstain("flow_abstained");
  const answer = out.answer.trim();
  if (answer === "") return abstain("empty_answer");

  const ids = [...new Set(out.citations.map((c) => c.id))];
  if (ids.length === 0) return abstain("no_citation");
  if (ids.some((id) => !Object.hasOwn(ctx.manifest, id))) return abstain("citation_not_in_manifest");
  if (ids.some((id) => !out.retrieved_ids.includes(id))) return abstain("citation_not_retrieved");

  const content = checkContent(answer, "GREEN", ctx.forbidden);
  if (!content.ok) return abstain(content.reason as AbstainReason);
  if (wordCount(answer) > MAX_ANSWER_WORDS) return abstain("too_long");

  return {
    kind: "answer",
    text: answer,
    citations: ids.map((id) => ({ id, label: ctx.manifest[id].label })),
  };
}
