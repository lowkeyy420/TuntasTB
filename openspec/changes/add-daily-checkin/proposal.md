# Proposal

## Why

The daily check-in is the only input the whole system has: without it there is nothing to triage, score or rank. Plan spec **S02 (Daily check-in, P0)** requires dose status plus symptom chips plus optional text or voice, submission in at most 3 taps, and working offline with later sync. The plan's usability target is a median of 30 seconds or less.

## What Changes

- Family check-in screen at `/f/<token>`: the question "Obat hari ini sudah diminum?" with three answers, symptom chips, an optional note of up to 500 characters and a microphone button that dictates into the note.
- `POST /api/checkins`: validates input, computes the treatment day on the server, redacts the note, runs the deterministic triage rules, computes the dropout-risk score, stores the check-in and creates an alert row when the level is RED.
- A reply screen showing the level's static message, its action and the Puskesmas contact (the grounded explanation arrives with `add-family-reply`).
- Offline support: the screen opens without a connection, check-ins are queued on the device and sent when the connection returns, without duplicates; a provisional reply is computed on the device from the same rule files.
- Low-end Android and low-literacy accommodations: large text and touch targets, few words.

## Capabilities

### New Capabilities

- `daily-checkin`: capturing the daily dose status, symptoms and optional note from a family member or patient, online or offline, and turning each submission into a stored, triaged and scored check-in.

### Modified Capabilities

None.

## Out of Scope

- Calling Langflow and LLM extraction (S03, `add-symptom-extraction`). This change runs on deterministic rules only and leaves a single integration point for the flow call.
- Grounded explanations and citations in the reply (S06). The static per-level text is shown here.
- Delivering RED alerts to the nurse and the queue (S07). This change only creates the alert row.
- Push notifications and scheduled reminders. Reminders are a minor feature in the plan and are not part of the MVP specs.
- Storing or uploading audio. Voice input produces text on the device.
- Editing or deleting a submitted check-in by the family.
- WhatsApp check-ins, diagnosis, dose changes, TB RO, children, TB-HIV.

## Impact

- Depends on `add-project-foundation`, `add-patient-onboarding` (family link, consent), `add-triage-rules` and `add-dropout-risk-score`.
- New code: `web/src/app/api/checkins/route.ts`, `web/src/lib/checkin/*`, `web/src/app/f/[token]/(checkin)/*`, `web/src/lib/offline/*`, the service worker in `web/public/sw.js`.
- Writes `checkins` and `alerts` rows; no schema change beyond the foundation tables.
- The rule files in `rules/` are bundled into the client for the offline provisional reply.
