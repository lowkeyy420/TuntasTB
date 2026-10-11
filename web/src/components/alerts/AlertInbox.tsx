import Link from "next/link";
import { BellRing, CheckCheck } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, Card, Chip, StatusPill, TriageBadge, cx } from "@/components/ui";

/** An alert as the inbox shows it (a subset of what `GET /api/nurse/alerts` returns). */
export interface AlertView {
  id: string;
  /** Patient id, for the link to their history. */
  patientId?: string;
  code: string;
  day: number | null;
  flags: string[];
  /** Clock time the alert came in, `07.42`. */
  time: string;
  acknowledged: boolean;
  /** Who took it; shown with the time once acknowledged. */
  acknowledgedBy?: string | null;
  acknowledgedTime?: string | null;
}

export interface AlertInboxProps {
  alerts: readonly AlertView[];
  onAcknowledge: (id: string) => void;
  /** Alert being saved right now: its button shows progress and is disabled. */
  busyId?: string | null;
  /** Shown above the list when the last acknowledgement failed. */
  error?: string | null;
  /** Where a patient's history lives; without it the code is plain text (design mockup). */
  historyHref?: (alert: AlertView) => string;
  /** Live-connection state line, shown under the title. Omitted in the mockup. */
  connection?: string;
}

/**
 * RED alert inbox. An alert stays loud until a nurse takes it; taking it is
 * one press and leaves a visible record of who and when. Only the first open
 * alert carries the primary button, so the eye lands on one thing. Open alerts
 * come first, then the log of what was taken. The real page and the design
 * mockup render this same component.
 */
export function AlertInbox({ alerts, onAcknowledge, busyId, error, historyHref, connection }: AlertInboxProps) {
  const t = copy.alerts;
  const open = alerts.filter((a) => !a.acknowledged);
  const log = alerts.filter((a) => a.acknowledged);
  const next = open[0]?.id;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.title}</h1>
        {connection && <p className="text-base text-ink-muted">{connection}</p>}
      </div>

      {open.length > 0 ? (
        <div role="status" className="flex items-center gap-3 rounded-control bg-triage-red-strong p-4 text-on-solid">
          <BellRing aria-hidden className="size-8 shrink-0" />
          <p className="text-xl font-bold">{t.open(open.length)}</p>
        </div>
      ) : (
        <Alert tone="success" role="status" title={t.allClear}>
          {t.allClearBody}
        </Alert>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {[...open, ...log].map((a) => (
          <Card
            as="li"
            key={a.id}
            className={cx("flex flex-col gap-3", !a.acknowledged && "border-2 border-triage-red-solid")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {historyHref ? (
                <Link
                  href={historyHref(a)}
                  className="rounded-control text-2xl font-bold tabular-nums text-primary underline decoration-2 underline-offset-4"
                >
                  {a.code}
                  <span className="sr-only"> {t.patientLink}</span>
                </Link>
              ) : (
                <span className="text-2xl font-bold tabular-nums text-ink">{a.code}</span>
              )}
              {a.acknowledged ? (
                <StatusPill tone="ok" icon={CheckCheck}>
                  {t.acknowledgedTitle}
                </StatusPill>
              ) : (
                <TriageBadge level="RED" solid label={copy.triageShort.RED} />
              )}
            </div>
            <p className="text-base font-semibold text-ink-muted">
              {a.day !== null && `${copy.queue.day(a.day)} · `}
              {t.receivedAt(a.time)}
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink-muted">{t.flagsLabel}</p>
              <div className="flex flex-wrap gap-2">
                {a.flags.map((flag) => (
                  <Chip key={flag}>{flag}</Chip>
                ))}
              </div>
            </div>
            {a.acknowledged ? (
              <p className="text-base font-semibold text-triage-green-ink">
                {t.acknowledgedBy(a.acknowledgedBy || "-", a.acknowledgedTime ?? "")}
              </p>
            ) : (
              <>
                <p className="text-base text-ink">{t.advice}</p>
                <Button
                  block
                  variant={a.id === next ? "primary" : "secondary"}
                  icon={CheckCheck}
                  loading={busyId === a.id}
                  onClick={() => onAcknowledge(a.id)}
                >
                  {busyId === a.id ? t.acknowledging : t.acknowledge}
                </Button>
              </>
            )}
          </Card>
        ))}
      </ul>
    </div>
  );
}
