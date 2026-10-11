import type { GeneratedExplanation } from "@/lib/reply/compose";
import type { Level, TriageResult } from "@/lib/triage/types";
import type { DoseStatus } from "./schema";

/**
 * THE SEAM for the Langflow call (`add-symptom-extraction`, step 6 of the
 * pipeline). Everything in this module is the contract that change plugs into;
 * nothing else in the check-in pipeline knows a flow exists.
 *
 * Rules the pipeline enforces around any implementation:
 *  - it receives only REDACTED text, never the raw note;
 *  - its level can only be combined with the local one through `maxLevel`, so
 *    the flow can raise but never lower the level;
 *  - a thrown error or a `null` result means "no flow": the local result is
 *    used and the reply carries the standing warning (`fallbackUsed = true`);
 *  - generated text is shown only if it passes the reply filter.
 */
export interface EnrichInput {
  patientId: string;
  treatmentDay: number;
  doseStatus: DoseStatus;
  chips: string[];
  /** Redacted note. */
  text: string;
  /** What the deterministic rules concluded; the flow may only add to it. */
  local: TriageResult;
}

export interface EnrichResult {
  /** Level the flow computed (its own rules pass). */
  level: Level;
  /** Extraction mood flags (`stop_intent`, `stigma`, `boredom`), OR-merged with the lexicon's. */
  moodFlags?: string[];
  /** Grounded explanation and citation(s) for the family reply. */
  generated?: GeneratedExplanation | null;
  /** One-line reason for the nurse. */
  nurseLine?: string | null;
}

export type Enrich = (input: EnrichInput) => Promise<EnrichResult | null>;

/** Rules-only mode: no flow is called. `add-symptom-extraction` replaces this. */
export const noEnrich: Enrich = async () => null;
