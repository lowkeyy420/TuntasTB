# Tasks

## 1. Rule data

- [ ] 1.1 Write `rules/triage-table.json` with the eleven symptom codes, the duration rule, `unknown_level`, the per-level static texts, `fallback_warning_id` and `review_status` from design.md; verify it parses and lists every symptom of the plan's draft table
- [ ] 1.2 Write `rules/lexicon.id.json` symptom entries with at least five Indonesian variants per symptom code; verify each table code has an entry
- [ ] 1.3 Add red-flag patterns, duration patterns, stop-intent words and stigma words to the lexicon; verify the five RED symptoms each have a red-flag entry
- [ ] 1.4 Write JSON Schemas in `rules/schema/` and `rules/README.md` describing the file formats and the normalisation steps; verify both rule files validate against the schemas

## 2. TypeScript engine

- [ ] 2.1 Implement the rule loader and validator (schema plus referential check) with unit tests for a malformed file and for a lexicon entry naming an unknown code; verify the tests pass
- [ ] 2.2 Implement `normalise` (case, punctuation, repeated letters, suffixes, sentence split) with unit tests per step including "MUALLL banget"; verify the tests pass
- [ ] 2.3 Implement `any` and `combo` matching on token boundaries with unit tests including "matanya agak kuning" matching and "kencingnya kuning pekat" not matching jaundice; verify the tests pass
- [ ] 2.4 Implement the duration parser with unit tests for "seminggu", "3 hari" and "2 minggu"; verify the tests pass
- [ ] 2.5 Implement `triage` (table lookup, highest wins, duration rule, unknown handling, red-flag override, reasons) with one unit test per scenario in the spec; verify the tests pass
- [ ] 2.6 Implement `maxLevel` with unit tests for all nine level pairs; verify the tests pass
- [ ] 2.7 Set Vitest coverage thresholds for `web/src/lib/triage/` to 100% lines and branches; verify `npm run test:coverage` passes

## 3. Parity fixture and table coverage

- [ ] 3.1 Create `rules/fixtures/parity.jsonl` with at least 60 cases covering every symptom code, every red-flag code, the duration rule, unknown inputs, hedged and negated red flags and each normalisation step; verify every line is valid JSON with `id`, `input` and `expected`
- [ ] 3.2 Add the Vitest parity test and the table-coverage test that names any rule entry without a fixture line; verify both pass and that removing a fixture line makes the coverage test fail
- [ ] 3.3 Add the determinism test (same input 100 times); verify it passes

## 4. Python rule component

- [ ] 4.1 Implement `normalise`, matching and the duration parser in `langflow/components/triage_rules.py` mirroring the TypeScript steps; verify `pytest langflow/tests -k normalise` passes with the same cases as the TypeScript unit tests
- [ ] 4.2 Implement `triage` and `max_level` in Python and the pytest parity test over `rules/fixtures/parity.jsonl`; verify every fixture line passes
- [ ] 4.3 Add the Langflow `Component` class with `triage_table_json` and `lexicon_json` inputs behind a guarded import; verify the module imports without Langflow installed and the class is defined when Langflow is installed
- [ ] 4.4 Add the Python table-coverage test; verify it passes

## 5. Redaction safety

- [ ] 5.1 Pass the lexicon terms to the redactor as `protectedTerms` through a shared helper; verify with a unit test that every lexicon keyword survives redaction inside a sample sentence
- [ ] 5.2 Add the property-style test that for every parity fixture text, with injected phone numbers, names and addresses, the level after redaction is not lower than before; verify it passes

## 6. Wiring and CI

- [ ] 6.1 Validate the rule files at web application start and stop the server on failure; verify by starting with a corrupted copy of the table in a test
- [ ] 6.2 Add a pytest step to `.github/workflows/ci.yml` with `langflow/requirements-dev.txt`; verify the workflow runs both the Vitest and the pytest suites
- [ ] 6.3 Add `docs/triage-table.md` generated from the JSON as a human-readable table for the clinician review, with a script to regenerate it; verify the script output matches the committed file
