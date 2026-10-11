import { z } from "zod";
import { copy } from "@/copy/nurse.id";

/** Request bodies of the nurse pickup routes. Pure, so a form can reuse them. */

const v = copy.pickup.validation;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const date = (message: string) => z.string({ invalid_type_error: message, required_error: message }).refine(isRealDate, message);

/** `{ doneOn? }`: the day the medicine was collected; absent means today. */
export const doneSchema = z.object({ doneOn: date(v.dateInvalid).optional() }).strict(v.unknownField);

/** `{ dueDate }`: the corrected due date of an open pickup. */
export const rescheduleSchema = z.object({ dueDate: date(v.dateInvalid) }).strict(v.unknownField);

export type DoneInput = z.infer<typeof doneSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
