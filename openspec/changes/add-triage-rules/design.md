# Design

## Context

The triage level is the one decision in the product that can hurt someone if it is wrong in the low direction. The architecture fixes two consumers of the same rule data: the TypeScript engine in the web application (runs on every check-in, also when Langflow is down) and a Python component inside the Langflow `checkin_triage` flow. Requirements are in `specs/triage-rules/spec.md`.

## Goals / Non-Goals

**Goals:**

- Rule data that a clinician can review as two JSON files without reading code.
- Two small engines that are pure functions of (rule data, input) and are proven equal by a shared fixture.
- Every change in the unsafe direction is caught by a test.

**Non-Goals:**

- Understanding free text beyond keyword and pattern matching.
- Reducing false RED alarms. Precision is measured by the eval harness, not optimised here.

## Decisions

### `rules/triage-table.json`

```json
{
  "version": "0.1.0-draft",
  "review_status": "draft, belum ditinjau klinisi",
  "symptoms": [
    { "code": "urine_orange",       "level": "GREEN",  "label_id": "Kencing berwarna merah atau oranye" },
    { "code": "nausea_mild",        "level": "GREEN",  "label_id": "Mual ringan setelah minum obat" },
    { "code": "joint_ache_mild",    "level": "GREEN",  "label_id": "Nyeri sendi ringan" },
    { "code": "appetite_loss",      "level": "GREEN",  "label_id": "Kurang nafsu makan" },
    { "code": "tingling_feet",      "level": "YELLOW", "label_id": "Kesemutan atau rasa terbakar di kaki" },
    { "code": "itching_no_rash",    "level": "YELLOW", "label_id": "Gatal tanpa ruam" },
    { "code": "jaundice",           "level": "RED",    "label_id": "Mata atau kulit kuning" },
    { "code": "vision_change",      "level": "RED",    "label_id": "Penglihatan kabur atau warna berubah" },
    { "code": "skin_rash",          "level": "RED",    "label_id": "Ruam kulit" },
    { "code": "vomiting_repeated",  "level": "RED",    "label_id": "Muntah berulang" },
    { "code": "confusion",          "level": "RED",    "label_id": "Bingung atau linglung" }
  ],
  "duration_rules": [
    { "codes": ["nausea_mild", "appetite_loss"], "min_days": 7, "level": "YELLOW" }
  ],
  "unknown_level": "YELLOW",
  "levels": {
    "GREEN":  { "action_id": "Tetap minum obat sesuai jadwal.",
                "message_id": "Keluhan ini umum terjadi dan biasanya berkurang dalam 2 sampai 4 minggu." },
    "YELLOW": { "action_id": "Tetap minum obat sesuai jadwal. Perawat akan menghubungi Anda dalam 1 hari kerja.",
                "message_id": "Keluhan ini perlu diperiksa oleh perawat." },
    "RED":    { "action_id": "Berhenti dulu dan segera ke Puskesmas atau IGD hari ini.",
                "message_id": "Keluhan ini perlu diperiksa petugas kesehatan hari ini. Perawat sudah diberi tahu." }
  },
  "fallback_warning_id": "Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas."
}
```

The `levels` block holds the static Bahasa text per level, translated from the plan's draft table. It lives next to the levels so the clinician reviews the level and what the family is told in one place. `add-daily-checkin` shows it as the reply; `add-family-reply` adds validation, citations and the grounded explanation on top. The RED action is the plan's "Stop and go to the Puskesmas or IGD today"; whether "berhenti dulu" is the right instruction is for the clinician reviewer.

`label_id` doubles as the chip label in the check-in screen. The plan's draft table lists "nausea or poor appetite lasting over 7 days" as YELLOW; the threshold here is "7 days or more" so the demo sentence "mual terus seminggu" is YELLOW and the threshold matches the dropout-risk rule. The earlier threshold is the safer direction.

### `rules/lexicon.id.json`

```json
{
  "version": "0.1.0-draft",
  "symptoms": {
    "urine_orange": { "any": ["kencing merah", "kencing oranye", "pipis merah", "air seni merah"] },
    "nausea_mild":  { "any": ["mual", "eneg", "enek"] },
    "jaundice":     { "combo": [["mata", "kulit", "badan", "muka"], ["kuning", "menguning"]] }
  },
  "red_flags": {
    "jaundice":          { "combo": [["mata", "kulit", "badan", "muka"], ["kuning", "menguning"]] },
    "vision_change":     { "any": ["buram", "kabur", "rabun", "buta warna", "penglihatan"] },
    "skin_rash":         { "any": ["ruam", "bentol", "bercak merah", "kulit melepuh"] },
    "vomiting_repeated": { "any": ["muntah terus", "muntah muntah", "muntah berkali"] },
    "confusion":         { "any": ["linglung", "bingung", "ngelantur", "tidak nyambung"] }
  },
  "durations": [
    { "pattern": "seminggu", "days": 7 },
    { "pattern": "(\\d+) hari", "days": "$1" },
    { "pattern": "(\\d+) minggu", "days": "$1*7" }
  ],
  "stop_intent": ["sudah sembuh", "mau berhenti", "capek minum obat", "bosan minum obat", "tidak mau minum obat lagi"],
  "stigma": ["malu", "takut ketahuan", "takut dijauhi", "jangan sampai tetangga tahu"]
}
```

The lists above are the starting set; the task list grows them from interview phrases. Two match forms:

- `any`: one of the phrases appears.
- `combo`: one term from each group appears in the same sentence. This is how "matanya agak kuning" matches jaundice while "kencingnya kuning pekat" does not. A bare color word with no body part matches no symptom and therefore falls to `unknown_level` (YELLOW), as the spec requires.

### Normalisation

Before matching, both engines apply the same steps in the same order: lower-case, replace punctuation with spaces, collapse runs of three or more identical letters to one, strip the suffixes `-nya`, `-ku`, `-mu`, split into sentences on `.`, `!`, `?`, `;` and line breaks. Phrases match on token boundaries, so "mual" does not match inside another word. The steps are specified in `rules/README.md` and mirrored one for one in both languages; the parity fixture contains at least one case per step.

### Engine contract

```ts
type Level = "GREEN" | "YELLOW" | "RED";
interface TriageInput {
  chips: string[];                         // symptom codes from the UI
  text: string;                            // already redacted
  extracted?: { code: string; durationDays?: number }[];  // from S03, optional
  unknownSymptoms?: string[];              // from S03, optional
  persistenceDays?: Record<string, number>; // from check-in history
}
interface TriageResult {
  level: Level;
  symptoms: string[];      // matched codes, sorted
  redFlags: string[];      // matched red-flag codes, sorted
  unknown: string[];       // unknown chip codes or flagged unknowns
  decidedBy: "red_flag_keyword" | "table" | "duration_rule" | "unknown_symptom" | "no_symptoms";
}
function triage(input: TriageInput, rules: Rules): TriageResult;
function maxLevel(a: Level, b: Level): Level;
```

Evaluation order: collect codes from chips, extracted items and lexicon matches; apply duration rules; take the highest base level; raise to `unknown_level` when anything is unknown or when non-empty text matched nothing; finally force RED when any `red_flags` entry matches. Red flags are evaluated last and unconditionally, so no earlier step can mask them.

### No negation handling

"matanya tidak kuning" is RED. A negation parser that is wrong once produces a missed jaundice; a false RED costs one phone call. The eval harness reports how often this fires so the decision can be revisited with data.

### Python component

`langflow/components/triage_rules.py` holds the same pure functions (`normalise`, `match`, `triage`, `max_level`) at module level, followed by the Langflow `Component` class. The Langflow import is wrapped in `try/except ImportError` so pytest and the offline eval can import the functions without Langflow installed. The component has two text inputs, `triage_table_json` and `lexicon_json`; the deploy script (`add-symptom-extraction`) fills them from the files in `rules/`. Alternative considered: the component reads the files from disk. Rejected: the existing Langflow runs outside our containers and cannot see the repository.

### Parity fixture and coverage of the table

`rules/fixtures/parity.jsonl` has one JSON object per line: `{ "id", "input", "expected": { "level", "symptoms", "redFlags" } }`. Vitest and pytest both load it and assert every line. A second test in each suite walks the rule files and asserts that every symptom code, every red-flag code and every duration rule is the subject of at least one fixture line; a new table entry without a fixture line fails with the entry's name. Vitest coverage thresholds for `web/src/lib/triage/` are set to 100% lines and branches.

### Validation

JSON Schemas in `rules/schema/` plus a referential check (every lexicon and duration code exists in the table; every table code has a lexicon entry or is marked chip-only). The check runs as a unit test and at web application start, where a failure stops the server rather than running with a broken table.

## Cross-cutting

- **Redaction**: the engine only ever receives redacted text. This change passes all lexicon terms to the redactor as `protectedTerms` and adds the test that redaction never lowers the level.
- **Audit logging**: the engine is a pure function and writes nothing. The rule file `version` is returned with each result so the caller can store which rules decided.
- **Neutral wording**: chip labels (`label_id`) are symptom descriptions and are covered by the family forbidden-terms test.
- **Bahasa copy**: labels and lexicon are Bahasa Indonesia, including informal spellings collected from interviews.

## Risks / Trade-offs

- [The table is a draft from a secondary source] → `review_status` is shown in the nurse console footer and in the eval report; clinician sign-off is a release condition outside this change.
- [Keyword matching misses slang not in the lexicon] → Unmatched non-empty text is YELLOW, never GREEN; the lexicon grows from interviews and from eval failures.
- [The two engines drift] → Shared fixture in CI for both; a failing parity test blocks merge.
- [Broad red-flag words such as "bingung" cause false RED] → Accepted; reported as YELLOW/GREEN accuracy and RED precision by the eval harness.

## Open Questions

- Does the current national guideline split minor and major side effects exactly as this draft does? Answering it changes rows in the JSON, not the engine or the tasks.
