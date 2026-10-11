"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw, UserPlus, Users } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, ButtonLink, EmptyState } from "@/components/ui";
import { QueueList } from "@/components/queue/QueueList";
import type { QueueItem } from "@/lib/queue/types";

interface QueueResponse {
  date: string;
  entries: QueueItem[];
}

const t = copy.queue;

/** The nurse's morning queue, loaded from `GET /api/nurse/queue`. */
export function QueueScreen() {
  const router = useRouter();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nurse/queue", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("load");
      setData((await res.json()) as QueueResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return failed ? (
      <Alert tone="danger" role="alert">
        <p>{t.loadFailed}</p>
        <Button variant="secondary" size="md" icon={RefreshCw} className="mt-3" onClick={() => void load()}>
          {t.retry}
        </Button>
      </Alert>
    ) : (
      <p role="status" className="flex items-center gap-3 text-lg font-semibold text-ink">
        <LoaderCircle aria-hidden className="size-7 shrink-0 animate-spin text-primary" />
        {t.loading}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {failed && (
        <Alert tone="warning" role="alert">
          <p>{t.loadFailed}</p>
        </Alert>
      )}
      {data.entries.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t.empty}
          action={
            <ButtonLink block icon={UserPlus} href="/nurse/patients/new">
              {copy.console.newPatientLink}
            </ButtonLink>
          }
        >
          {t.emptyBody}
        </EmptyState>
      ) : (
        <QueueList
          entries={data.entries}
          today={data.date}
          historyHref={(e) => `/nurse/patients/${e.patientId}`}
          actionHref={(e) =>
            e.action === "earlyPickup" ? `/nurse/patients?fokus=${e.patientId}` : `/nurse/patients/${e.patientId}`
          }
        />
      )}
      <Button variant="quiet" size="md" icon={RefreshCw} loading={loading} onClick={() => void load()} className="self-start">
        {t.retry}
      </Button>
    </div>
  );
}
