import { z } from "zod";

/**
 * The `checkin_triage` flow contract on the application side
 * (add-symptom-extraction design, "Flow contract"). The single source of the
 * shape is `langflow/flows/checkin_triage.schema.json`; these zod schemas
 * mirror it, and `flowSchema.test.ts` feeds the shared samples in
 * `langflow/flows/checkin_triage.samples.json` to both (pytest runs the same
 * samples through the JSON Schema), so the two cannot drift apart silently.
 *
 * Strict: unknown keys or values outside an enum make a response invalid,
 * and an invalid response is a flow failure (level at least YELLOW).
 */

const code = z.string().regex(/^[a-z][a-z0-9_]*$/);
const count = z.number().int().min(0);
export const levelSchema = z.enum(["GREEN", "YELLOW", "RED"]);
const doseStatus = z.enum(["yes", "no", "partial"]);
export const MOOD_FLAGS = ["stop_intent", "stigma", "boredom"] as const;

export const flowInputSchema = z
  .object({
    /** Redacted note; may be empty. */
    text: z.string().max(2000),
    chips: z.array(code),
    dose_status: doseStatus,
    treatment_day: count.optional(),
    context: z
      .object({
        persistence_days: z.record(code, count).optional(),
        consecutive_missed_before: count.optional(),
        missed_pickup: z.boolean().optional(),
        has_pmo: z.boolean().optional(),
        days_since_last_checkin: count.optional(),
      })
      .strict(),
    rules_version: z.string().optional(),
  })
  .strict();

export const extractedSchema = z
  .object({
    symptoms: z.array(
      z
        .object({
          code,
          quote: z.string(),
          duration_days: count.nullable(),
        })
        .strict(),
    ),
    unknown_symptoms: z.array(z.string()),
    dose_status: doseStatus.nullable(),
    mood_flags: z
      .array(z.enum(MOOD_FLAGS))
      .refine((flags) => new Set(flags).size === flags.length, "mood_flags must be unique"),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const flowOutputSchema = z
  .object({
    extracted: extractedSchema,
    level: levelSchema,
    risk: z.object({ score: count, band: z.enum(["low", "medium", "high"]) }).strict(),
    reasons: z.array(z.string()),
    family_message: z.string(),
    nurse_line: z.string(),
    citations: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
  })
  .strict();

export type FlowInput = z.infer<typeof flowInputSchema>;
export type FlowOutput = z.infer<typeof flowOutputSchema>;
export type Extracted = z.infer<typeof extractedSchema>;

/** Parses the flow's chat output text. `null` for anything that is not exactly the contract. */
export function parseFlowOutput(text: string): FlowOutput | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = flowOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
