# Proposal

## Why

Between check-ins, families and patients have questions ("is this normal?", "why six months if he feels fine?") and today the only answers are a nurse who is hard to reach or the internet. Plan spec **S08 (Guideline Q&A, P1)** allows the system to answer only with a corpus citation and otherwise to abstain with the Puskesmas contact. The plan's metric is citation coverage of 100% or abstain.

## What Changes

- An "Ada pertanyaan?" screen in the family view with a question field and the answer display.
- `POST /api/ask`: validates and redacts the question, calls the Langflow flow `ask_guideline`, and returns either a cited answer or the abstain message.
- The Langflow flow `ask_guideline`: retrieval of the top 4 corpus sections, a prompt with an abstain rule, and an LLM step.
- Application-side enforcement: an answer with no valid citation, with forbidden content (the same filter as family replies), or from a failed call is replaced by the abstain message "Saya belum bisa menjawab ini, tanyakan ke perawat" with the Puskesmas number.
- Red-flag words in a question trigger the go-today instruction instead of an answer.

## Capabilities

### New Capabilities

- `guideline-qa`: answering family questions strictly from the curated corpus with a citation, and abstaining with the Puskesmas contact in every other case.

### Modified Capabilities

None.

## Out of Scope

- Answers from the model's general knowledge or from the web. No citation means no answer.
- Dosing questions, diagnosis, interpretation of lab results, and advice on other medicines. These are always abstained.
- Treating a question as a check-in: a question creates no check-in, triage level, risk points or nurse alert. A red-flag word in a question shows the go-today instruction and asks the family to send a check-in.
- Conversation memory or follow-up questions that depend on earlier ones. Each question stands alone.
- Storing question history for the family, and a nurse view of questions.
- Nurse-facing Q&A; voice answers; languages other than Bahasa Indonesia.
- Expanding the corpus beyond what `add-family-reply` created, other than adding sections for common questions found in interviews.
- TB RO, children, TB-HIV content.

## Impact

- Depends on `add-project-foundation`, `add-patient-onboarding` (family link, consent), `add-triage-rules` (red-flag scan), `add-symptom-extraction` (Langflow client, deploy script) and `add-family-reply` (corpus, manifest, `ingest_corpus`, filter).
- New files: `langflow/flows/ask_guideline.json`, `langflow/prompts/ask.id.md`, `web/src/app/api/ask/route.ts`, `web/src/lib/ask/*`, `web/src/app/f/[token]/tanya/`.
- No new tables. Questions are not stored; only an audit entry and counters are written.
