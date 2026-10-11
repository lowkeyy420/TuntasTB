import type { Level } from "../triage/types";

export type { Level };

export type DoseStatus = "yes" | "no" | "partial" | null;
export type RiskBand = "low" | "medium" | "high";

/** Factor identifiers in the fixed order in which reasons are emitted. */
export const FACTOR_IDS = [
  "missed_dose_today",
  "consecutive_missed_day",
  "partial_dose",
  "stop_intent",
  "stigma",
  "unresolved_side_effect",
  "yellow_today",
  "red_today",
  "missed_pickup",
  "no_pmo",
  "no_checkin",
] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

export interface RiskFactor {
  points: number;
  /** Maximum points the factor can contribute (consecutive_missed_day). */
  cap?: number;
  /** Threshold in days (unresolved_side_effect, no_checkin). */
  min_days?: number;
  /** Bahasa reason text; `{n}` is replaced by the factor's count of days. */
  text_id: string;
}

export interface RiskBandRule {
  max?: number;
  band: RiskBand;
}

export interface RiskPoints {
  version: string;
  factors: Record<FactorId, RiskFactor>;
  bands: RiskBandRule[];
}

/** Everything the scorer needs; no clock, no I/O. */
export interface RiskSnapshot {
  /** Dose status of the scored check-in; null when there is no check-in to score. */
  doseStatus: DoseStatus;
  /** Days before the scored day, unbroken, with dose status "no". */
  consecutiveMissedBefore: number;
  stopIntent: boolean;
  stigma: boolean;
  /** Longest persistence among the scored day's symptoms; 0 when none. */
  maxPersistenceDays: number;
  /** Final triage level of the scored check-in; null when there is none. */
  level: Level | null;
  missedPickup: boolean;
  hasPmo: boolean;
  daysSinceLastCheckin: number;
}

export interface RiskReason {
  factor: FactorId;
  points: number;
  text: string;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  reasons: RiskReason[];
}
