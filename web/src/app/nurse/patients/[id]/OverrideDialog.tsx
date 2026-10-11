"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, Dialog, Select, TextArea } from "@/components/ui";
import { OVERRIDE_NOTE_MIN, OVERRIDE_NOTE_MAX } from "@/lib/checkin/override-limits";
import type { Level } from "@/lib/triage/types";

const t = copy.timeline.override;
const LEVELS: Level[] = ["GREEN", "YELLOW", "RED"];

/**
 * Change the level of one check-in. The reason is required (at least 10
 * characters) and the button stays disabled until it is long enough. The
 * original level is kept by the server; the change is audited.
 */
export function OverrideDialog({
  checkinId,
  current,
  onClose,
  onDone,
}: {
  checkinId: string;
  /** The level in force now: not offered again. */
  current: Level | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const choices = LEVELS.filter((l) => l !== current);
  const [level, setLevel] = useState<Level>(choices.includes("RED") ? "RED" : choices[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const long = note.trim().length >= OVERRIDE_NOTE_MIN;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/nurse/checkins/${checkinId}/override`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level, note: note.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { fields?: Record<string, string> };
        setError(body.fields?.note ?? body.fields?.level ?? t.failed);
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
    <Dialog title={t.title} onClose={onClose}>
      <p className="text-base text-ink">{t.intro}</p>
      <Select label={t.levelLabel} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
        {choices.map((l) => (
          <option key={l} value={l}>
            {copy.triageShort[l]}
          </option>
        ))}
      </Select>
      <TextArea
        label={t.noteLabel}
        hint={t.noteHint}
        value={note}
        maxLength={OVERRIDE_NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        after={<p className="text-base text-ink-muted">{t.count(note.trim().length, OVERRIDE_NOTE_MIN)}</p>}
      />
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button block icon={Pencil} disabled={!long} loading={saving} onClick={() => void save()}>
          {saving ? t.saving : t.submit}
        </Button>
        <Button block variant="secondary" disabled={saving} onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    </Dialog>
  );
}
