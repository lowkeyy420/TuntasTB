"use client";

import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, Card, Chip, StatusPill, TriageBadge, cx } from "@/components/ui";
import { mockAckTime, mockAlerts } from "./data";

/**
 * RED alert inbox. An alert stays loud until a nurse takes it; taking it is
 * one press and leaves a visible record of who and when. Only the first
 * open alert carries the primary button, so the eye lands on one thing.
 */
export function AlertInboxMock() {
  const t = copy.alerts;
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
  const open = mockAlerts.filter((a) => !acked.has(a.id));
  const next = open[0]?.id;

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.title}</h1>

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

      <ul className="grid gap-4 lg:grid-cols-2">
        {mockAlerts.map((a) => {
          const done = acked.has(a.id);
          return (
            <Card
              as="li"
              key={a.id}
              className={cx("flex flex-col gap-3", !done && "border-2 border-triage-red-solid")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums text-ink">{a.code}</span>
                {done ? (
                  <StatusPill tone="ok" icon={CheckCheck}>
                    {t.acknowledgedTitle}
                  </StatusPill>
                ) : (
                  <TriageBadge level="RED" solid label={copy.triageShort.RED} />
                )}
              </div>
              <p className="text-base font-semibold text-ink-muted">
                {copy.queue.day(a.day)} · {t.receivedAt(a.time)}
              </p>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink-muted">{t.flagsLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {a.flags.map((flag) => (
                    <Chip key={flag}>{flag}</Chip>
                  ))}
                </div>
              </div>
              {done ? (
                <p className="text-base font-semibold text-triage-green-ink">{t.acknowledged(mockAckTime)}</p>
              ) : (
                <>
                  <p className="text-base text-ink">{t.advice}</p>
                  <Button
                    block
                    variant={a.id === next ? "primary" : "secondary"}
                    icon={CheckCheck}
                    onClick={() => setAcked(new Set(acked).add(a.id))}
                  >
                    {t.acknowledge}
                  </Button>
                </>
              )}
            </Card>
          );
        })}
      </ul>
    </main>
  );
}
