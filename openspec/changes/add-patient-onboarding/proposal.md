# Proposal

## Why

Nothing else in the product can happen until a nurse has registered a patient and the family holds a private link. Plan spec **S01 (Patient onboarding, P0)** requires this to take about three minutes, to store no name, and to record consent before the first check-in.

## What Changes

- Nurse console form and API to register a patient with a patient code, treatment start date, regimen phase, pickup interval and an optional PMO phone number.
- The PMO phone number is stored only as a keyed hash; the system keeps whether a PMO exists, never the number.
- A per-patient family link `/f/<token>` generated at registration, shown to the nurse once, stored hashed.
- Nurse actions to rotate the link (old link stops working, new one issued) and to revoke it.
- Family consent screen in plain Bahasa Indonesia shown on first open; consent time recorded; declining collects nothing.
- Nurse patient list for their Puskesmas showing code, treatment day, phase, consent status and link status.

## Capabilities

### New Capabilities

- `patient-onboarding`: registering a patient without a name, issuing and controlling the family link, and obtaining consent before any patient-reported data is collected.

### Modified Capabilities

None.

## Out of Scope

- Any name, address, date of birth or NIK field. Patients are identified by code only.
- Sending the link by SMS or WhatsApp. The nurse copies the link and shares it through a channel they already use.
- Editing clinical details after registration other than phase and pickup interval; bulk import; SITB lookup.
- Family accounts or passwords. Access is by link only.
- The check-in itself (S02), pickup scheduling logic (S09) and the nurse queue (S07).
- Children, TB RO and TB-HIV patients; diagnosis and dose changes.

## Impact

- Depends on `add-project-foundation` (schema, nurse session, audit, consent storage, neutral family shell).
- New code: `web/src/lib/patients/`, `web/src/lib/family-token/`, `web/src/app/api/nurse/patients/`, `web/src/app/api/family/`, `web/src/app/nurse/patients/`, `web/src/app/f/[token]/`.
- No new tables; uses `patients` columns `code`, `start_date`, `phase`, `pickup_interval_days`, `pmo_contact_hash`, `family_token_hash`, `token_revoked_at`, `consent_at`.
- `add-daily-checkin`, `add-guideline-qa` and `add-pickup-planner` rely on the family link resolution introduced here.
