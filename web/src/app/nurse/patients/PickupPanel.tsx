"use client";

import { useRef, useState } from "react";
import { CalendarClock, CalendarDays, Check, PackageCheck } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, Dialog, StatusPill, TextInput, formatLongDate, type StatusTone } from "@/components/ui";
import type { PickupState } from "@/lib/pickups/dates";
import { todayJakarta } from "@/lib/time";

export interface PickupFields {
  id: string;
  startDate: string;
  pickupId: string | null;
  nextPickupDue: string | null;
  pickupState: PickupState | null;
  daysOverdue: number;
}

const t = copy.pickup;

const tone: Record<PickupState, StatusTone> = {
  upcoming: "off",
  nudge: "warn",
  due_today: "warn",
  missed: "danger",
  done: "ok",
};

/** Days between today and the due date, for "n hari lagi". */
function daysAhead(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

type Mode = "other-date" | "reschedule";

function PickupDialog({
  mode,
  patient,
  onClose,
  onDone,
}: {
  mode: Mode;
  patient: PickupFields;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = todayJakarta();
  const [date, setDate] = useState(mode === "other-date" ? today : (patient.nextPickupDue ?? today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const done = mode === "other-date";

  async function save() {
    // Same rule as the API, so the form says it before the server has to.
    if (!date) return setError(t.validation.dateInvalid);
    if (done && (date > today || date < patient.startDate)) return setError(t.validation.doneRange);
    setSaving(true);
    setError(null);
    try {
      const base = `/api/nurse/patients/${patient.id}/pickups/${patient.pickupId}`;
      const res = await fetch(done ? `${base}/done` : base, {
        method: done ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(done ? { doneOn: date } : { dueDate: date }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { fields?: Record<string, string>; error?: string };
        setError(body.fields?.doneOn ?? body.fields?.dueDate ?? (body.error === "closed" ? t.closed : t.failed));
        return;
      }
      onDone();
    } catch {
      setError(t.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={done ? t.otherDate : t.reschedule} onClose={onClose}>
      <TextInput
        type="date"
        label={done ? t.doneOnLabel : t.dueDateLabel}
        value={date}
        max={done ? today : undefined}
        min={patient.startDate}
        error={error}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button block icon={Check} loading={saving} onClick={() => void save()}>
          {t.save}
        </Button>
        <Button block variant="secondary" disabled={saving} onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * The "Ambil obat" part of a patient card: due date, state with icon and word,
 * a one-tap "Sudah diambil" (today) and a small menu for another date or a
 * corrected schedule.
 */
export function PickupPanel({ patient, onChanged }: { patient: PickupFields; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Mode | null>(null);
  const today = todayJakarta();
  const menu = useRef<HTMLDetailsElement>(null);
  const choose = (mode: Mode) => {
    if (menu.current) menu.current.open = false;
    setDialog(mode);
  };

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/nurse/patients/${patient.id}/pickups/${patient.pickupId}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error("done");
      await onChanged();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!patient.pickupId || !patient.nextPickupDue || !patient.pickupState) {
    return (
      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <p className="text-sm font-semibold text-ink-muted">{t.column}</p>
        <p className="text-base text-ink-muted">{t.none}</p>
      </div>
    );
  }

  const when =
    patient.pickupState === "missed"
      ? t.overdueDays(patient.daysOverdue)
      : patient.pickupState === "due_today"
        ? t.state.due_today
        : t.inDays(daysAhead(patient.nextPickupDue, today));

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <p className="text-sm font-semibold text-ink-muted">{t.column}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={tone[patient.pickupState]} icon={CalendarClock}>
          {t.state[patient.pickupState]}
        </StatusPill>
        <span className="text-base text-ink">
          {t.dueOn(formatLongDate(patient.nextPickupDue))} · {when}
        </span>
      </div>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <div className="flex gap-3">
        <Button className="flex-1" size="md" icon={PackageCheck} loading={busy} onClick={() => void markDone()}>
          {busy ? t.marking : t.markDone}
        </Button>
        <details ref={menu} className="relative">
          <summary
            aria-label={t.more}
            className="flex min-h-12 min-w-12 cursor-pointer list-none items-center justify-center rounded-control border-2 border-primary bg-surface px-3 text-primary hover:bg-primary-soft [&::-webkit-details-marker]:hidden"
          >
            <CalendarDays aria-hidden className="size-6" />
          </summary>
          <div className="absolute right-0 z-10 mt-2 flex w-56 flex-col gap-1 rounded-control border-2 border-line-strong bg-surface p-2 shadow-raised">
            <Button variant="quiet" size="md" onClick={() => choose("other-date")}>
              {t.otherDate}
            </Button>
            <Button variant="quiet" size="md" onClick={() => choose("reschedule")}>
              {t.reschedule}
            </Button>
          </div>
        </details>
      </div>
      {dialog && (
        <PickupDialog
          mode={dialog}
          patient={patient}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void onChanged();
          }}
        />
      )}
    </div>
  );
}
