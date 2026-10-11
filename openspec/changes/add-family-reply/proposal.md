# Proposal

## Why

A triage level means nothing to a worried family until it is said in words they can act on. Plan spec **S06 (Family reply, P0)** requires the reply to be plain Bahasa Indonesia, at most 60 words, with one action, a citation and the Puskesmas contact, and never to say "aman" or give dosing advice. The plan's failure rules add: never diagnose, and fall back to a fixed sentence when the LLM is unavailable.

## What Changes

- A curated guideline corpus in `corpus/` (Bahasa Indonesia markdown, marked draft pending clinician review) with a manifest of citable sections and neutral display labels.
- The Langflow flow `ingest_corpus` that loads the corpus into the vector store inside Langflow.
- The "explain" stage added to `checkin_triage`: retrieval over the corpus, a grounded prompt, and an LLM step that writes `family_message`, `nurse_line` and `citations`.
- A post-filter in the web application that checks every generated family message and replaces it with the static template for its level when it contains "aman", a dosing pattern, diagnosis wording, no valid citation, too many words, or an instruction that contradicts the level.
- Reply composition: explanation, exactly one action fixed by the level, one source label, and the Puskesmas contact as the last line.
- A deterministic nurse line built from the risk reasons when the generated one is missing or rejected.
- Forbidden-output patterns added to `rules/lexicon.id.json` so the application and the eval harness count violations the same way.

## Capabilities

### New Capabilities

- `family-reply`: composing, grounding and safety-filtering the message a family sees after a check-in, and the one-line reason a nurse sees, so that no generated text can reassure falsely, advise on doses or diagnose.

### Modified Capabilities

None. `daily-checkin` already requires a reply with one action and the contact; this change supplies a richer, validated reply through the same response fields.

## Out of Scope

- Answering free questions from families (S08, `add-guideline-qa`), which reuses the corpus and filter built here.
- Clinical review of the corpus and templates. They ship labelled draft; sign-off is a human task in the plan.
- Any dosing guidance, including what to do about a missed dose, and any statement of what condition the patient has.
- Personalised advice based on the patient's history, weight, age or other medication.
- Languages other than Bahasa Indonesia; regional languages.
- Text-to-speech of the reply; push or WhatsApp delivery of the reply.
- TB RO, children, TB-HIV content in the corpus.

## Impact

- Depends on `add-project-foundation`, `add-triage-rules`, `add-daily-checkin` and `add-symptom-extraction` (flow, deploy script, flow output schema).
- New files: `corpus/*.md`, `corpus/manifest.json`, `langflow/flows/ingest_corpus.json`, `langflow/prompts/explain.id.md`, `web/src/lib/reply/*`, a `forbidden_output` block in `rules/lexicon.id.json`.
- Changes: `langflow/flows/checkin_triage.json` gains the retrieval and explain nodes; the reply builder in `web/src/lib/checkin/` delegates to `web/src/lib/reply/`.
- External: an embedding model reachable from Langflow (same provider key) and a Chroma store inside Langflow.
