# Design

## Context

The point values and bands are fixed by the plan and the architecture decisions. What is left to design is where the inputs come from, how ambiguous phrases in the point list are read, and how the application and the Langflow component stay equal. Requirements are in `specs/dropout-risk/spec.md`. `add-triage-rules` supplies the lexicon, the normaliser and the `Level` type.

## Goals / Non-Goals

**Goals:**

- A pure function `scoreRisk(snapshot, points)` with no I/O and no clock.
- One place, `buildRiskSnapshot`, that reads the database, so both the check-in route and the nurse queue score the same way.
- Reasons a nurse can read aloud.

**Non-Goals:**

- Predictive accuracy. The score is an ordering heuristic.
- Storing a history of score changes beyond the score saved on each check-in.

## Decisions

### Point table as data

`rules/risk-points.json`:

```json
{
  "version": "0.1.0",
  "factors": {
    "missed_dose_today":      { "points": 2 },
    "consecutive_missed_day": { "points": 2, "cap": 10 },
    "partial_dose":           { "points": 1 },
    "stop_intent":            { "points": 4 },
    "stigma":                 { "points": 2 },
    "unresolved_side_effect": { "points": 3, "min_days": 7 },
    "yellow_today":           { "points": 1 },
    "red_today":              { "points": 5 },
    "missed_pickup":          { "points": 4 },
    "no_pmo":                 { "points": 2 },
    "no_checkin":             { "points": 3, "min_days": 3 }
  },
  "bands": [ { "max": 3, "band": "low" }, { "max": 7, "band": "medium" }, { "band": "high" } ]
}
```

A third file in `rules/` keeps the numbers out of two codebases. The triage table and lexicon stay the source of truth for levels and words; this file only holds points. Alternative considered: constants in each language. Rejected because the plan wants the points visible and the two implementations equal.

### Snapshot

```ts
interface RiskSnapshot {
  doseStatus: "yes" | "no" | "partial" | null;  // null when there is no check-in to score
  consecutiveMissedBefore: number;   // days before the scored day, unbroken, dose "no"
  stopIntent: boolean;
  stigma: boolean;
  maxPersistenceDays: number;        // longest persistence among today's symptoms, 0 if none
  level: "GREEN" | "YELLOW" | "RED" | null;
  missedPickup: boolean;
  hasPmo: boolean;
  daysSinceLastCheckin: number;
}
interface RiskResult {
  score: number;
  band: "low" | "medium" | "high";
  reasons: { factor: string; points: number; text: string }[];
}
```

Reasons are emitted in the fixed order of the `factors` object so the output is byte-for-byte stable.

### Readings of the point list

- "Missed dose today +2, each consecutive missed day +2 (cap 10)": today's miss is its own factor; the consecutive factor counts the days before today and is capped at 10 points. Missing today and the two days before gives 6.
- A partial dose does not extend a run of missed days and does not break the definition of "missed": only `no` counts.
- A calendar day with no check-in breaks the run. Silence is scored by `no_checkin`, so counting it twice is avoided.
- `yellow_today` and `red_today` are exclusive and use the final triage level (after combining local and flow results).
- `unresolved_side_effect` is awarded once however many symptoms qualify.
- `no_checkin` uses whole Jakarta calendar days between the evaluation date and the most recent check-in; with no check-in at all, days since the patient was registered.

### When the score is computed

1. **At check-in** (`add-daily-checkin`): the snapshot is built for the check-in's date with today's dose status, text flags and final level; `daysSinceLastCheckin` is 0. The result is stored on the check-in row.
2. **When the queue is read** (`add-nurse-queue-alerts`): the snapshot is built for the current date. The check-in-day factors (dose, words, persistence, level) come from the patient's most recent check-in; `daysSinceLastCheckin` and `missedPickup` are evaluated for now. This is how a patient who went silent rises in the list without a new check-in.

Both paths call `buildRiskSnapshot(db, patientId, asOf, todayInput?)` and then `scoreRisk`.

### Mood flags

`detectMoodFlags(redactedText, lexicon)` reuses the triage normaliser and `any` matching over `lexicon.stop_intent` and `lexicon.stigma`. The result is OR-ed with flags from extraction (`stop_intent`, `stigma`). Extraction can add a flag but cannot remove one found by the lexicon. The extraction flag `boredom` is treated as stop intent only when the lexicon also matches a stop-intent phrase such as "bosan minum obat"; on its own it adds no points, because the plan's point list has no boredom factor.

### Persistence

For each symptom code in today's check-in, walk back through the patient's check-ins (latest per day) while each one contains the code; persistence is the number of days from the earliest of those to today, inclusive. The duration stated in today's text (parsed by the triage duration parser) or supplied by extraction replaces it when larger.

### Reason texts

| Factor | Text |
| --- | --- |
| missed_dose_today | Tidak minum obat hari ini |
| consecutive_missed_day | Tidak minum obat {n} hari berturut-turut sebelumnya |
| partial_dose | Obat hari ini hanya diminum sebagian |
| stop_intent | Mengatakan ingin berhenti atau merasa sudah sembuh |
| stigma | Menyebut rasa malu atau takut diketahui orang |
| unresolved_side_effect | Keluhan yang sama sudah {n} hari |
| yellow_today | Keluhan hari ini perlu dihubungi perawat |
| red_today | Ada tanda bahaya hari ini |
| missed_pickup | Jadwal ambil obat terlewat |
| no_pmo | Tidak ada pendamping minum obat |
| no_checkin | Tidak ada laporan selama {n} hari |

Texts live in `web/src/copy/nurse.id.ts` and are duplicated in the Python component from the same JSON export so both produce the same strings.

### Python component

`langflow/components/risk_score.py` contains `score_risk(snapshot, points)` and a guarded Langflow `Component` class with a `risk_points_json` input filled by the deploy script. Inside the flow the snapshot's history fields arrive in the request's `context` object, built by the application; the flow cannot read the database. The score the application stores is always its own; the flow's score is kept for comparison in the eval report.

`rules/fixtures/risk-parity.jsonl` holds `{ id, snapshot, expected: { score, band, factors } }` and is run by Vitest and pytest.

## Cross-cutting

- **Redaction**: mood-flag detection runs on redacted text only. The snapshot sent to the flow contains counts, booleans and codes, never text or identifiers.
- **Audit logging**: scoring is a computation and is not audited by itself. The stored score and reasons are covered by the `checkin.create` audit entry; queue reads are audited by the queue change.
- **Neutral wording**: the score and its reasons are shown only in the nurse console. Reason texts still avoid naming the illness so a screen seen over a shoulder reveals little.
- **Bahasa copy**: all reason texts are Bahasa Indonesia, written as short statements a nurse can repeat on the phone.

## Risks / Trade-offs

- [Point values are a guess] → They are data in one file, shown with reasons, and a nurse can ignore the order. Tuning waits for pilot data.
- [Families who report honestly score higher than families who do not report] → `no_checkin` (+3) and `no_pmo` (+2) raise silent patients; the queue also lists days since last report.
- [A stop-intent phrase missed by the lexicon scores 0] → Extraction flags are OR-ed in; the lexicon grows from interview phrases (plan interview question 5).
- [Queue-time score differs from the score stored on the last check-in] → Intended; the queue shows the current score and the timeline shows the stored one, both with reasons.

## Open Questions

- Should a second YELLOW day in a row weigh more than the first? Not in the plan's point list; left for pilot feedback.
