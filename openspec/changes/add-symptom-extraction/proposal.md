# Proposal

## Why

Families write the way they talk: "mual terus, matanya agak kuning", "Dimas bilang udah sembuh". Keyword rules catch the red flags, but an LLM reads the rest far better. Plan spec **S03 (Symptom extraction, P0)** allows this on two conditions: the LLM returns schema-valid JSON or the request fails to YELLOW, and unknown symptoms are flagged, never dropped. This change adds the Langflow call to the check-in pipeline under those conditions.

## What Changes

- The Langflow flow `checkin_triage` (first version): input parsing, an LLM step with structured output that extracts symptoms, dose status, mood flags and a confidence value, then the Python triage rule component and the Python risk component.
- `langflow/scripts/deploy_flows.py`: creates or updates the flows in the existing Langflow in a project named "TuntasTB", injects the component sources and rule files, and enables the flows as MCP tools.
- A server-side Langflow client in the web application (`x-api-key`, 15 s timeout) and a strict schema for the flow's JSON output.
- The check-in pipeline's `enrich` step now calls the flow. The final level is the higher of the local level and the flow level. Invalid output, timeout or error gives at least YELLOW and the static fallback message.
- Unknown symptoms and low extraction confidence raise the level to at least YELLOW.
- The check-in is stored with its local result before the flow is called, so a locally detected RED alerts the nurse without waiting for the LLM.

## Capabilities

### New Capabilities

- `symptom-extraction`: turning a redacted free-text check-in into structured fields with an LLM inside Langflow, validating the result strictly, and combining it with the deterministic rules so that it can raise but never lower the outcome.

### Modified Capabilities

None. The behavior of `daily-checkin` and `triage-rules` is unchanged; this change adds an input to them through the escalation-only combination they already define.

## Out of Scope

- Letting the LLM choose or influence the triage level in any way other than supplying extracted fields to the rule component.
- The explanation, family message, nurse line and citations (S06, `add-family-reply`). The flow returns these fields empty in this change.
- Corpus ingestion and retrieval (S06, S08).
- Fine-tuning, model evaluation and prompt optimisation beyond what the eval harness (S10) measures.
- Languages other than Bahasa Indonesia, and audio input to the LLM.
- Running Langflow in production or changing the existing Langflow's own configuration beyond the "TuntasTB" project.
- Diagnosis, dose changes, TB RO, children, TB-HIV.

## Impact

- Depends on `add-project-foundation`, `add-triage-rules`, `add-dropout-risk-score` and `add-daily-checkin`.
- New files: `langflow/flows/checkin_triage.json`, `langflow/components/extract_parse.py`, `langflow/scripts/deploy_flows.py`, `langflow/README.md`, `web/src/lib/langflow/*`, `web/src/lib/checkin/enrich.ts`.
- Changes `web/src/lib/checkin/pipeline.ts` to the two-phase order described in design.md.
- External: needs a reachable Langflow v1.12 with a `GOOGLE_API_KEY` global variable and an API key for `LANGFLOW_API_KEY`. Redacted text is sent to the LLM provider configured in Langflow.
