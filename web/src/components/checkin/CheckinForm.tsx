"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, CircleDashed, Mic, Send, Square, X, type LucideIcon } from "lucide-react";
import { copy } from "@/copy/family.id";
import {
  Alert,
  BottomActionBar,
  Button,
  ChipGroup,
  DateTile,
  RadioCardGroup,
  TextArea,
  ToggleChip,
} from "@/components/ui";
import { NOTE_MAX, type DoseStatus } from "@/lib/checkin/schema";

export interface SymptomOption {
  /** Triage-table code (or any stable key). */
  code: string;
  label: string;
  icon: LucideIcon;
}

/** Microphone state handed to the form; `null` means "no microphone button". */
export interface Dictation {
  listening: boolean;
  toggle: () => void;
}

const doseOptions = [
  { value: "yes", label: copy.checkin.dose.yes, icon: Check },
  { value: "no", label: copy.checkin.dose.no, icon: X },
  { value: "partial", label: copy.checkin.dose.partial, icon: CircleDashed },
] as const;

/** What the user has entered so far. The real screen and the design mockup both use it. */
export function useCheckinDraft() {
  const [dose, setDose] = useState<DoseStatus | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");

  const toggle = useCallback((code: string, on: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setDose(null);
    setChosen(new Set());
    setNote("");
  }, []);

  return { dose, setDose, chosen, toggle, note, setNote, reset };
}

export type CheckinDraft = ReturnType<typeof useCheckinDraft>;

export interface CheckinFormProps {
  /** Today's date, `YYYY-MM-DD` (Jakarta). */
  today: string;
  treatmentDay: number;
  /** One chip per symptom in the triage table. */
  symptoms: readonly SymptomOption[];
  draft: CheckinDraft;
  dictation: Dictation | null;
  onSubmit: () => void;
  submitting?: boolean;
  /** An error from the last attempt, shown above the send button. */
  error?: string | null;
  /** Offline notice, queue count: anything that belongs above the send button. */
  notice?: ReactNode;
  /** Shown instead of the chips while they are not available (loading, or no rules on the device). */
  symptomsStatus?: ReactNode;
  /** Keeps "Kirim" disabled even after a dose is chosen (rules not available yet). */
  blocked?: boolean;
  /** The next-pickup card, between the day header and the dose question. */
  pickup?: ReactNode;
  /** Extra content after the note, above the send bar (the link to the question screen). */
  footer?: ReactNode;
}

/**
 * The daily check-in as one page, no steps: the dose question, symptom chips,
 * an optional note with a microphone, and "Kirim" fixed at the bottom. Dose
 * (1), chip (2), Kirim (3). "Kirim" stays disabled until a dose is chosen.
 */
export function CheckinForm({
  today,
  treatmentDay,
  symptoms,
  draft,
  dictation,
  onSubmit,
  submitting = false,
  error,
  notice,
  symptomsStatus,
  blocked = false,
  pickup,
  footer,
}: CheckinFormProps) {
  const t = copy.checkin;
  const { dose, setDose, chosen, toggle, note, setNote } = draft;

  return (
    <main className="flex flex-1 flex-col gap-7 pt-6">
      <header className="flex items-center gap-4">
        <DateTile date={today} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">{copy.home.todayPrompt}</h1>
          <p className="text-lg font-semibold text-ink-muted">{copy.home.dayLabel(treatmentDay)}</p>
        </div>
      </header>

      {pickup}

      <RadioCardGroup
        legend={t.doseQuestion}
        name="dose"
        options={doseOptions}
        value={dose}
        onChange={setDose}
      />

      {symptomsStatus ? (
        <section aria-labelledby="symptoms-heading" className="flex flex-col gap-3">
          <h2 id="symptoms-heading" className="text-lg font-semibold text-ink">
            {t.symptomsQuestion}
          </h2>
          {symptomsStatus}
        </section>
      ) : (
        <ChipGroup legend={t.symptomsQuestion} hint={t.symptomsHint}>
          {symptoms.map((s) => (
            <ToggleChip
              key={s.code}
              icon={s.icon}
              label={s.label}
              checked={chosen.has(s.code)}
              onChange={(e) => toggle(s.code, e.target.checked)}
            />
          ))}
        </ChipGroup>
      )}

      <div className="pb-6">
        <TextArea
          label={t.noteLabel}
          hint={t.noteHint}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          after={
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {dictation && (
                  <Button
                    variant="secondary"
                    size="md"
                    icon={dictation.listening ? Square : Mic}
                    onClick={dictation.toggle}
                  >
                    {dictation.listening ? t.micStop : t.mic}
                  </Button>
                )}
                <p className="text-base text-ink-muted">{t.noteRemaining(NOTE_MAX - note.length)}</p>
              </div>
              {dictation && <p className="text-base text-ink-muted">{t.micHint}</p>}
              {dictation?.listening && (
                <Alert tone="info" role="status">
                  {t.micListening}
                </Alert>
              )}
            </div>
          }
        />
      </div>

      {footer && <div className="pb-6">{footer}</div>}

      <BottomActionBar>
        {notice}
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        {!dose && (
          <p id="send-blocked" className="text-base text-ink-muted">
            {t.sendBlocked}
          </p>
        )}
        <Button
          block
          icon={Send}
          disabled={!dose || blocked}
          loading={submitting}
          aria-describedby={dose ? undefined : "send-blocked"}
          onClick={onSubmit}
        >
          {submitting ? t.sending : t.send}
        </Button>
      </BottomActionBar>
    </main>
  );
}
