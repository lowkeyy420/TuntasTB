import { copy } from "@/copy/nurse.id";
import { dayDiff, jakartaDate } from "@/lib/risk/dates";

const clock = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "19.20" for an instant, in Jakarta time. */
export function formatClock(at: Date): string {
  return clock.format(at).replace(":", ".");
}

/**
 * When the latest check-in came in, for a nurse: "hari ini 07.42",
 * "kemarin 19.20", "3 hari lalu" or "belum pernah". Calendar days in Jakarta.
 */
export function formatLastCheckin(at: Date | null, now: Date): string {
  const w = copy.queue.when;
  if (at === null) return w.never;
  const days = dayDiff(jakartaDate(at), jakartaDate(now));
  if (days <= 0) return w.today(formatClock(at));
  if (days === 1) return w.yesterday(formatClock(at));
  return w.daysAgo(days);
}
