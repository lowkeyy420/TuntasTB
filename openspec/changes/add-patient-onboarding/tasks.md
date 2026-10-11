# Tasks

## 1. Family token and PMO hash libraries

- [ ] 1.1 Implement `generateFamilyToken`, `hashFamilyToken` and `resolveFamilyToken` with unit tests for valid, unknown and revoked tokens returning identical "not found" results; verify the tests pass
- [ ] 1.2 Implement `hashPmoContact` (normalise, HMAC with `HASH_PEPPER`) with unit tests that two formats of one number give the same hash and that an empty input gives null; verify the tests pass

## 2. Patient registration API

- [ ] 2.1 Write the zod schema for registration (`.strict()`, code format, start date not in the future, interval 1 to 60, phase enum) with unit tests for every validation scenario in the spec including the extra `name` key; verify the tests pass
- [ ] 2.2 Implement `POST /api/nurse/patients` (create in the session's Puskesmas, hash PMO contact, issue token, audit) with tests for success, duplicate code and same code in another Puskesmas; verify the tests pass
- [ ] 2.3 Add a test that after registration with a PMO phone neither the phone digits nor the token appear in any table row or audit entry; verify it passes
- [ ] 2.4 Implement `GET /api/nurse/patients` returning code, treatment day, phase, PMO status, consent status and link status, with a test for the 1 March to 18 March treatment-day case and for Puskesmas scoping; verify the tests pass
- [ ] 2.5 Implement `PATCH /api/nurse/patients/[id]` for phase and pickup interval with a scoping test; verify the tests pass

## 3. Link rotation and revocation

- [ ] 3.1 Implement `POST /api/nurse/patients/[id]/token` with tests that the old token stops resolving, the new one resolves and the action is audited; verify the tests pass
- [ ] 3.2 Implement `DELETE /api/nurse/patients/[id]/token` with tests that the token stops resolving, family API calls return 404 and a nurse of another Puskesmas is rejected; verify the tests pass

## 4. Family session and consent

- [ ] 4.1 Implement `GET /api/family/session` (bearer token, audit `family.open`) with tests for valid, unknown and revoked tokens; verify the tests pass
- [ ] 4.2 Implement `POST /api/family/consent` with tests that consent time and audit entry are written together and that a second call does not change the time; verify the tests pass
- [ ] 4.3 Add a test that consent remains after link rotation; verify it passes

## 5. Nurse screens

- [ ] 5.1 Build `/nurse/patients/new` with the five inputs, Bahasa labels and inline validation messages; verify in the browser that no name, birth date, address or NIK input exists and a component test asserts the same
- [ ] 5.2 Build the one-time link modal with "Salin tautan" for create and rotate; verify the link is absent when the patient is reopened
- [ ] 5.3 Build `/nurse/patients` with status badges and rotate and revoke buttons with confirmation; verify the list updates after each action

## 6. Family screens

- [ ] 6.1 Add the consent and invalid-link strings to `family.id.ts`; verify the forbidden-terms test still passes and a unit test asserts the five required statements are present
- [ ] 6.2 Build the consent screen at `/f/[token]` with "Saya setuju" and "Tidak setuju"; verify declining sends no network request (component test with a fetch spy)
- [ ] 6.3 Build the invalid-link page; verify unknown and revoked links render the same page

## 7. Integration check

- [ ] 7.1 As the demo nurse, register a patient, open the link in a private window, give consent, rotate the link and confirm the old link shows the invalid page; verify each step and the resulting audit entries in the database
