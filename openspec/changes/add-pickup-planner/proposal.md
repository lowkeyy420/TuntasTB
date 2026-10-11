# Proposal

## Why

Patients collect their medicine at the Puskesmas every week or two, and a skipped pickup is one of the earliest visible signs of dropout. Plan spec **S09 (Pickup planner, P1)** requires a countdown from the pickup interval, a nudge 2 days before, and a missed pickup raising the risk score. The plan also names "fewer missed pickups in the first 3 months" as an outcome measure.

## What Changes

- Pickup schedule per patient: the first due date is set at registration from the start date and the pickup interval; each completed pickup schedules the next one.
- Family view: a countdown ("Ambil obat 3 hari lagi"), a nudge banner from 2 days before the due date, and an overdue banner after it.
- Nurse console: mark a pickup as done, see each patient's next due date and overdue state, and correct a due date.
- A missed pickup (due date passed without being marked done) is supplied to the dropout-risk engine, which adds its 4 points.
- Pure date arithmetic in the application; no AI and no Langflow flow.

## Capabilities

### New Capabilities

- `pickup-planner`: scheduling medicine pickups from the pickup interval, showing families how long until the next one, nudging them shortly before, and flagging missed pickups for the nurse and the risk score.

### Modified Capabilities

None. `dropout-risk` already defines the missed-pickup factor and reads it from stored pickups; this change creates the data it reads.

## Out of Scope

- Counting pills or tracking stock. The countdown is days until the due date, not a pill inventory.
- Push notifications, SMS or WhatsApp reminders. The nudge is a banner inside the app, shown when the family opens it.
- Appointment booking, choosing a time slot, or queue management at the Puskesmas.
- Families marking a pickup as done. Only a nurse confirms a pickup.
- Drug stock or supply availability at the Puskesmas.
- Changing the regimen, phase transitions triggered by pickups, or any dose-related logic.
- TB RO, children, TB-HIV schedules.

## Impact

- Depends on `add-project-foundation` (`pickups` table, time helpers), `add-patient-onboarding` (registration, family link) and `add-dropout-risk-score` (missed-pickup input). Works with `add-nurse-queue-alerts` (suggested action "ambil obat lebih awal") but does not require it.
- New code: `web/src/lib/pickups/*`, `web/src/app/api/family/pickup/`, `web/src/app/api/nurse/patients/[id]/pickups/`, a banner component in the family view and a pickup column and panel in the nurse console.
- Changes patient registration to create the first pickup row.
- No new tables; uses `pickups (patient_id, due_date, done_at)`.
