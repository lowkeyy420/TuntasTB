/**
 * Shared vocabulary of the triage engine. Pure types, no runtime code.
 * The rule files in `rules/` are the single source of truth; the Python
 * component in `langflow/components/triage_rules.py` mirrors this engine.
 */

export type Level = "GREEN" | "YELLOW" | "RED";

export const LEVELS: readonly Level[] = ["GREEN", "YELLOW", "RED"];

export interface TriageSymptom {
  code: string;
  level: Level;
  label_id: string;
  /** True when the symptom is only selectable as a chip and has no lexicon entry. */
  chip_only?: boolean;
}

export interface DurationRule {
  codes: string[];
  min_days: number;
  level: Level;
}

export interface LevelText {
  action_id: string;
  message_id: string;
}

export interface TriageTable {
  version: string;
  review_status: string;
  symptoms: TriageSymptom[];
  duration_rules: DurationRule[];
  unknown_level: Level;
  levels: Record<Level, LevelText>;
  fallback_warning_id: string;
  [extra: string]: unknown;
}

export interface LexiconEntry {
  /** One of these phrases appears. */
  any?: string[];
  /** One term from every group appears in the same sentence. */
  combo?: string[][];
}

export interface DurationPattern {
  pattern: string;
  days: number | string;
}

export interface Lexicon {
  version: string;
  symptoms: Record<string, LexiconEntry>;
  red_flags: Record<string, LexiconEntry>;
  /** Words that point at a symptom the table does not classify: never GREEN. */
  watch_words?: string[];
  durations: DurationPattern[];
  stop_intent: string[];
  stigma: string[];
}

export interface TriageInput {
  /** Symptom codes selected in the UI. */
  chips: string[];
  /** Already redacted free text. */
  text: string;
  /** Symptoms found by extraction (S03), optional. */
  extracted?: { code: string; durationDays?: number }[];
  /** Unknown symptoms flagged by extraction (S03), optional. */
  unknownSymptoms?: string[];
  /** Days a symptom has persisted according to check-in history. */
  persistenceDays?: Record<string, number>;
}

export type DecidedBy =
  | "red_flag_keyword"
  | "table"
  | "duration_rule"
  | "unknown_symptom"
  | "no_symptoms";

export interface TriageResult {
  level: Level;
  /** Matched known symptom codes, sorted. */
  symptoms: string[];
  /** Matched red-flag codes, sorted. */
  redFlags: string[];
  /** Unknown chip/extracted codes, flagged unknowns, `watch:<word>` and `text_unmatched`; sorted. */
  unknown: string[];
  decidedBy: DecidedBy;
  /** `<table version>/<lexicon version>` so callers can store which rules decided. */
  rulesVersion: string;
}

export interface CompiledEntry {
  code: string;
  any: string[];
  combo: string[][];
}

export interface CompiledDuration {
  re: RegExp;
  /** Fixed number of days, or null when the first capture group gives the number. */
  fixed: number | null;
  /** Multiplier applied to the captured number. */
  mult: number;
}

/** Validated and pre-normalised rule data. Build it with `loadRules`. */
export interface Rules {
  table: TriageTable;
  lexicon: Lexicon;
  version: string;
  levelByCode: Map<string, Level>;
  symptomEntries: CompiledEntry[];
  redFlagEntries: CompiledEntry[];
  durations: CompiledDuration[];
  stopIntent: string[];
  stigma: string[];
  watch: string[];
}
