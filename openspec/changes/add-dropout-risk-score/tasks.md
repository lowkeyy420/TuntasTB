# Tasks

## 1. Point table

- [ ] 1.1 Write `rules/risk-points.json` and its JSON Schema with the eleven factors and three bands from design.md; verify it validates and a unit test asserts each point value equals the plan's list
- [ ] 1.2 Add the reason texts to `web/src/copy/nurse.id.ts` keyed by factor; verify a unit test finds a text for every factor in the point table

## 2. Scoring engine (TypeScript)

- [ ] 2.1 Define `RiskSnapshot` and `RiskResult` types and implement adherence scoring (missed today, consecutive with cap, partial) with unit tests for the five adherence scenarios; verify the tests pass
- [ ] 2.2 Implement word, side-effect, triage-level and program factors with unit tests for each scenario in the spec; verify the tests pass
- [ ] 2.3 Implement the total, banding and ordered reasons with unit tests for the boundaries 3, 4, 7, 8, the demo day 41 case (score 8, high) and the zero case; verify the tests pass
- [ ] 2.4 Add tests that reason points sum to the score for 200 generated snapshots and that 100 repeated evaluations are identical; verify the tests pass
- [ ] 2.5 Set coverage thresholds for `web/src/lib/risk/score.ts` to 100% lines and branches; verify `npm run test:coverage` passes

## 3. Mood flags

- [ ] 3.1 Implement `detectMoodFlags` over the lexicon's stop-intent and stigma lists using the triage normaliser, with unit tests for "sudah sembuh", "mau berhenti", "capek minum obat", "malu", "takut ketahuan" and a text with none; verify the tests pass
- [ ] 3.2 Implement the OR-merge with extraction flags, with tests that extraction can add but not remove a flag and that `boredom` alone adds nothing; verify the tests pass

## 4. Snapshot builder

- [ ] 4.1 Implement the latest-check-in-per-day query and `consecutiveMissedBefore` with tests for a run stopped by a taken dose and a run broken by a day without a check-in; verify the tests pass against the test database
- [ ] 4.2 Implement symptom persistence from history with tests for the 7-day run, the reset after a gap and the stated-duration override; verify the tests pass
- [ ] 4.3 Implement `daysSinceLastCheckin` (including the never-checked-in case), `hasPmo` and `missedPickup` with tests for 2 days, 3 days and a patient registered 4 days ago; verify the tests pass
- [ ] 4.4 Implement `buildRiskSnapshot(db, patientId, asOf, todayInput?)` combining the pieces, with a test that two evaluation dates over the same history differ only in the date-dependent factors; verify the test passes

## 5. Python component and parity

- [ ] 5.1 Create `rules/fixtures/risk-parity.jsonl` with at least 40 snapshots covering every factor, the cap and each band boundary; verify every line is valid JSON
- [ ] 5.2 Add the Vitest parity test over the fixture; verify it passes
- [ ] 5.3 Implement `score_risk` and the guarded Langflow `Component` in `langflow/components/risk_score.py` with a pytest parity test over the same fixture; verify `pytest langflow/tests/test_risk_score.py` passes without Langflow installed

## 6. Documentation

- [ ] 6.1 Add `docs/risk-score.md` with the point table, bands, the readings from design.md and the demo example, generated from `rules/risk-points.json` by a script; verify the script output matches the committed file
