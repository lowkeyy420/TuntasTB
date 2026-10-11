"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, FileClock, LoaderCircle, Pencil, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  StatusPill,
  TriageBadge,
  formatLongDate,
  type StatusTone,
} from "@/components/ui";
import type { Timeline, TimelineCheckin } from "@/lib/timeline/types";
import { OverrideDialog } from "./OverrideDialog";

const t = copy.timeline;
const bandTone: Record<NonNullable<TimelineCheckin["riskBand"]>, StatusTone> = {
  high: "warn",
  medium: "info",
  low: "off",
};

function CheckinCard({ c, onOverride }: { c: TimelineCheckin; onOverride: () => void }) {
  const dose = c.doseStatus ? t.dose[c.doseStatus] : t.dose.none;
  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-ink">
          <time dateTime={c.occurredOn}>{formatLongDate(c.occurredOn)}</time>
        </h2>
        <p className="text-base font-semibold text-ink-muted">
          {c.treatmentDay !== null && `${t.day(c.treatmentDay)} · `}
          {c.time}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {c.level && <TriageBadge level={c.level} label={copy.triageShort[c.level]} />}
        {c.override && c.originalLevel && (
          <StatusPill tone="info" icon={Pencil}>
            {t.originalLevel(copy.triageShort[c.originalLevel])}
          </StatusPill>
        )}
        {c.fallbackUsed && (
          <StatusPill tone="off" icon={ShieldAlert}>
            {t.fallbackTag}
          </StatusPill>
        )}
        {c.riskScore !== null && c.riskBand && (
          <StatusPill tone={bandTone[c.riskBand]}>
            {copy.queue.score(c.riskScore)} · {copy.queue.band[c.riskBand]}
          </StatusPill>
        )}
      </div>

      {c.override && (
        <div className="rounded-control border border-info-ink bg-info-bg p-3 text-info-ink">
          <p className="font-bold">{t.overriddenBy(c.override.by ?? "-", c.override.time)}</p>
          <p className="text-base">
            <span className="font-semibold">{t.overrideNoteLabel}: </span>
            {c.override.note}
          </p>
        </div>
      )}

      <dl className="grid gap-x-4 gap-y-2 text-base sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold text-ink-muted">{t.dose.label}</dt>
        <dd className="text-ink">{dose}</dd>

        <dt className="font-semibold text-ink-muted">{t.symptomsLabel}</dt>
        <dd className="flex flex-wrap gap-2 text-ink">
          {c.symptoms.length === 0 && c.unknown.length === 0 && t.noSymptoms}
          {c.symptoms.map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
          {c.unknown.map((u) => (
            <Chip key={u}>
              {t.unknownLabel}: {u}
            </Chip>
          ))}
        </dd>

        <dt className="font-semibold text-ink-muted">{t.noteLabel}</dt>
        <dd className="text-ink">{c.note ?? t.noNote}</dd>

        {c.familyMessage && (
          <>
            <dt className="font-semibold text-ink-muted">{t.replyLabel}</dt>
            <dd className="text-ink">
              {c.familyMessage}
              {c.familyAction && <span className="block font-semibold">{c.familyAction}</span>}
            </dd>
          </>
        )}
      </dl>

      {c.riskReasons.length > 0 && (
        <details className="border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-primary">
            {copy.queue.factorsToggle}
          </summary>
          <ul className="flex flex-col gap-2 pb-2">
            {c.riskReasons.map((r) => (
              <li key={r.text} className="flex items-start justify-between gap-3 text-base text-ink">
                <span className="min-w-0">{r.text}</span>
                <span className="shrink-0 font-bold tabular-nums">{copy.queue.points(r.points)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="flex items-center gap-2 text-base font-semibold text-ink">
          {c.alert.status === "open" ? (
            <>
              <BellRing aria-hidden className="size-6 shrink-0 text-triage-red-ink" />
              {t.alert.open}
            </>
          ) : c.alert.status === "acknowledged" ? (
            <>
              <CheckCheck aria-hidden className="size-6 shrink-0 text-triage-green-ink" />
              {t.alert.acknowledged(c.alert.acknowledgedBy ?? "-", c.alert.acknowledgedTime ?? "")}
            </>
          ) : (
            <span className="font-normal text-ink-muted">{t.alert.none}</span>
          )}
        </p>
        <Button variant="secondary" size="md" icon={Pencil} onClick={onOverride}>
          {t.override.button}
        </Button>
      </div>
    </Card>
  );
}

/** A patient's check-ins, newest first, with the override dialog. */
export function TimelineScreen({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Timeline | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [editing, setEditing] = useState<TimelineCheckin | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nurse/patients/${patientId}/timeline`, { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) return setState("missing");
      if (!res.ok) throw new Error("load");
      setData((await res.json()) as Timeline);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [patientId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = { href: "/nurse/queue", label: t.back };

  if (state === "loading") {
    return (
      <p role="status" className="flex items-center gap-3 text-lg font-semibold text-ink">
        <LoaderCircle aria-hidden className="size-7 shrink-0 animate-spin text-primary" />
        {t.loading}
      </p>
    );
  }
  if (state === "missing") {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t.notFound} back={back} />
      </div>
    );
  }
  if (state === "failed" || !data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={copy.queue.title} back={back} />
        <Alert tone="danger" role="alert">
          <p>{t.loadFailed}</p>
          <Button variant="secondary" size="md" icon={RefreshCw} className="mt-3" onClick={() => void load()}>
            {t.retry}
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title(data.patient.code)}
        subtitle={`${t.day(data.patient.treatmentDay)} · ${
          data.patient.phase === "intensive" ? copy.patients.phase.intensive : copy.patients.phase.continuation
        }`}
        back={back}
      />
      {data.checkins.length === 0 ? (
        <EmptyState icon={FileClock} title={t.empty}>
          {t.emptyBody}
        </EmptyState>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {data.checkins.map((c) => (
            <CheckinCard key={c.id} c={c} onOverride={() => setEditing(c)} />
          ))}
        </ol>
      )}
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        {t.footer(data.reviewStatus.rules, data.reviewStatus.corpus)}
      </p>
      {editing && (
        <OverrideDialog
          checkinId={editing.id}
          current={editing.level}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
