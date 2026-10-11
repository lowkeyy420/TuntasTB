import { z } from "zod";

/**
 * Body of `POST /api/checkins`. Pure (no server-only imports) so the browser
 * builds the same shape it is validated against.
 *
 * `.strict()` is how "the client cannot choose the patient or the treatment
 * day" is enforced: `patientId` or `treatmentDay` in the body is a 400.
 */

export const DOSE_STATUSES = ["yes", "no", "partial"] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const NOTE_MAX = 500;
export const MAX_CHIPS = 30;

function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const checkinBodySchema = z
  .object({
    /** Generated on the device; the idempotency key together with the patient. */
    clientId: z.string().uuid(),
    /** The device's date; the server decides whether to believe it. */
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isRealDate)
      .optional(),
    doseStatus: z.enum(DOSE_STATUSES),
    /** Symptom codes. Unknown codes are accepted and floor the level at YELLOW. */
    chips: z.array(z.string().min(1).max(64)).max(MAX_CHIPS).default([]),
    text: z.string().max(NOTE_MAX).default(""),
  })
  .strict();

export type CheckinBody = z.infer<typeof checkinBodySchema>;
/** What a client builds before parsing (optional fields may be omitted). */
export type CheckinBodyInput = z.input<typeof checkinBodySchema>;
