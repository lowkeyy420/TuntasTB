# Proposal

## Why

The nurse is the only person who can act on what the system finds, so the product succeeds or fails on what the nurse sees each morning and how fast a red flag reaches them. Plan spec **S07 (Nurse queue and alerts, P0)** requires a list ranked by risk then recency, RED alerts appearing within 5 seconds, and acknowledgements logged with actor and time. The plan's automation-bias mitigation adds that the nurse sees the reasons, can override the level with a note, and every override is logged.

## What Changes

- Nurse console queue: every active patient of the nurse's Puskesmas ranked by current dropout-risk score, then by most recent check-in, each with a one-line reason and a suggested action (telepon, kunjungan rumah, ambil obat lebih awal).
- Alert inbox with real-time delivery of RED alerts over Server-Sent Events (`GET /api/nurse/alerts/stream`) and a polling fallback, an acknowledge button, and an acknowledgement log.
- Patient timeline: a patient's check-ins with level, symptoms, redacted note, risk reasons, reply shown and alert status.
- Nurse override of a check-in's triage level, requiring a note, recorded in the audit log, with the original level preserved.
- Internal API `GET /api/internal/queue?puskesmas_id=&date=` protected by an internal token, and the Langflow flow `nurse_digest` that summarises that ranked list.

## Capabilities

### New Capabilities

- `nurse-queue`: showing a nurse who needs attention first and why, delivering red-flag alerts in real time, and recording the nurse's acknowledgements and overrides.

### Modified Capabilities

None.

## Out of Scope

- Notifying nurses outside the open console (SMS, WhatsApp, email, phone push). An alert reaches a nurse who has the console open; the plan's WhatsApp channel is phase 2.
- Assigning patients to individual nurses, shifts or escalation chains. All nurses of a Puskesmas share one queue and one inbox.
- Recording the outcome of the call or visit, and call scripts beyond the suggested action.
- Cohort analytics and the weekly report (produced with Bob from `nurse_digest`, see S10).
- Changing the stored risk points or triage rules from the console.
- A separate role for community companions; they use a nurse account.
- Diagnosis, dose changes, TB RO, children, TB-HIV.

## Impact

- Depends on `add-project-foundation`, `add-patient-onboarding`, `add-dropout-risk-score`, `add-daily-checkin`, `add-symptom-extraction` and `add-family-reply` (nurse line).
- New code: `web/src/lib/queue/*`, `web/src/lib/alerts/*`, `web/src/app/api/nurse/{queue,alerts,checkins}/`, `web/src/app/api/internal/queue/`, `web/src/app/nurse/{queue,alerts,patients/[id]}/`.
- Schema: a migration adding `checkins.override_level`, `override_note`, `overridden_by`, `overridden_at`.
- New flow files: `langflow/flows/nurse_digest.json`, `langflow/components/queue_reader.py`.
- New environment use: `INTERNAL_API_TOKEN` (already documented by the foundation).
