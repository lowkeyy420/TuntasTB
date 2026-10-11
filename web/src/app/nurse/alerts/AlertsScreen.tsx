"use client";

import { useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button } from "@/components/ui";
import { AlertInbox } from "@/components/alerts/AlertInbox";
import { useAlerts } from "@/components/alerts/AlertFeedProvider";

const t = copy.alerts;

/** The RED alert inbox: open alerts, the acknowledge button and the log, kept live by the console's feed. */
export function AlertsScreen() {
  const feed = useAlerts();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setBusyId(id);
    setError(null);
    const ok = await feed.acknowledge(id);
    if (!ok) setError(t.ackFailed);
    setBusyId(null);
  }

  if (!feed.loaded) {
    return (
      <p role="status" className="flex items-center gap-3 text-lg font-semibold text-ink">
        <LoaderCircle aria-hidden className="size-7 shrink-0 animate-spin text-primary" />
        {t.loading}
      </p>
    );
  }
  if (feed.error) {
    return (
      <Alert tone="danger" role="alert">
        <p>{t.loadFailed}</p>
        <Button variant="secondary" size="md" icon={RefreshCw} className="mt-3" onClick={() => void feed.refresh()}>
          {t.retry}
        </Button>
      </Alert>
    );
  }

  return (
    <AlertInbox
      alerts={feed.alerts}
      onAcknowledge={(id) => void acknowledge(id)}
      busyId={busyId}
      error={error}
      historyHref={(a) => `/nurse/patients/${a.patientId}`}
      connection={t.connection[feed.mode]}
    />
  );
}
