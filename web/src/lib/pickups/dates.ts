import { addDays, dayDiff } from "@/lib/risk/dates";

/**
 * Pickup date logic (pickup-planner). Pure functions of explicit dates: every
 * date is a Jakarta calendar day, `YYYY-MM-DD`, and `today` is always passed in
 * (never read from a clock), so the server's time zone cannot shift a result.
 */

export type PickupState = "upcoming" | "nudge" | "due_today" | "missed" | "done";

/** The family sees the nudge banner this many days before the due date, or fewer. */
export const NUDGE_DAYS = 2;

/**
 * First due date at registration: `start + k * interval` for the smallest
 * k >= 1 whose result is today or later. A new patient (start today) is due
 * one interval from now; a patient registered mid-treatment lands on the next
 * pickup day of their own rhythm.
 */
export function firstDueDate(startDate: string, intervalDays: number, today: string): string {
  const k = Math.max(1, Math.ceil(dayDiff(startDate, today) / intervalDays));
  return addDays(startDate, k * intervalDays);
}

/**
 * The pickup after one that was done on `doneOn`. A pickup hands over one
 * interval of medicine, so supply lasts until `doneOn + interval` whether the
 * patient came early or late.
 */
export function nextDueDate(doneOn: string, intervalDays: number): string {
  return addDays(doneOn, intervalDays);
}

/** Calendar days from `today` to the due date; negative when overdue. */
export function daysUntil(dueDate: string, today: string): number {
  return dayDiff(today, dueDate);
}

/**
 * State of a pickup. `done` wins; then overdue (`missed`, due date before
 * today), due today, `nudge` (1 or 2 days away) and `upcoming`.
 * This is the one definition of "missed" for the family view, the nurse
 * console and the risk score.
 */
export function pickupState(dueDate: string, done: boolean, today: string): PickupState {
  if (done) return "done";
  const days = daysUntil(dueDate, today);
  if (days < 0) return "missed";
  if (days === 0) return "due_today";
  if (days <= NUDGE_DAYS) return "nudge";
  return "upcoming";
}

/** Whole days a missed pickup is overdue; 0 when it is not missed. */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, -daysUntil(dueDate, today));
}
