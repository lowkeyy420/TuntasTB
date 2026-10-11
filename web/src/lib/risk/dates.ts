const DAY_MS = 86_400_000;

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** `YYYY-MM-DD` shifted by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Jakarta (UTC+7, no DST) calendar date of an instant. */
export function jakartaDate(instant: Date): string {
  return new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
