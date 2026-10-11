"use client";

import { useState } from "react";
import {
  Bone,
  Check,
  CircleDashed,
  Droplet,
  Droplets,
  Eye,
  EyeOff,
  Frown,
  Hand,
  Mic,
  Orbit,
  Send,
  Square,
  Thermometer,
  UtensilsCrossed,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
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
  type TriageLevel,
} from "@/components/ui";
import { mockToday, mockTreatmentDay } from "./data";
import { ReplyView } from "./ReplyView";

type Dose = "yes" | "no" | "partial";
type Symptom = keyof typeof copy.checkin.symptoms;

const NOTE_MAX = 500;

const doseOptions = [
  { value: "yes", label: copy.checkin.dose.yes, icon: Check },
  { value: "no", label: copy.checkin.dose.no, icon: X },
  { value: "partial", label: copy.checkin.dose.partial, icon: CircleDashed },
] as const;

// Stand-in pictures from the icon set. Real symptom pictograms should be
// tested with families before S02 ships.
const symptomIcons: Record<Symptom, LucideIcon> = {
  nausea: Frown,
  vomiting: Droplets,
  dizzy: Orbit,
  itch: Hand,
  urine: Droplet,
  yellow: Eye,
  joint: Bone,
  tingling: Zap,
  fever: Thermometer,
  appetite: UtensilsCrossed,
  vision: EyeOff,
};

const symptoms = Object.keys(symptomIcons) as Symptom[];

/**
 * Mockup only: picks which sample reply to show. The real level is decided
 * by the rule table on the server, never in the browser.
 */
function sampleLevel(dose: Dose, chosen: ReadonlySet<Symptom>, note: string): TriageLevel {
  if (chosen.has("yellow") || chosen.has("vision") || /kuning|kabur/i.test(note)) return "RED";
  const onlyUrine = chosen.size === 1 && chosen.has("urine");
  if (dose !== "yes" || (chosen.size > 0 && !onlyUrine) || note.trim() !== "") return "YELLOW";
  return "GREEN";
}

/** Daily check-in: dose question, symptom chips, optional note with a microphone, send. */
export function CheckinMock() {
  const t = copy.checkin;
  const [dose, setDose] = useState<Dose | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<Symptom>>(new Set());
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [sent, setSent] = useState<TriageLevel | null>(null);

  function toggle(symptom: Symptom, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(symptom);
    else next.delete(symptom);
    setChosen(next);
  }

  function mic() {
    if (listening) {
      setNote((n) => `${n}${n ? " " : ""}${t.micSample}`.slice(0, NOTE_MAX));
    }
    setListening(!listening);
  }

  function reset() {
    setDose(null);
    setChosen(new Set());
    setNote("");
    setListening(false);
    setSent(null);
  }

  if (sent) return <ReplyView level={sent} onDone={reset} />;

  return (
    <main className="flex flex-1 flex-col gap-7 pt-6">
      <header className="flex items-center gap-4">
        <DateTile date={mockToday} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">{copy.home.todayPrompt}</h1>
          <p className="text-lg font-semibold text-ink-muted">{copy.home.dayLabel(mockTreatmentDay)}</p>
        </div>
      </header>

      <RadioCardGroup
        legend={t.doseQuestion}
        name="dose"
        options={doseOptions}
        value={dose}
        onChange={setDose}
      />

      <ChipGroup legend={t.symptomsQuestion} hint={t.symptomsHint}>
        {symptoms.map((s) => (
          <ToggleChip
            key={s}
            icon={symptomIcons[s]}
            label={t.symptoms[s]}
            checked={chosen.has(s)}
            onChange={(e) => toggle(s, e.target.checked)}
          />
        ))}
      </ChipGroup>

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
                <Button variant="secondary" size="md" icon={listening ? Square : Mic} onClick={mic}>
                  {listening ? t.micStop : t.mic}
                </Button>
                <p className="text-base text-ink-muted">{t.noteRemaining(NOTE_MAX - note.length)}</p>
              </div>
              {listening && (
                <Alert tone="info" role="status">
                  {t.micListening}
                </Alert>
              )}
            </div>
          }
        />
      </div>

      <BottomActionBar>
        {!dose && (
          <p id="send-blocked" className="text-base text-ink-muted">
            {t.sendBlocked}
          </p>
        )}
        <Button
          block
          icon={Send}
          disabled={!dose}
          aria-describedby={dose ? undefined : "send-blocked"}
          onClick={() => dose && setSent(sampleLevel(dose, chosen, note))}
        >
          {t.send}
        </Button>
      </BottomActionBar>
    </main>
  );
}
