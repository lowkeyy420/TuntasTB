/**
 * Calendar-day helpers fixed to the Asia/Jakarta time zone (UTC+7, no DST).
 *
 * Feature code must never call `new Date()` for day logic directly. Every
 * function here takes an explicit `now` so tests are deterministic and the
 * server's own time zone never leaks into treatment-day or due-date maths.
 */

const JAKARTA_TZ = "Asia/Jakarta";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the calendar date in Asia/Jakarta for the given instant as an
 * ISO `YYYY-MM-DD` string. `en-CA` renders exactly that ordering.
 */
export function toJakartaDate(now: Date): string {
  return dateFormatter.format(now);
}

/**
 * Returns today's calendar date in Asia/Jakarta as `YYYY-MM-DD`.
 * `now` defaults to the current instant but may be injected for tests.
 */
export function todayJakarta(now: Date = new Date()): string {
  return toJakartaDate(now);
}

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). Pure date
 * arithmetic in UTC, so no time zone or DST can shift the result.
 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Treatment day number: the start date is day 1. */
export function treatmentDay(startDate: string, today: string): number {
  return daysBetween(startDate, today) + 1;
}
