import { copy } from "@/copy/family.id";
import type { ForbiddenOutput } from "@/lib/reply/forbidden";
import type { Citation, SourceManifest } from "@/lib/reply/sources";
import type { Rules } from "@/lib/triage/types";
import { decide, type AbstainReason, type FlowCall } from "./decide";
import { screenQuestion } from "./gate";
import type { FlowPayload } from "./schema";

/** How long the flow may take before the question is abstained (guideline-qa "Failure abstains"). */
export const FLOW_TIMEOUT_MS = 15_000;

export interface AskContact {
  name: string;
  phone: string;
}

export type AskKind = "answer" | "abstain" | "urgent";

/** Response body of `POST /api/ask`. Every kind carries the Puskesmas contact. */
export interface AskResponse {
  kind: AskKind;
  text: string;
  citations: Citation[];
  contact: AskContact;
}

export type AskReason = AbstainReason | "forbidden_topic";

export interface AskOutcome {
  response: AskResponse;
  /** Why it abstained; null for an answer or an urgent instruction. Goes to the audit entry. */
  reason: AskReason | null;
}

export interface AskDeps {
  rules: Rules;
  manifest: SourceManifest;
  forbidden: ForbiddenOutput;
  /** Calls the `ask_guideline` flow and resolves to its parsed JSON output. Rejects on any failure. */
  runFlow: (payload: FlowPayload) => Promise<unknown>;
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("flow timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Steps 2 to 6 of `POST /api/ask` for an authenticated, consented patient.
 * Nothing about the patient goes to the flow: the payload has the redacted
 * question and no other key. Anything but a clean pass is the abstain message.
 */
export async function answerQuestion(question: string, contact: AskContact, deps: AskDeps): Promise<AskOutcome> {
  const abstain = (reason: AskReason): AskOutcome => ({
    response: { kind: "abstain", text: copy.ask.abstain, citations: [], contact },
    reason,
  });

  const { redacted, gate } = screenQuestion(question, deps.rules, deps.forbidden);
  if (gate === "urgent") {
    return { response: { kind: "urgent", text: copy.ask.urgent, citations: [], contact }, reason: null };
  }
  if (gate === "forbidden_topic") return abstain("forbidden_topic");

  let call: FlowCall;
  try {
    call = { ok: true, output: await withTimeout(deps.runFlow({ question: redacted }), deps.timeoutMs ?? FLOW_TIMEOUT_MS) };
  } catch {
    call = { ok: false };
  }

  const decision = decide(call, { manifest: deps.manifest, forbidden: deps.forbidden });
  if (decision.kind === "abstain") return abstain(decision.reason);
  return {
    response: { kind: "answer", text: decision.text, citations: decision.citations, contact },
    reason: null,
  };
}
