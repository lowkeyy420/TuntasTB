# Tasks

## 1. Repository and web skeleton

- [ ] 1.1 Create `web/` with Next.js 15 App Router, TypeScript strict mode and Tailwind; verify `npm run build` in `web/` succeeds
- [ ] 1.2 Add ESLint, a `typecheck` script and Vitest with one passing sample test; verify `npm run lint`, `npm run typecheck` and `npm test` all exit 0
- [ ] 1.3 Create `rules/`, `langflow/{flows,components,scripts}/`, `corpus/`, `eval/` and `.bob/` with a short README each stating its purpose; verify the directories exist in the tree
- [ ] 1.4 Add `web/src/lib/time.ts` (`todayJakarta`, `toJakartaDate` taking an explicit `now`) with unit tests including the 18:30 UTC case; verify the tests pass

## 2. Configuration, compose and health

- [ ] 2.1 Implement `web/src/lib/config.ts` (zod, `server-only`) with required and optional variables from design.md, plus unit tests for a missing `SESSION_SECRET` and an absent `LANGFLOW_API_KEY`; verify the tests pass
- [ ] 2.2 Write `.env.example` documenting every variable with a comment and a safe placeholder; verify each key read in `config.ts` appears in the file (unit test compares the two lists)
- [ ] 2.3 Write `web/Dockerfile` (multi-stage, standalone output, copies `rules/`) and `docker-compose.yml` with `web`, `postgres`, healthchecks, `extra_hosts` and the `langflow` profile; verify `docker compose config` is valid and `docker compose up` serves the home page
- [ ] 2.4 Implement `GET /api/health` (database ping, Langflow reachability probe with a 2 s timeout) with unit tests for up, degraded and 503; verify the tests pass and `curl /api/health` returns 200 on the running stack
- [ ] 2.5 Add a test that builds the client bundle with marker secret values and greps the output for them; verify it finds none

## 3. Database schema, migrations and seed

- [ ] 3.1 Define the Drizzle schema for `puskesmas`, `nurses` and `patients` per design.md and generate the migration; verify the SQL file exists in `web/drizzle/`
- [ ] 3.2 Define the Drizzle schema for `checkins`, `alerts`, `pickups` and `audit_log` with cascading foreign keys and generate the migration; verify the SQL file exists
- [ ] 3.3 Add the `migrate` script and call it from the container entrypoint; verify a fresh `docker compose up` creates all seven tables and a restart applies nothing
- [ ] 3.4 Add a schema test asserting no column name in `patients` or `checkins` matches `name`, `nama` or `full_name`; verify it passes
- [ ] 3.5 Implement the idempotent seed command (one Puskesmas with phone, demo nurse from env, five synthetic patients by code); verify running it twice leaves one Puskesmas, one nurse and five patients

## 4. Redaction

- [ ] 4.1 Implement `redact` for email, NIK and phone with unit tests for each scenario in the privacy-audit spec; verify the tests pass
- [ ] 4.2 Add address and name patterns and the `protectedTerms` option with unit tests, including "saya mual dan jalan sempoyongan" staying unchanged; verify the tests pass
- [ ] 4.3 Add a determinism test (same input 100 times, identical output) and a table-driven test file of 30 mixed sentences; verify the tests pass

## 5. Audit log and consent

- [ ] 5.1 Implement `audit(tx, entry)` with the closed action union and the `meta` validator, with unit tests that a `text` or `token` key is rejected; verify the tests pass
- [ ] 5.2 Add an integration test that a failing audit insert rolls back the surrounding write; verify it passes against the test database
- [ ] 5.3 Implement `requireConsent` and `recordConsent` with unit tests for the rejected and recorded cases; verify the tests pass
- [ ] 5.4 Implement `DELETE /api/nurse/patients/[id]` (own Puskesmas only, cascade, audit entry kept) with tests for success and for another Puskesmas; verify the tests pass

## 6. Nurse authentication

- [ ] 6.1 Implement password hashing helpers and the session helpers (`createSession`, `readSession`) with unit tests for valid, tampered and expired tokens; verify the tests pass
- [ ] 6.2 Implement `POST /api/auth/login` with the dummy-hash comparison and the in-memory throttle, with tests for success, wrong password, unknown email and the sixth attempt; verify the tests pass
- [ ] 6.3 Implement `POST /api/auth/logout`, `GET /api/auth/me` and `requireNurse`, with tests that a nurse route returns 401 without a session and after logout; verify the tests pass
- [ ] 6.4 Add `middleware.ts` redirecting unauthenticated `/nurse` pages to `/login`, and build the login page with Bahasa copy; verify by logging in as the demo nurse in the browser
- [ ] 6.5 Add a scoping helper that builds patient queries from the session's Puskesmas, with a test that a patient of another Puskesmas returns 404; verify the test passes
- [ ] 6.6 Audit login success, login failure and logout, with a test asserting the entries and that no password is stored; verify the test passes

## 7. Neutral wording and PWA shell

- [ ] 7.1 Create `web/src/copy/family.id.ts` and `web/src/copy/nurse.id.ts` and route the existing strings through them; verify no user-facing literal remains in the login page or family shell
- [ ] 7.2 Add `manifest.webmanifest`, a neutral icon and the family layout under `/f/[token]` titled "Pengingat Harian"; verify the browser offers to install the app under that name
- [ ] 7.3 Add the wording test over family copy, the manifest and family route metadata; verify it passes and fails when "TBC" is added to the family copy

## 8. Continuous integration

- [ ] 8.1 Write `.github/workflows/ci.yml` running lint, typecheck and unit tests for `web/` with a Postgres service container; verify the workflow file passes `actionlint` or a dry run with `act`
- [ ] 8.2 Document local setup in the root `README.md` (copy `.env`, compose up, seed, demo login); verify the documented commands run as written on a clean checkout

## 9. Integration check

- [ ] 9.1 On a clean checkout, run compose up, seed, log in as the demo nurse and call `/api/health` with Langflow stopped; verify login works and health reports degraded with HTTP 200
