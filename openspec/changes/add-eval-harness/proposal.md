# Proposal

## Why

The plan names two numbers that must be perfect before anything is shown to a judge or a nurse: RED recall of 100% and zero dosing or diagnosis outputs. Plan spec **S10 (Eval harness via Bob, P0)** requires a golden set that runs through MCP, a report of RED recall, accuracy, dosing violations and citation coverage, and a CI run that fails when RED recall drops below 100%. Without this, every prompt or rule edit is a gamble on the one failure the product cannot afford.

## What Changes

- A golden set `eval/golden/checkins.jsonl` of at least 120 labelled synthetic check-ins, including red-flag cases in everyday Indonesian, hedged and negated red flags, slang, unknown symptoms, stop-intent and stigma phrases, redaction cases and red-team prompts that ask for doses or a diagnosis.
- A runner `eval/run_eval.py` with two modes: **live**, which calls the Langflow flows through the project's MCP endpoint (`/api/v1/mcp/project/<id>/streamable`) with a REST fallback, and **offline**, which evaluates the deterministic rules and static templates only.
- A report (JSON and Markdown) with RED recall, YELLOW precision, YELLOW/GREEN accuracy, dosing and diagnosis violations, citation coverage, fallback rate and a per-case list of failures.
- Gates: the run fails when RED recall is below 100% or any dosing or diagnosis output is found; a regression check fails when a case that passed in the committed baseline now fails.
- A CI job that runs the offline gate on every push and pull request.
- IBM Bob configuration: `.bob/mcp.example.json` (Langflow project MCP server over streamable HTTP with an `x-api-key` header and `alwaysAllow` empty) and a custom mode "Auditor TB" in `.bob/custom_modes.yaml` with the eval, regression and documentation jobs.

## Capabilities

### New Capabilities

- `eval-harness`: measuring the safety and quality of triage, replies and Q&A against a labelled golden set, through the same MCP tools Bob uses, and blocking releases and merges when a safety gate fails.

### Modified Capabilities

None.

## Out of Scope

- Real patient data. Every case is synthetic.
- Clinical labelling by this change. Cases ship with draft labels; review by a nurse or doctor is a human task tracked per case.
- Enforcing the 90% YELLOW/GREEN accuracy target as a hard gate. It is reported and warned on; only RED recall and dosing or diagnosis violations block.
- Live evaluation in CI. CI has no Langflow or LLM key; the live run is done by a developer or by Bob before a release.
- Usability metrics from the plan (check-in time, nurse triage time, same-day contact, missed pickups), which need people, not a script.
- Load, latency and cost benchmarking.
- Generating the technical documentation and the weekly cohort report themselves; this change gives Bob the mode and tools to do so.
- TB RO, children, TB-HIV cases.

## Impact

- Depends on `add-triage-rules` and `add-dropout-risk-score` (offline mode imports their Python functions), `add-family-reply` (forbidden-output patterns, static templates, manifest), and for live mode on `add-symptom-extraction`, `add-guideline-qa` and `add-nurse-queue-alerts` (the three MCP tools).
- New files: `eval/golden/checkins.jsonl`, `eval/golden/questions.jsonl`, `eval/golden/schema.json`, `eval/run_eval.py`, `eval/tuntas_eval/*`, `eval/baseline.json`, `eval/requirements.txt`, `eval/tests/*`, `.bob/mcp.example.json`, `.bob/custom_modes.yaml`, `web/src/lib/triage/golden.test.ts`.
- Changes `.github/workflows/ci.yml` (adds the offline eval job) and `.gitignore` (`.bob/mcp.json`, `eval/reports/`).
- New Python dependencies for the runner: `mcp`, `httpx`, `jsonschema`, `pytest`.
