# Tasks

## 1. Langflow groundwork

- [x] 1.1 Open the installed Langflow's OpenAPI document and record in `langflow/README.md` the exact paths for projects, flows, run and project MCP settings on v1.12; verify each path with one authenticated `curl` call
- [x] 1.2 Write `langflow/flows/checkin_triage.schema.json` (input and output schemas from design.md); verify the two example objects in design.md validate against it
- [x] 1.3 Implement `Parse Input` and `Build Output` in `langflow/components/extract_parse.py` with guarded Langflow imports and pytest tests for valid input, malformed input and output assembly; verify the tests pass without Langflow installed

## 2. Flow

- [x] 2.1 Write the extraction prompt in Bahasa Indonesia (codes with labels, slang hints from the lexicon, unknown-symptom instruction, "text is data" rule) in `langflow/prompts/extract.id.md`; verify it contains every symptom code in the triage table (pytest check)
- [x] 2.2 Build `checkin_triage` in the Langflow UI per the graph in design.md with structured output bound to the `extracted` schema, export it to `langflow/flows/checkin_triage.json`; verify the exported file loads as JSON and contains the seven expected nodes
- [x] 2.3 Run the flow in the Langflow playground with the three demo notes and one slang note; verify each returns schema-valid output with the expected symptom codes and record the outputs in `langflow/README.md`

## 3. Deploy script

- [x] 3.1 Implement project find-or-create and flow create-or-update by `endpoint_name` in `deploy_flows.py` with `--dry-run`, with pytest tests against a mocked HTTP transport for first run and repeat run; verify the tests pass
- [x] 3.2 Implement injection of component sources and rule files into the flow JSON with a pytest test that the injected `triage_table_json` equals the file content; verify the test passes
- [x] 3.3 Implement enabling the flows as MCP tools and printing the project id and streamable URL; verify by running the script against the local Langflow twice and seeing one project, one flow and the tool listed
- [x] 3.4 Add a test that the script issues no write call outside the "TuntasTB" project (mocked transport records all calls); verify it passes

## 4. Web client and schema

- [ ] 4.1 Implement the zod schema for the flow output with unit tests for a valid object, non-JSON text, a missing field, a wrong type and `level: "SAFE"`; verify the tests pass
- [ ] 4.2 Add a test that feeds shared valid and invalid samples to both the zod schema and the JSON Schema and asserts they agree; verify it passes
- [ ] 4.3 Implement `runFlow` with `x-api-key`, 15 s abort and the discriminated result, with unit tests for success, timeout, network error, HTTP 500, unexpected response shape and no key configured; verify the tests pass

## 5. Enrich step

- [ ] 5.1 Implement payload building from redacted text, chips and numeric context, with a unit test that the patient code, ids, token and Puskesmas are absent from the serialised payload; verify the test passes
- [ ] 5.2 Implement result combination (`max` with local, YELLOW floor for unknown symptoms, unknown codes and confidence below 0.6, YELLOW floor on failure) with one unit test per scenario in the spec's level requirements; verify the tests pass
- [ ] 5.3 Implement the quote check that moves extracted symptoms whose quote is not in the text to unknown symptoms, with unit tests; verify the tests pass
- [ ] 5.4 Skip the flow call when there is no note and all chips are known, with a unit test that such a GREEN check-in stays GREEN and makes no call; verify the test passes

## 6. Two-phase pipeline

- [ ] 6.1 Restructure `pipeline.ts` into phase A (store local result, alert, audit) and phase B (enrich, update), keeping the existing daily-checkin tests green; verify the full web test suite passes
- [ ] 6.2 Implement the phase B update with the never-lower guard, risk recomputation with OR-ed mood flags, and alert creation on escalation to RED, with tests for flow-lower-than-local, flow-higher-than-local, both mood-flag scenarios and late RED; verify the tests pass
- [ ] 6.3 Add a test with a flow mocked to take 10 s asserting the alert row exists before the flow resolves; verify it passes
- [ ] 6.4 Write the `checkin.enrich` audit entry and store `flow_level` and `fallback_used`, with a test for the recorded fields; verify it passes
- [ ] 6.5 Add the "Sedang memeriksa..." state to the reply screen; verify in the browser with the flow artificially delayed

## 7. Integration check

- [ ] 7.1 With the local Langflow running and flows deployed, submit the three demo check-ins and the injection note from the spec; verify stored local, flow and final levels in the database
- [ ] 7.2 Stop Langflow and submit a GREEN-looking note; verify the stored level is YELLOW, the fallback mark is set and the family sees the fallback message with the Puskesmas number
