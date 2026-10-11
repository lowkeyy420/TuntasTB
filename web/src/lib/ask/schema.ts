import { z } from "zod";

/** Question length in characters, after trimming (guideline-qa "Ask a question"). */
export const QUESTION_MIN = 3;
export const QUESTION_MAX = 300;

/**
 * Request body of `POST /api/ask`. Strict: any extra key (a `patientId`, a
 * `level`, a history) is a validation error and nothing is processed.
 */
export const askRequestSchema = z
  .object({
    question: z.string().trim().min(QUESTION_MIN).max(QUESTION_MAX),
  })
  .strict();

export type AskRequest = z.infer<typeof askRequestSchema>;

/**
 * What the `ask_guideline` flow returns (langflow/README.md "Contracts").
 * Unknown extra keys, such as the citation `label`, are ignored: the label
 * shown to the family always comes from the app's own manifest.
 */
export const flowOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ id: z.string().min(1) })),
  retrieved_ids: z.array(z.string()),
  abstained: z.boolean(),
});

export type FlowOutput = z.infer<typeof flowOutputSchema>;

/** The only payload sent to the flow: the redacted question and nothing else. */
export interface FlowPayload {
  question: string;
}
