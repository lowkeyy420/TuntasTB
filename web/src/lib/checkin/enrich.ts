import { parseFlowOutput, type Extracted, type FlowInput, type FlowOutput } from "@/lib/langflow/flowSchema";
import type { FlowFailure, RunFlow } from "@/lib/langflow/client";
import type { DoseStatus } from "./schema";

export { MIN_CONFIDENCE } from "./combine";

/**
 * The Langflow step of the check-in pipeline (add-symptom-extraction, phase B).
 *
 * Rules the pipeline enforces around any implementation:
 *  - the input type has no field for raw text, the patient code, ids, the
 *    family token, the Puskesmas or a contact: only the REDACTED note, codes,
 *    dose status, treatment day and numeric/boolean context;
 *  - the flow is not called when there is no note and every chip is known;
 *  - any failure (no key, timeout, network, HTTP error, invalid output) is a
 *    value, never an exception, and floors the level at YELLOW;
 *  - the flow's level is combined through `combineFlowLevel`, so the flow can
 *    raise but never lower the level.
 */
export const FLOW_NAME = "checkin_triage";

export interface FlowContext {
  persistence_days: Record<string, number>;
  consecutive_missed_before: number;
  missed_pickup: boolean;
  has_pmo: boolean;
  days_since_last_checkin: number;
}

export interface EnrichInput {
  /** Redacted note. */
  text: string;
  chips: string[];
  doseStatus: DoseStatus;
  treatmentDay: number;
  context: FlowContext;
  rulesVersion: string;
}

export type EnrichFailure = FlowFailure | "invalid_output" | "error";
export type EnrichOutcome = { ok: true; output: FlowOutput } | { ok: false; reason: EnrichFailure };

export type Enrich = (input: EnrichInput) => Promise<EnrichOutcome>;

const CODE = /^[a-z][a-z0-9_]*$/;
const count = (n: number) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** The JSON object sent as the flow's chat input. Nothing but the allowed fields. */
export function buildFlowPayload(input: EnrichInput): FlowInput {
  const persistence: Record<string, number> = {};
  for (const [code, days] of Object.entries(input.context.persistence_days)) {
    if (CODE.test(code)) persistence[code] = count(days);
  }
  return {
    text: input.text.slice(0, 2000),
    // Unknown chips with odd characters stay local (they already floor the level).
    chips: input.chips.filter((c) => CODE.test(c)),
    dose_status: input.doseStatus,
    treatment_day: count(input.treatmentDay),
    context: {
      persistence_days: persistence,
      consecutive_missed_before: count(input.context.consecutive_missed_before),
      missed_pickup: input.context.missed_pickup === true,
      has_pmo: input.context.has_pmo === true,
      days_since_last_checkin: count(input.context.days_since_last_checkin),
    },
    rules_version: input.rulesVersion,
  };
}

/** False only when there is nothing for the model to read: no note and every chip is known. */
export function needsFlow(text: string, chips: readonly string[], knownCodes: ReadonlySet<string>): boolean {
  return text.trim() !== "" || chips.some((c) => !knownCodes.has(c));
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export interface CheckedExtraction {
  /** Known codes whose quote is in the redacted note. */
  symptoms: { code: string; durationDays?: number }[];
  /** The flow's unknown symptoms plus every item moved out of `symptoms`. */
  unknown: string[];
  moodFlags: Extracted["mood_flags"];
  confidence: number;
}

/**
 * Trust an extracted symptom only when its code is in the triage table and
 * its quote appears in the redacted note; anything else becomes an unknown
 * symptom (still YELLOW or higher), never dropped.
 */
export function checkQuotes(ex: Extracted, redactedText: string, knownCodes: ReadonlySet<string>): CheckedExtraction {
  const hay = squash(redactedText);
  const symptoms: CheckedExtraction["symptoms"] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const s of ex.symptoms) {
    const quote = squash(s.quote);
    if (!knownCodes.has(s.code) || quote === "" || !hay.includes(quote)) {
      unknown.push(s.quote.trim() || s.code);
      continue;
    }
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    symptoms.push(s.duration_days === null ? { code: s.code } : { code: s.code, durationDays: s.duration_days });
  }
  for (const u of ex.unknown_symptoms) if (u.trim()) unknown.push(u.trim());
  return {
    symptoms,
    unknown: [...new Set(unknown)],
    moodFlags: ex.mood_flags,
    confidence: ex.confidence,
  };
}

/** The production step: one `checkin_triage` run, strictly validated. */
export function flowEnrich(runFlow: RunFlow, opts: { timeoutMs?: number } = {}): Enrich {
  return async (input) => {
    const res = await runFlow(FLOW_NAME, buildFlowPayload(input), opts);
    if (!res.ok) return { ok: false, reason: res.reason };
    const output = parseFlowOutput(res.text);
    return output ? { ok: true, output } : { ok: false, reason: "invalid_output" };
  };
}

/** Rules-only mode (no API key): no call, treated exactly like a flow failure. */
export const noEnrich: Enrich = async () => ({ ok: false, reason: "disabled" });

/** Never throws into the pipeline. */
export async function safeEnrich(enrich: Enrich, input: EnrichInput): Promise<EnrichOutcome> {
  try {
    return await enrich(input);
  } catch {
    return { ok: false, reason: "error" };
  }
}
