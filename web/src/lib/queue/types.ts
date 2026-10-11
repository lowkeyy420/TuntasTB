import type { Level } from "@/lib/triage/types";
import type { RiskBand, RiskReason } from "@/lib/risk/types";

/** The one action suggested for a queue entry. */
export type SuggestedAction = "call" | "visit" | "earlyPickup" | "none";

/** One row of the nurse queue, before presentation. */
export interface QueueEntry {
  patientId: string;
  code: string;
  treatmentDay: number;
  score: number;
  band: RiskBand;
  /** Effective level of the latest check-in (`override_level ?? triage_level`); null when none. */
  level: Level | null;
  /** True when the latest check-in's level was changed by a nurse. */
  overridden: boolean;
  /** Every awarded risk factor with its points, in the scorer's fixed order. */
  reasons: RiskReason[];
  /** One line for the nurse (symptom and duration, then the main risk reasons). */
  reason: string;
  suggestedAction: SuggestedAction;
  /** When the latest check-in was received; null for a patient who never reported. */
  latestCheckinAt: Date | null;
  daysSinceLastCheckin: number;
}

/** A queue row as the nurse console receives it (`GET /api/nurse/queue`). Types only: safe for client components. */
export interface QueueItem {
  patientId: string;
  code: string;
  day: number;
  score: number;
  band: RiskBand;
  level: Level | null;
  overridden: boolean;
  reason: string;
  action: SuggestedAction;
  /** "kemarin 19.20", "3 hari lalu", "belum pernah". */
  lastCheckin: string;
  factors: Array<{ text: string; points: number }>;
}
