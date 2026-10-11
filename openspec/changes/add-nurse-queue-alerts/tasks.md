# Tasks

## 1. Queue computation

- [x] 1.1 Implement the three batched queries (patients, recent check-ins, open pickups) for a Puskesmas with a test asserting the query count does not grow with the number of patients; verify the test passes
- [x] 1.2 Implement `suggestAction` with unit tests for home visit (silence, consecutive misses), early pickup, call and the zero-score case; verify the tests pass
- [x] 1.3 Implement `buildQueue` sorting (score, recency with nulls last, code) and reason selection, with unit tests for higher-risk-first, tie by recency, never-checked-in last and the silent patient scoring 5; verify the tests pass
- [x] 1.4 Add a test with seeded data reproducing the demo morning (day 41 patient first, reason mentions 7 days of nausea and "sudah sembuh"); verify it passes

## 2. Queue API and page

- [x] 2.1 Implement `GET /api/nurse/queue` with session scoping and `queue.read` audit, with tests for scoping and the audit entry; verify the tests pass
- [x] 2.2 Add queue strings to `nurse.id.ts` and build `/nurse/queue` with rank, code, treatment day, score, band, level, reason, suggested action and an expandable list of risk reasons; verify in the browser against seeded data
- [x] 2.3 Implement `GET /api/internal/queue` with constant-time token check, with tests for valid token, missing token, wrong token, unset token and absence of note text, contact hash and token in the response; verify the tests pass

## 3. Alert delivery

- [x] 3.1 Add `pg_notify('alerts', ...)` to alert creation inside the transaction, with an integration test that a committed alert is notified and a rolled-back one is not; verify the test passes
- [x] 3.2 Implement the shared listener and per-Puskesmas subscriber registry with unit tests for subscribe, unsubscribe and fan-out only to the matching Puskesmas; verify the tests pass
- [x] 3.3 Implement `GET /api/nurse/alerts/stream` (initial open alerts, events, 20 s heartbeat, cleanup on disconnect) with an integration test that a stored RED check-in produces an `alert.created` event within 5 seconds; verify the test passes
- [x] 3.4 Implement `GET /api/nurse/alerts?status=` with scoping and audit, with tests for open and acknowledged lists; verify the tests pass
- [x] 3.5 Implement the client hook (EventSource, fallback to 3 s polling after two errors, 30 s safety poll) with unit tests using a fake EventSource for stream, fallback and reconnect; verify the tests pass

## 4. Alert inbox and acknowledge

- [x] 4.1 Implement `POST /api/nurse/alerts/[id]/ack` with tests for first acknowledgement, second acknowledgement keeping the first, another Puskesmas rejected, and the audit entry; verify the tests pass
- [x] 4.2 Notify on acknowledgement and handle `alert.acknowledged` in the client hook, with a test that a second subscriber sees the event; verify the test passes
- [x] 4.3 Build the layout banner with the unacknowledged count and sound, and `/nurse/alerts` with open alerts, "Sudah saya lihat" and the acknowledge log; verify in two browser windows that a RED check-in appears in both within 5 seconds and disappears from both after one acknowledges
- [x] 4.4 Add a Playwright test that submits a RED check-in through the API and asserts the alert is visible in an open console within 5 seconds; verify it passes

## 5. Timeline and override

- [x] 5.1 Implement `GET /api/nurse/patients/[id]/timeline` with scoping and `patient.read` audit, with tests for order, fields and the audit entry; verify the tests pass
- [x] 5.2 Build `/nurse/patients/[id]` showing the timeline with fallback tag, original and overridden levels, and the rules and corpus review status in the footer; verify against the seeded demo patient
- [x] 5.3 Add the migration for `override_level`, `override_note`, `overridden_by`, `overridden_at`; verify it applies on a fresh and an existing database
- [x] 5.4 Implement `POST /api/nurse/checkins/[id]/override` (note at least 10 characters, redacted, original level kept, audit with from and to) with tests for success, empty note, note redaction and the audit entry; verify the tests pass
- [x] 5.5 Implement override effects (alert created when raised to RED, alert kept when lowered, family reply unchanged, queue uses the effective level) with a test per scenario; verify the tests pass
- [x] 5.6 Build the override dialog in the timeline with level choice and required note; verify the button stays disabled until the note has 10 characters

## 6. Nurse digest flow

- [ ] 6.1 Implement `langflow/components/queue_reader.py` (GET with `x-internal-token`, guarded Langflow import) with pytest tests on a mocked transport for success, 401 and timeout; verify the tests pass
- [ ] 6.2 Implement the `Merge` component (line count check, forbidden-pattern check, fallback to application reasons, order preserved) with pytest tests for each branch; verify the tests pass
- [ ] 6.3 Build `nurse_digest` in the Langflow UI, export to `langflow/flows/nurse_digest.json`, and extend the deploy script to set `TUNTAS_APP_URL` and `TUNTAS_INTERNAL_TOKEN` and enable the flow as an MCP tool; verify a deploy lists three tools
- [ ] 6.4 Run `nurse_digest` for the seeded Puskesmas; verify the output lists the same codes in the same order as `GET /api/internal/queue`

## 7. Integration check

- [x] 7.1 Run the demo sequence (day 18, day 41, next-morning queue, day 23 RED, acknowledge, override with note); verify queue order, alert timing, acknowledge log and audit entries
