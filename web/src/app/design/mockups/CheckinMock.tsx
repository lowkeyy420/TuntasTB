"use client";

import { useState } from "react";
import {
  Bone,
  Droplet,
  Droplets,
  Eye,
  EyeOff,
  Frown,
  Hand,
  Orbit,
  Thermometer,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { copy } from "@/copy/family.id";
import { CheckinForm, useCheckinDraft, type SymptomOption } from "@/components/checkin/CheckinForm";
import type { TriageLevel } from "@/components/ui";
import { NOTE_MAX } from "@/lib/checkin/schema";
import { mockToday, mockTreatmentDay } from "./data";
import { ReplyView } from "./ReplyView";

type Symptom = keyof typeof copy.checkin.symptoms;

// Stand-in pictures from the icon set. Real symptom pictograms should be
// tested with families before S02 ships. The real screen builds its chips
// from the triage table (see components/checkin/symptomIcons.ts).
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

const symptoms: SymptomOption[] = (Object.keys(symptomIcons) as Symptom[]).map((key) => ({
  code: key,
  label: copy.checkin.symptoms[key],
  icon: symptomIcons[key],
}));

/**
 * Mockup only: picks which sample reply to show. The real level is decided
 * by the rule table on the server, never in the browser.
 */
function sampleLevel(dose: string, chosen: ReadonlySet<string>, note: string): TriageLevel {
  if (chosen.has("yellow") || chosen.has("vision") || /kuning|kabur/i.test(note)) return "RED";
  const onlyUrine = chosen.size === 1 && chosen.has("urine");
  if (dose !== "yes" || (chosen.size > 0 && !onlyUrine) || note.trim() !== "") return "YELLOW";
  return "GREEN";
}

/** Daily check-in mockup: the real form, with a pretend microphone and a sample reply. */
export function CheckinMock() {
  const draft = useCheckinDraft();
  const [listening, setListening] = useState(false);
  const [sent, setSent] = useState<TriageLevel | null>(null);

  function mic() {
    if (listening) {
      draft.setNote((n) => `${n}${n ? " " : ""}${copy.checkin.micSample}`.slice(0, NOTE_MAX));
    }
    setListening(!listening);
  }

  function reset() {
    draft.reset();
    setListening(false);
    setSent(null);
  }

  if (sent) return <ReplyView level={sent} onDone={reset} />;

  return (
    <CheckinForm
      today={mockToday}
      treatmentDay={mockTreatmentDay}
      symptoms={symptoms}
      draft={draft}
      dictation={{ listening, toggle: mic }}
      onSubmit={() => draft.dose && setSent(sampleLevel(draft.dose, draft.chosen, draft.note))}
    />
  );
}
