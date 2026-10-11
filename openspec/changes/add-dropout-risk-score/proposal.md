# Proposal

## Why

The nurse's morning list is only useful if it is ordered by who is most likely to stop treatment, and only trusted if the nurse can see why. Plan spec **S05 (Dropout risk score, P0)** requires a transparent point score returned with its reasons, where the same input always gives the same score.

## What Changes

- A deterministic risk engine in `web/src/lib/risk/` that turns a snapshot of a patient's situation into points, a band (low, medium, high) and Bahasa Indonesia reason strings.
- The fixed point table: missed dose today +2, each consecutive missed day before today +2 (capped at 10), partial dose +1, stop-intent words +4, stigma words +2, unresolved side effect (same symptom 7 days or more) +3, YELLOW today +1, RED today +5, missed pickup +4, no PMO +2, no check-in for 3 days or more +3. Bands: 0 to 3 low, 4 to 7 medium, 8 or more high.
- Detection of stop-intent and stigma words in redacted text using the lexicon from `rules/lexicon.id.json`.
- A snapshot builder that derives the inputs (consecutive misses, symptom persistence, days since last check-in, missed pickup, PMO presence) from the database for a given date.
- A Python risk component in `langflow/components/` with the same point table, for the `checkin_triage` flow, checked against a shared fixture.

## Capabilities

### New Capabilities

- `dropout-risk`: transparent, deterministic scoring of how likely a patient is to stop treatment, with a band and a reason for every point awarded.

### Modified Capabilities

None.

## Out of Scope

- Machine-learned or probabilistic risk prediction. The score is a sum of documented points.
- Any use of the score to change the triage level, treatment or dose. The score only orders the nurse's list.
- Tuning point values against outcome data; the values are fixed by the plan until a pilot provides evidence.
- Ranking and display of the queue (S07) and the definition of a missed pickup (S09); this change only consumes those facts.
- Showing the score to families. It is nurse-facing only.
- TB RO, children, TB-HIV risk factors.

## Impact

- Depends on `add-project-foundation` and `add-triage-rules` (lexicon, normalisation, level type).
- New files: `rules/risk-points.json`, `rules/fixtures/risk-parity.jsonl`, `web/src/lib/risk/*`, `langflow/components/risk_score.py`, `langflow/tests/test_risk_score.py`.
- Uses `checkins.risk_score`, `risk_band`, `risk_reasons_json` created by the foundation schema.
- Consumed by `add-daily-checkin` (score stored per check-in), `add-nurse-queue-alerts` (ranking), `add-pickup-planner` (missed pickup input) and `add-eval-harness`.
