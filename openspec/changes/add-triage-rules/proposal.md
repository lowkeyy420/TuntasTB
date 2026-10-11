# Proposal

## Why

The plan's central safety claim is that rules, not the LLM, decide whether a family is told to continue, expect a nurse call, or go to the Puskesmas today. Plan spec **S04 (Triage rules, P0)** requires a deterministic table where the highest level wins, any red-flag keyword forces RED, and the table has 100% unit test coverage. This engine also has to work alone when Langflow is down.

## What Changes

- `rules/triage-table.json`: symptom codes, their level (GREEN, YELLOW, RED), duration-based escalations and the static message template per level. Marked as a draft pending clinician review.
- `rules/lexicon.id.json`: Indonesian keywords and slang per symptom, red-flag keyword patterns, duration phrases, stop-intent words and stigma words.
- A TypeScript triage engine in `web/src/lib/triage/` that reads both files and returns a level with reasons from symptom chips plus a keyword scan of redacted text.
- A Python rule component in `langflow/components/` implementing the same decisions from the same two files, for use inside the `checkin_triage` flow.
- A shared parity fixture run by both the TypeScript and the Python test suites.
- A validator that fails the build when the rule files are malformed or reference unknown codes.

## Capabilities

### New Capabilities

- `triage-rules`: deterministic mapping of reported symptoms and red-flag keywords to GREEN, YELLOW or RED, with escalation-only combination of results and identical behavior across the application and the Langflow rule component.

### Modified Capabilities

None.

## Out of Scope

- Clinical validation of the table. It ships labelled "draft" until a clinician signs off; the review itself is a human task tracked in the plan.
- Diagnosis, naming a condition, or any advice about doses.
- Symptoms specific to TB RO, children or TB-HIV regimens.
- LLM-based extraction of symptoms from text (S03, `add-symptom-extraction`). This change only does keyword matching.
- Writing the family message (S06) and computing dropout risk (S05). Stop-intent and stigma word lists live in the lexicon here but are consumed by `add-dropout-risk-score`.
- Negation handling ("tidak kuning"). A red-flag match always escalates.

## Impact

- Depends on `add-project-foundation` (repo layout, redactor with `protectedTerms`, CI).
- New files: `rules/triage-table.json`, `rules/lexicon.id.json`, `rules/schema/*.json`, `rules/fixtures/parity.jsonl`, `web/src/lib/triage/*`, `langflow/components/triage_rules.py`, `langflow/tests/test_triage_rules.py`.
- CI gains a Python test step (pytest) next to the Vitest step.
- Consumed by `add-daily-checkin`, `add-symptom-extraction`, `add-family-reply`, `add-dropout-risk-score` and `add-eval-harness`.
