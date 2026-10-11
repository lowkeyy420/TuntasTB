# Proposal

## Why

Every plan spec (S01..S10 in `docs/build-plan.md`) needs the same base: a runnable stack, a database, nurse identity, and the privacy guarantees the plan treats as non-negotiable (redaction before any LLM call, audit log on every read and write, consent, neutral wording). Building these once, first, keeps the ten feature changes small and stops each of them from re-inventing a slightly different redactor or audit call.

This change implements no single plan spec. It is the infrastructure for S01..S10 and carries the plan's "Cross-cutting requirements" and "Responsible AI, safety and privacy" rows that are not owned by one feature.

## What Changes

- Monorepo skeleton: `web/` (Next.js 15 App Router, TypeScript, Tailwind, Vitest, Drizzle + `postgres`), `rules/`, `langflow/`, `corpus/`, `eval/`, `.bob/` directories with placeholders.
- `docker-compose.yml` with `web` and `postgres`, plus an optional `langflow` profile; `.env.example` documenting every variable; startup configuration validation.
- Database schema and migrations for `puskesmas`, `nurses`, `patients`, `checkins`, `alerts`, `pickups`, `audit_log`; a seed command with one Puskesmas, one demo nurse and synthetic patients.
- `GET /api/health` reporting database and Langflow reachability.
- Free-text redaction library (phone, NIK, email, names, addresses) used before storage and before any LLM call.
- Audit log writer and the rule that reads and writes of patient data are logged.
- Consent storage and the server-side guard that blocks patient data collection without consent; deletion of a patient's data on request.
- Neutral wording: family-facing name "Pengingat Harian", neutral PWA manifest, and an automated check that family-visible strings never contain "TB" or "TBC".
- Nurse authentication: email + password login, signed httpOnly session cookie, route protection, Puskesmas scoping.
- `.github/workflows/ci.yml` with lint, typecheck and unit tests.

## Capabilities

### New Capabilities

- `platform`: how the system is started, configured, migrated, seeded and health-checked, including how it behaves when Langflow is unreachable.
- `privacy-audit`: redaction of free text, audit logging, consent storage and enforcement, deletion on request, and neutral wording on family-visible surfaces.
- `nurse-auth`: nurse login, session handling, protection of nurse routes and scoping of nurse access to one Puskesmas.

### Modified Capabilities

None. This is a greenfield project with no existing specs.

## Out of Scope

- Any feature behavior from S01..S10 (patient registration, check-in, triage, risk, replies, queue, Q&A, pickups, eval). Only their shared tables and libraries are created here.
- The Langflow HTTP client, flows and deploy script (delivered by `add-symptom-extraction` and later changes).
- TLS termination, Caddy and VPS deployment; this change stops at a working local Docker Compose stack.
- Nurse self-registration, password reset, multi-factor authentication and separate roles for community companions (they use a nurse account).
- Automated retention purge jobs. Deletion on request is in scope; scheduled purging is a follow-up.
- Diagnosis, dose changes, TB RO, children, TB-HIV, real SITB integration, WhatsApp API (project-wide exclusions).

## Impact

- New code: `web/` application skeleton, `web/src/lib/{config,db,redaction,audit,auth,consent}/`, `web/drizzle/` migrations, `web/src/app/api/{health,auth}/`.
- New files at the repo root: `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`.
- Dependencies: Next.js 15, Tailwind, Drizzle ORM, `postgres`, `jose`, `bcryptjs`, `zod`, Vitest.
- Every later change depends on this one and must be applied after it.
