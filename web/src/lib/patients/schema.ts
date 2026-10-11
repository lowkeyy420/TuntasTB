import { z } from "zod";
import { copy } from "@/copy/nurse.id";
import { normalisePmoContact } from "./phone";

/**
 * Registration and update schemas. Pure (no server-only imports) so the same
 * rules run inline in the form and again in the API route.
 *
 * `.strict()` means an unexpected key such as `name` is rejected, which is how
 * "no name is collected" is enforced at the API.
 */

const v = copy.patients.validation;

export const PHASES = ["intensive", "continuation"] as const;
export type Phase = (typeof PHASES)[number];

const CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `today` is `YYYY-MM-DD` in Asia/Jakarta; injected so tests are deterministic. */
export function registrationSchema(today: string) {
  return z
    .object({
      code: z
        .string({ required_error: v.codeRequired, invalid_type_error: v.codeRequired })
        .trim()
        .min(1, v.codeRequired)
        .regex(CODE_PATTERN, v.codeFormat),
      startDate: z
        .string({
          required_error: v.startDateRequired,
          invalid_type_error: v.startDateRequired,
        })
        .min(1, v.startDateRequired)
        .refine(isRealDate, v.startDateInvalid)
        .refine((s) => !isRealDate(s) || s <= today, v.startDateFuture),
      phase: z.enum(PHASES, {
        required_error: v.phaseRequired,
        invalid_type_error: v.phaseRequired,
        message: v.phaseRequired,
      }),
      pickupIntervalDays: z
        .number({
          required_error: v.pickupRequired,
          invalid_type_error: v.pickupRequired,
        })
        .int(v.pickupRange)
        .min(1, v.pickupRange)
        .max(60, v.pickupRange),
      pmoPhone: z
        .string()
        .nullish()
        .refine(
          (s) => s === null || s === undefined || s.trim() === "" || normalisePmoContact(s) !== null,
          v.pmoInvalid,
        ),
    })
    .strict(v.unknownField);
}

export type RegistrationInput = z.infer<ReturnType<typeof registrationSchema>>;

/** Only phase and pickup interval may change after registration. */
export const updateSchema = z
  .object({
    phase: z.enum(PHASES, { message: v.phaseRequired }).optional(),
    pickupIntervalDays: z
      .number({ invalid_type_error: v.pickupRange })
      .int(v.pickupRange)
      .min(1, v.pickupRange)
      .max(60, v.pickupRange)
      .optional(),
  })
  .strict(v.unknownField)
  .refine((o) => o.phase !== undefined || o.pickupIntervalDays !== undefined, {
    message: v.nothingToUpdate,
  });

export type UpdateInput = z.infer<typeof updateSchema>;

/** Flattens zod issues to `{ field: firstMessage }`; form-level errors use `_form`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
