import { daysBetween, treatmentDay } from "@/lib/time";

/** Check-ins may be dated up to this many days before the day the server receives them. */
export const MAX_BACKDATE_DAYS = 7;

/**
 * The calendar day (Asia/Jakarta, `YYYY-MM-DD`) a check-in is stored for.
 * The device's date is accepted when it is not in the future and at most 7
 * days old; anything else (missing, future, older, or a device clock that is
 * wrong) falls back to `today`, the day the server received it.
 */
export function resolveOccurredOn(clientDate: string | null | undefined, today: string): string {
  if (!clientDate) return today;
  const age = daysBetween(clientDate, today);
  return age >= 0 && age <= MAX_BACKDATE_DAYS ? clientDate : today;
}

/** Treatment day of `occurredOn` for a patient who started on `startDate` (the start date is day 1). */
export function checkinTreatmentDay(startDate: string, occurredOn: string): number {
  return treatmentDay(startDate, occurredOn);
}
