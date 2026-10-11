export { triage, maxLevel } from "./engine";
export { normalise, normaliseSentence } from "./normalise";
export { hasPhrase, hasAny, matchEntry, matchCodes, parseDurationDays } from "./match";
export { loadRules, validateRuleData, RulesValidationError } from "./rules";
export { lexiconProtectedTerms } from "./protectedTerms";
export { redactAndTriage } from "./redactTriage";
export type {
  Level,
  Rules,
  TriageInput,
  TriageResult,
  TriageTable,
  Lexicon,
  DecidedBy,
} from "./types";
export { LEVELS } from "./types";
// File-system helpers (`defaultRules`, `assertRulesValid`, `loadRulesFromDir`)
// live in ./loadFiles and are imported from there by server-side callers.
