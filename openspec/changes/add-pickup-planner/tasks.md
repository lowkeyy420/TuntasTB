# Tasks

## 1. Date logic

- [x] 1.1 Implement `firstDueDate`, `nextDueDate` and `daysUntil` with unit tests for the new-patient case, the 20 March registration (due 22 March), done on time, late and early, and the 23:30 Jakarta case; verify the tests pass
- [x] 1.2 Implement `pickupState` with unit tests for 3 days (upcoming), 2 days and 1 day (nudge), today, yesterday (missed) and done; verify the tests pass
- [x] 1.3 Set coverage thresholds for `web/src/lib/pickups/dates.ts` to 100% lines and branches; verify `npm run test:coverage` passes

## 2. Schedule storage

- [x] 2.1 Add the migration for the partial unique index on open pickups; verify inserting a second open pickup for one patient fails in a test
- [x] 2.2 Create the first pickup inside the patient registration transaction, with a test that a new patient has exactly one open pickup at the expected date; verify the test passes
- [x] 2.3 Write the backfill script for existing patients without a pickup and update the seed to include pickups (one upcoming, one in the nudge window, one missed); verify running the script twice creates no duplicates

## 3. Nurse actions

- [x] 3.1 Implement `POST .../pickups/[pickupId]/done` (default today, backdate allowed, future rejected, transaction with next pickup, audit) with tests for each scenario, the double submission and another Puskesmas; verify the tests pass
- [x] 3.2 Add a test that a request with a family token to the done route is rejected; verify it passes
- [x] 3.3 Implement `PATCH .../pickups/[pickupId]` for the due date with tests for reschedule, a closed pickup rejected and the audit entry; verify the tests pass
- [x] 3.4 Add a test that changing the pickup interval leaves the open pickup's due date and applies to the next one; verify it passes
- [x] 3.5 Extend `GET /api/nurse/patients` with `nextPickupDue`, `pickupState` and `daysOverdue` with a test for a pickup 3 days overdue; verify the test passes

## 4. Family view

- [x] 4.1 Implement `GET /api/family/pickup` (token, consent, audit) with tests for the countdown values, a revoked token and the audit entry; verify the tests pass
- [x] 4.2 Add the pickup strings to `family.id.ts`; verify the forbidden-terms test passes and a unit test asserts no banner text matches the dosing patterns
- [x] 4.3 Build the pickup card and banners on the family home screen with component tests for upcoming, nudge at 2 days, nudge at 1 day, due today and missed with the Puskesmas number; verify the tests pass
- [x] 4.4 Cache the pickup card with the family session and recompute the countdown offline; verify in DevTools offline mode

## 5. Nurse console

- [x] 5.1 Add pickup strings to `nurse.id.ts` and the "Ambil obat" column with state badge and one-tap "Sudah diambil" in the patient list; verify marking done updates the row and the next due date
- [x] 5.2 Add the "tanggal lain" and "ubah jadwal" menu actions; verify a future completion date is refused in the form and by the API

## 6. Risk integration

- [x] 6.1 Make the snapshot builder's missed-pickup query use `pickupState`, with an integration test that a patient scoring 2 scores 6 once the pickup is missed and 2 again after it is marked done; verify the test passes
- [x] 6.2 Add a test that a pickup due today adds no points; verify it passes

## 7. Integration check

- [x] 7.1 With seeded data, open the three seeded family links and the nurse patient list; verify countdown, nudge and overdue banners, then mark the missed pickup done and confirm the banner clears and the queue score drops by 4
