# rules/

Shared, versioned rule data read by both the TypeScript engines in `web/src/lib/`
(`triage/`, `risk/`) and the Langflow Python components in `langflow/components/`
(`triage_rules.py`, `risk_score.py`). One copy here means both sides make the same
decision; a shared fixture proves it.

> **Status: draft.** `triage-table.json` carries `review_status: "draft, belum
> ditinjau klinisi"`. Clinician sign-off is a release condition outside the code.

| File | Content | Consumed by |
| --- | --- | --- |
| `triage-table.json` | Symptom codes, base level (GREEN/YELLOW/RED), duration rules, `unknown_level`, static Bahasa text per level, fallback warning | triage engines |
| `lexicon.id.json` | Indonesian keywords and slang per symptom, red-flag patterns, watch words, duration phrases, stop-intent and stigma words | triage engines, mood flags |
| `risk-points.json` | The eleven dropout-risk factors with points, caps, thresholds, Bahasa reason texts and the three bands | risk engines |
| `schema/*.schema.json` | JSON Schemas (draft-07) for the three files above | unit tests |
| `fixtures/parity.jsonl` | Triage cases run by Vitest **and** pytest | both suites |
| `fixtures/normalise.json` | Normalisation cases run by Vitest **and** pytest | both suites |
| `fixtures/risk-parity.jsonl` | Risk snapshots run by Vitest **and** pytest | both suites |

## Safety rules the data and engines enforce

1. Rules decide; the LLM never sets a level.
2. The highest level wins (RED > YELLOW > GREEN).
3. Any red-flag keyword forces RED, even when hedged ("agak", "kayaknya") or negated
   ("tidak kuning"). There is no negation handling on purpose: a false RED costs one
   phone call, a missed jaundice costs more.
4. Unknown or unmatched input is at least `unknown_level` (YELLOW), never GREEN.
5. Red flags are evaluated last and unconditionally, so no earlier step can mask them.
6. The risk score only orders the nurse's list. It never lowers or replaces a level.

## `triage-table.json`

`symptoms[]` has `code` (`^[a-z][a-z0-9_]*$`), `level`, `label_id` (also the chip label)
and optional `chip_only: true` (no lexicon entry needed). `duration_rules[]` raise
`codes` to `level` when the symptom has lasted `min_days` or more (7 days or more, the
safer direction). `unknown_level` must be YELLOW or RED. `levels` holds the static
`action_id` / `message_id` per level.

## `lexicon.id.json`

`symptoms` and `red_flags` map a table code to an entry with either or both of:

- `any`: one of these phrases appears.
- `combo`: two or more groups; one term from **each** group appears in the **same
  sentence**. `"matanya agak kuning"` matches jaundice; `"kencingnya kuning pekat"` does not
  (no body part), so it falls to `unknown_level`.

Every table code needs an entry in `symptoms` or `red_flags` unless it is `chip_only`.
RED codes are defined under `red_flags` only; a red-flag match also reports the code in
`symptoms`.

`watch_words` (addition to the design) are words that point at a symptom the table does
not classify (`kuning`, `muntah`, `demam`, `sesak`, `pusing`, ...). A hit is an unknown
symptom (`watch:<word>`), so "mual muntah" is YELLOW rather than GREEN. They are ignored
once a red flag has decided RED.

`durations[]` have a regular expression `pattern` and `days`: a number, `"$1"` (first
capture group) or `"$1*N"`. Patterns are wrapped in token boundaries
(`(?<![a-z0-9])(?:pattern)(?![a-z0-9])`) and run per normalised sentence; the longest
duration found wins. `stop_intent` and `stigma` are consumed by the risk engine.

## Normalisation (identical in TypeScript and Python)

1. Lower-case the text.
2. Split into sentences on `.` `!` `?` `;` and line breaks (a comma does not split).
3. Per sentence, replace every character outside `a-z0-9` with a space.
4. Collapse runs of three or more identical **letters** to one (`MUALLL` -> `mual`).
5. Split on spaces and strip one suffix `-nya`, `-ku` or `-mu` from each token, only when
   at least three characters remain (`matanya` -> `mata`, `aku` stays `aku`).
6. Rejoin tokens with single spaces; drop empty sentences.

Phrases are matched on token boundaries after the same normalisation, so `mual` does not
match inside another word. Lexicon phrases are normalised the same way when loaded.

## Evaluation order (triage)

Collect codes (chips, extraction, lexicon) -> highest table level -> duration rules (longest
of text, extraction and history) -> unknown handling (unknown chip/extracted code, flagged
unknown symptom, watch word, or non-empty text where no symptom/red-flag term matched) ->
red-flag override. `decidedBy` is one of `red_flag_keyword`, `table`, `duration_rule`,
`unknown_symptom`, `no_symptoms`. Every result carries `rulesVersion`
(`<table version>/<lexicon version>`).

## `risk-points.json`

Eleven factors in a fixed order (reasons are emitted in this order):
`missed_dose_today` +2, `consecutive_missed_day` +2 per day capped at 10, `partial_dose` +1,
`stop_intent` +4, `stigma` +2, `unresolved_side_effect` +3 (same symptom 7 days or more, once),
`yellow_today` +1, `red_today` +5, `missed_pickup` +4, `no_pmo` +2, `no_checkin` +3 (3 days or
more). Bands: 0-3 low, 4-7 medium, 8+ high. `text_id` is the Bahasa reason; `{n}` is replaced
by the number of days. The points in the reasons always sum to the score.

## Fixtures

- `parity.jsonl`: `{ "id", "input": {chips, text, extracted?, unknownSymptoms?, persistenceDays?},
  "expected": {level, symptoms, redFlags, decidedBy?} }` per line. `symptoms` / `redFlags` are sorted.
  Expected values are written by hand from the specs, not generated by the engine.
- `risk-parity.jsonl`: `{ "id", "snapshot", "expected": {score, band, factors} }` per line.
- Coverage guard: a test in each suite fails and names any symptom code, red-flag code or
  duration rule (per code) that no `parity.jsonl` line exercises.

## Editing the rules

Change JSON only; neither engine needs a code change. Then add or adjust a fixture line and run:

```sh
cd web && npx vitest run src/lib/triage src/lib/risk
python -m pytest langflow/tests -q
```

Invalid files (malformed, unknown codes, lexicon entries naming a code missing from the table)
make `loadRules` / `load_rules` throw and name every problem.
