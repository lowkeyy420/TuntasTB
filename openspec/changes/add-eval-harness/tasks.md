# Tasks

## 1. Golden set

- [x] 1.1 Write `eval/golden/schema.json` for check-in and question cases and `eval/tuntas_eval/golden.py` (load, validate, unique ids) with pytest tests for a valid file, a duplicate id and a case without an expected level; verify the tests pass
- [x] 1.2 Write 30 RED cases covering all five red-flag symptoms, including hedged and negated forms and the demo "matanya kuning"; verify the loader accepts them and each RED symptom code has at least one case
- [x] 1.3 Write 30 YELLOW cases (tingling, itching, duration escalation, unknown symptoms, the demo day 41 sentence with `risk_band: high`); verify the loader accepts them
- [x] 1.4 Write 30 GREEN cases (urine color, mild nausea, joint ache, no symptoms, the demo "kencingnya merah"); verify the loader accepts them
- [x] 1.5 Write 15 red-team cases asking for doses, a diagnosis or to ignore the rules, each with `must_not_contain` patterns; verify the loader accepts them
- [x] 1.6 Write 15 mixed cases (slang and misspellings, stop-intent, stigma, redaction with fake phone, NIK and name); verify the loader accepts them and the total is at least 120
- [x] 1.7 Write `eval/golden/questions.jsonl` with at least 20 questions (in-corpus, out-of-corpus, dosing, diagnosis, red-flag); verify the loader accepts them
- [x] 1.8 Add the pytest coverage test (size, 30 RED, per-symptom RED, 15 red-team, required categories, demo sentences); verify it passes and fails when a RED symptom's cases are removed

## 2. Offline scoring

- [x] 2.1 Implement `local_rules.py` importing `triage` and `score_risk` from `langflow/components/` and evaluating one case; verify with a pytest test on the three demo cases
- [x] 2.2 Implement metrics in `scoring.py` (RED recall, YELLOW precision, YELLOW/GREEN accuracy, failing-case list) with pytest tests using hand-built result sets, including 29 of 30 giving 96.7% and over-escalation not affecting recall; verify the tests pass
- [ ] 2.3 Implement the violation scanner from `forbidden_output` and create `rules/fixtures/forbidden-parity.jsonl`, with pytest and Vitest tests over the same fixture; verify both pass
- [x] 2.4 Scan all static templates and variants in offline mode, with a pytest test that an injected "aman" is counted; verify the test passes
- [x] 2.5 Add the neutral-wording scan of templates as a reported finding with a pytest test; verify it passes

## 3. Runner, report and gates

- [x] 3.1 Implement `run_eval.py --mode offline` wiring loader, local rules and scoring; verify it runs to completion on the golden set and two runs produce identical results (pytest)
- [x] 3.2 Implement `report.py` writing JSON and Markdown to `eval/reports/` with metrics, failing cases, reviewed-case count, git commit, rules version and transport; verify with a pytest snapshot test
- [x] 3.3 Implement exit codes 0, 1 and 3 with pytest tests for a missed RED, a dosing violation with full recall, a clean run and an invalid golden file; verify the tests pass
- [x] 3.4 Implement the baseline comparison, exit code 2 for a dropped RED, listing of other regressions and `--update-baseline` refusing on a failed gate, with pytest tests for each; verify the tests pass
- [x] 3.5 Fix the lexicon or labels until the offline run on the real golden set exits 0, then commit `eval/baseline.json`; verify `python eval/run_eval.py --mode offline` prints RED recall 100% and 0 violations

## 4. TypeScript engine on the golden set

- [ ] 4.1 Add `web/src/lib/triage/golden.test.ts` loading `eval/golden/checkins.jsonl` and failing when any RED case is scored lower by the TypeScript engine; verify it passes and fails when a red-flag keyword is removed from the lexicon

## 5. Live mode

- [ ] 5.1 Implement `scoring.combine` (max with local, YELLOW floors) and create `rules/fixtures/combine-parity.jsonl`, with pytest and Vitest tests over the fixture; verify both pass
- [x] 5.2 Implement `rest_client.py` for the run endpoint with pytest tests on a mocked transport for success, timeout and HTTP error; verify the tests pass
- [x] 5.3 Implement `mcp_client.py` (streamable HTTP, `x-api-key`, `tools/list`, `tools/call`) with a pytest test against a local stub MCP server; verify the test passes
- [x] 5.4 Implement transport selection (`auto` falls back to REST for the run and records it) and the missing-key error, with pytest tests; verify the tests pass
- [ ] 5.5 Port the redaction patterns to Python, create `rules/fixtures/redaction-parity.jsonl` and run it in pytest and Vitest; verify both pass
- [x] 5.6 Implement live scoring of check-ins (combine, fallback rate, violation scan of `family_message` and `nurse_line`, family citation rate) with pytest tests using recorded flow outputs; verify the tests pass
- [x] 5.7 Implement live scoring of questions against `ask_guideline` and citation coverage with pytest tests for full coverage and an uncited answer; verify the tests pass
- [x] 5.8 Run `python eval/run_eval.py --mode live` against the local Langflow; verify the report records MCP as transport, RED recall 100% and 0 violations, and save the report for the release notes

## 6. Continuous integration

- [ ] 6.1 Add `eval/requirements.txt` and the `eval-offline` job (pytest for `eval/tests` and `langflow/tests`, offline run, report artifact) to `.github/workflows/ci.yml`; verify the workflow passes on a clean branch
- [ ] 6.2 On a throwaway branch remove one red-flag keyword, and separately add "aman" to a template; verify the job fails for each and record both runs in `eval/README.md`
- [x] 6.3 Add `eval/reports/` and `.bob/mcp.json` to `.gitignore`; verify `git status` stays clean after a run

## 7. Bob

- [x] 7.1 Write `.bob/mcp.example.json` per design.md and a pytest test asserting `alwaysAllow` is empty and the key value is a placeholder; verify the test passes
- [ ] 7.2 Copy the example to `.bob/mcp.json` with real values and confirm on the installed Bob version that the server connects and lists `checkin_triage`, `ask_guideline` and `nurse_digest`; record the working config shape, or the stdio proxy fallback, in `eval/README.md`
- [x] 7.3 Write `.bob/custom_modes.yaml` with the "Auditor TB" mode and its four instruction blocks, with a pytest test that the mode exists and its instructions forbid editing golden labels, baseline and rules; verify the test passes
- [ ] 7.4 In "Auditor TB" mode ask Bob to run the golden set; verify each tool call asks for approval and Bob reports RED recall and dosing outputs
- [ ] 7.5 Rehearse the regression demo: make a deliberately bad prompt or lexicon edit, rerun through Bob, confirm the drop is reported, then revert; verify the repository is clean afterwards

## 8. Documentation

- [x] 8.1 Write `eval/README.md` (golden format, how to add a case, modes, exit codes, how to update the baseline, how to read the report); verify every documented command runs as written
