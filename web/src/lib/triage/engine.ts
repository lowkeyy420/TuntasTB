import { hasAny, matchCodes, parseDurationDays } from "./match";
import { normalise } from "./normalise";
import type { DecidedBy, Level, Rules, TriageInput, TriageResult } from "./types";

const RANK: Record<Level, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

/** The higher of two levels (RED above YELLOW above GREEN). Never returns less than either input. */
export function maxLevel(a: Level, b: Level): Level {
  return RANK[a] >= RANK[b] ? a : b;
}

const sortedUnique = (items: Iterable<string>): string[] => [...new Set(items)].sort();

/**
 * Deterministic triage. Pure function of (rules, input): no clock, no I/O.
 *
 * Order: collect codes (chips, extraction, lexicon) -> highest table level ->
 * duration rules -> unknown handling (never GREEN) -> red-flag override last
 * and unconditionally, so no earlier step can mask a red flag.
 */
export function triage(input: TriageInput, rules: Rules): TriageResult {
  const sentences = normalise(input.text);
  const extracted = input.extracted ?? [];
  const persistence = input.persistenceDays ?? {};

  // 1. Collect codes.
  const textSymptoms = matchCodes(sentences, rules.symptomEntries);
  const redFlags = sortedUnique(matchCodes(sentences, rules.redFlagEntries));
  const claimed = [
    ...input.chips,
    ...extracted.map((e) => e.code),
    ...textSymptoms,
    ...redFlags,
  ];
  const known = sortedUnique(claimed.filter((c) => rules.levelByCode.has(c)));
  const unknown = new Set<string>([
    ...claimed.filter((c) => !rules.levelByCode.has(c)),
    ...(input.unknownSymptoms ?? []),
  ]);
  if (sentences.length > 0 && textSymptoms.length === 0 && redFlags.length === 0) {
    unknown.add("text_unmatched");
  }
  // Watch words only matter when no red flag already decided the level.
  for (const word of redFlags.length === 0 ? rules.watch : []) {
    if (hasAny(sentences, [word])) unknown.add(`watch:${word}`);
  }

  // 2. Highest base level.
  let base: Level = "GREEN";
  for (const code of known) base = maxLevel(base, rules.levelByCode.get(code) as Level);

  // 3. Duration rules: longest of text, extraction and history.
  const textDays = parseDurationDays(sentences, rules.durations);
  let duration: Level = "GREEN";
  for (const rule of rules.table.duration_rules) {
    for (const code of rule.codes.filter((c) => known.includes(c))) {
      const days = Math.max(
        textDays,
        persistence[code] ?? 0,
        ...extracted.filter((e) => e.code === code).map((e) => e.durationDays ?? 0),
      );
      if (days >= rule.min_days) duration = maxLevel(duration, rule.level);
    }
  }

  // 4. Unknown is never GREEN.
  const unknownLevel: Level = unknown.size > 0 ? rules.table.unknown_level : "GREEN";

  // 5. Red flags last, unconditionally.
  let level = maxLevel(maxLevel(base, duration), unknownLevel);
  if (redFlags.length > 0) level = "RED";

  let decidedBy: DecidedBy;
  if (redFlags.length > 0) decidedBy = "red_flag_keyword";
  else if (level === "GREEN" && known.length === 0) decidedBy = "no_symptoms";
  else if (level === base) decidedBy = "table";
  else if (level === duration) decidedBy = "duration_rule";
  else decidedBy = "unknown_symptom";

  return {
    level,
    symptoms: known,
    redFlags,
    unknown: sortedUnique(unknown),
    decidedBy,
    rulesVersion: rules.version,
  };
}
