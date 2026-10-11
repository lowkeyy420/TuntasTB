import { Phone } from "lucide-react";
import { copy } from "@/copy/family.id";
import { Alert, ButtonLink, Card, DateTile, formatLongDate } from "@/components/ui";
import type { PickupState } from "@/lib/pickups/dates";

export interface PickupCardProps {
  /** Due date, `YYYY-MM-DD`. */
  dueDate: string;
  /** Calendar days until the due date (Jakarta); negative when overdue. */
  daysUntil: number;
  state: PickupState;
  /** "Puskesmas <name>, telepon <number>.": the last line, and the overdue banner's. */
  contactLine: string;
  /** Puskesmas name for the "Tempat" line. */
  puskesmasName: string;
  /** `tel:` link shown with the overdue banner; omitted in the design mockup. */
  phoneHref?: string;
}

/**
 * The next medicine pickup as a calendar sheet with a countdown. From two days
 * before the due date a nudge banner appears; once the date has passed an
 * overdue banner asks the family to contact the Puskesmas. Wording is neutral
 * and never gives an instruction about doses. The real family home and the
 * design mockup render this same component.
 */
export function PickupCard({ dueDate, daysUntil, state, contactLine, puskesmasName, phoneHref }: PickupCardProps) {
  const t = copy.pickup;
  const overdue = state === "missed";
  const headline = overdue
    ? t.overdue
    : state === "due_today"
      ? t.today
      : daysUntil === 1
        ? t.tomorrow
        : t.inDays(daysUntil);

  return (
    <div className="flex flex-col gap-4">
      {state === "nudge" && (
        <Alert tone="warning" title={t.nudgeTitle}>
          {t.nudgeBody}
        </Alert>
      )}
      {state === "due_today" && (
        <Alert tone="warning" title={t.today}>
          {t.todayBody}
        </Alert>
      )}
      {overdue && (
        <Alert tone="danger" title={t.overdue}>
          <p>{t.overdueDays(-daysUntil)}</p>
          <p>{t.overdueBody}</p>
          <p className="font-bold">{contactLine}</p>
          {phoneHref && (
            <ButtonLink block size="md" variant="secondary" icon={Phone} href={phoneHref} className="mt-3">
              {copy.call}
            </ButtonLink>
          )}
        </Alert>
      )}

      <Card className="flex items-center gap-4">
        <DateTile date={dueDate} />
        <div className="min-w-0">
          <p className="text-xl font-bold text-ink">{headline}</p>
          <p className="text-base text-ink">{t.dueOn(formatLongDate(dueDate))}</p>
          <p className="text-base text-ink">{t.place(puskesmasName)}</p>
        </div>
      </Card>

      {!overdue && <p className="text-lg font-bold text-ink">{contactLine}</p>}
    </div>
  );
}
