import type { Level } from "@/lib/triage/types";

/** Shapes returned by `GET /api/nurse/patients/[id]/timeline`. Types only: safe for client components. */

export interface TimelineAlert {
  status: "none" | "open" | "acknowledged";
  acknowledgedBy: string | null;
  /** Clock time in Jakarta, `07.45`. */
  acknowledgedTime: string | null;
}

export interface TimelineOverride {
  level: Level;
  note: string;
  by: string | null;
  /** Clock time in Jakarta. */
  time: string;
}

export interface TimelineCheckin {
  id: string;
  occurredOn: string;
  /** Clock time the check-in was received, `19.20`. */
  time: string;
  treatmentDay: number | null;
  doseStatus: "yes" | "no" | "partial" | null;
  /** Known symptoms in plain words, including red flags. */
  symptoms: string[];
  /** Codes the rules did not recognise. */
  unknown: string[];
  /** The redacted note; null when there was none. */
  note: string | null;
  /** The level in force: the nurse's override, else the stored one. */
  level: Level | null;
  /** The level the rules decided; never changed by an override. */
  originalLevel: Level | null;
  override: TimelineOverride | null;
  riskScore: number | null;
  riskBand: "high" | "medium" | "low" | null;
  riskReasons: Array<{ text: string; points: number }>;
  /** The reply the family saw (explanation, then action). */
  familyMessage: string | null;
  familyAction: string | null;
  fallbackUsed: boolean;
  alert: TimelineAlert;
}

export interface Timeline {
  patient: { id: string; code: string; treatmentDay: number; phase: string };
  checkins: TimelineCheckin[];
  /** Review status of the rule files and the guideline corpus, for the page footer. */
  reviewStatus: { rules: string; corpus: string | null };
}
