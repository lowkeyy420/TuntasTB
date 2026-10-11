const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" });

/** "Jumat, 16 Oktober 2026" for a `YYYY-MM-DD` calendar date. */
export function formatLongDate(isoDate: string): string {
  return full.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * One sheet of a tear-off wall calendar: day name, big day number, month.
 * Heads the family home and the nurse queue, answering "which day is this".
 * Takes a calendar date (`YYYY-MM-DD`, already in Jakarta time).
 */
export function DateTile({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <time
      dateTime={date}
      aria-label={formatLongDate(date)}
      className="flex w-28 shrink-0 flex-col overflow-hidden rounded-control border-2 border-ink bg-surface text-center shadow-card"
    >
      <span aria-hidden className="bg-primary px-1 py-1 text-base font-semibold text-on-solid">
        {weekday.format(d)}
      </span>
      <span aria-hidden className="pt-2 text-5xl font-bold tabular-nums text-ink">
        {d.getUTCDate()}
      </span>
      <span aria-hidden className="px-1 pb-2 text-base font-medium text-ink-muted">
        {month.format(d)}
      </span>
    </time>
  );
}
