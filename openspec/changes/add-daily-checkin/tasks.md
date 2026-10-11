# Tasks

## 1. Request handling

- [x] 1.1 Write the zod schema for the check-in body (`.strict()`, dose enum, chips as string array, text max 500, `clientId` uuid, `occurredOn` date) with unit tests for invalid dose, 501-character note, extra `patientId` and extra `treatmentDay`; verify the tests pass
- [x] 1.2 Implement `resolveOccurredOn` (accept up to 7 days back, never future, else today) and `treatmentDay` with unit tests for day 18, an offline 3 March check-in synced on 4 March, a future date and a 10-day-old date; verify the tests pass
- [x] 1.3 Implement the idempotency lookup on `(patient_id, client_id)` with a test that a repeated request returns the stored result and inserts nothing; verify the test passes

## 2. Pipeline

- [x] 2.1 Implement `pipeline.ts` steps 4 to 8 (redact, local triage, `enrich` stub, level, risk) as a function over injected dependencies, with unit tests for the three demo cases (day 18 GREEN, day 41 YELLOW with high risk, day 23 RED); verify the tests pass
- [x] 2.2 Add a test with spies on `enrich` and the insert asserting neither receives a phone number or NIK present in the input note; verify the test passes
- [x] 2.3 Implement the transactional store (check-in, RED alert, audit entry) with tests that RED creates exactly one alert, YELLOW and GREEN create none, and a failing alert insert rolls back the check-in; verify the tests pass against the test database
- [x] 2.4 Implement the reply builder from `triageTable.levels` plus Puskesmas contact and the fallback warning, with unit tests for the RED and YELLOW reply scenarios and that no reply contains "aman"; verify the tests pass

## 3. API route

- [x] 3.1 Implement `POST /api/checkins` wiring token resolution, consent, validation, pipeline and reply, with tests for revoked token, missing consent and a successful submission; verify the tests pass
- [x] 3.2 Add the 20-per-day limit with a test that the twenty-first submission returns 429 and stores nothing; verify the test passes
- [x] 3.3 Add a test that an unknown chip code is accepted and stored with a level of at least YELLOW; verify the test passes

## 4. Check-in screen

- [x] 4.1 Add the check-in strings to `family.id.ts`; verify the forbidden-terms test passes
- [x] 4.2 Build the single-page check-in form (dose buttons, chips rendered from the triage table, note with counter, fixed "Kirim") with a component test that "Kirim" is disabled until a dose status is chosen; verify the test passes
- [x] 4.3 Apply sizing (18 px body text, 48 px targets) and add a Playwright test at 320 px width asserting no horizontal scroll and control heights; verify the test passes
- [x] 4.4 Add Playwright tests counting clicks for "dose + one chip" (3) and "dose only" (2); verify both pass
- [x] 4.5 Build the reply screen (message, single action, contact with tap-to-call link); verify by submitting the three demo check-ins in the browser

## 5. Voice note

- [x] 5.1 Implement the microphone button with `SpeechRecognition` in `id-ID`, feature detection and the hint text, with component tests that the button is absent when the API is missing and that a mocked transcript lands in the note field; verify the tests pass
- [ ] 5.2 Add a test that the submitted request body contains only JSON text fields after dictation; verify it passes, and check dictation manually on an Android phone

## 6. Offline

- [x] 6.1 Write the service worker precaching the family shell, assets and the rule bundle, with navigation fallback for `/f/*`; verify in Chrome DevTools offline mode that a previously opened link loads
- [x] 6.2 Implement the IndexedDB `outbox` (add, list queued, mark sent) and cache of the last family session, with unit tests using `fake-indexeddb` including persistence across a simulated reload; verify the tests pass
- [x] 6.3 Implement `submit()` (outbox first, then network) and `flush()` on `online`, load and visibility change, with unit tests for network failure leaving the entry queued and a later flush marking it sent; verify the tests pass
- [x] 6.4 Implement the provisional offline reply using the bundled rules, with unit tests for offline RED text (go today, nurse not informed, phone number) and the standing warning on non-RED; verify the tests pass
- [x] 6.5 Replace the provisional reply with the server reply after sync and show "Terkirim"; verify with a Playwright test that goes offline, submits, goes online and sees the status change with exactly one check-in stored

## 7. Integration check

- [ ] 7.1 On a phone, open a seeded patient's link, give consent, submit the three demo check-ins and one offline check-in; verify the stored levels, risk bands, one alert for the RED case and the audit entries in the database
