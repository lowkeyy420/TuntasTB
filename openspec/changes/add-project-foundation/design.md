# Design

## Context

The repository holds only `docs/build-plan.md` and the OpenSpec setup. Architecture decisions are fixed (see proposal.md and the project context): a Next.js 15 App Router application in `web/`, Postgres through Drizzle and the `postgres` driver, Langflow v1.12 running outside our compose and reached at `http://host.docker.internal:7860`, and shared rule data in `rules/`. This change lays the base that the ten feature changes build on.

## Goals / Non-Goals

**Goals:**

- A stack that runs with one command and degrades to rules-only mode when Langflow is missing.
- One implementation each of redaction, audit logging, consent guard and nurse session, imported by every feature.
- The complete base schema, so feature changes add columns only when they introduce something new.

**Non-Goals:**

- Feature endpoints or pages beyond login, health and a placeholder family shell.
- Production hosting, TLS, backups.
- Calling Langflow (only its reachability is probed here).

## Decisions

### Repository layout

```
web/                     Next.js app (src/app, src/lib, drizzle/)
rules/                   triage-table.json, lexicon.id.json (added by add-triage-rules)
langflow/                flows/, components/, scripts/
corpus/                  guideline markdown
eval/                    golden set and runner
.bob/                    IBM Bob config
docker-compose.yml  .env.example  .github/workflows/ci.yml
```

`web/` is the only Node package. The `rules/` directory is copied into the web image at build time so the TypeScript engines read the same files as the Python component. Alternative considered: a pnpm workspace with shared packages. Rejected: one package is enough and keeps the Docker build simple.

### Compose services

- `postgres`: Postgres 16, named volume, healthcheck with `pg_isready`.
- `web`: built from `web/Dockerfile` (multi-stage, Next.js standalone output), depends on a healthy `postgres`, `extra_hosts: host.docker.internal:host-gateway` so Linux hosts resolve it too. Its entrypoint runs migrations, then starts the server.
- `langflow` (profile `langflow`): `langflowai/langflow:1.12.x` with `LANGFLOW_AUTO_LOGIN=false`, for contributors without a local Langflow. With the profile on, `.env` points `LANGFLOW_BASE_URL` at `http://langflow:7860`.

### Configuration

A single `web/src/lib/config.ts` parses `process.env` with zod once and exports a typed object. Required: `DATABASE_URL`, `SESSION_SECRET` (min 32 chars), `HASH_PEPPER` (min 32 chars), `APP_BASE_URL`. Optional with defaults: `LANGFLOW_BASE_URL` (`http://host.docker.internal:7860`), `LANGFLOW_API_KEY` (absent means rules-only mode), `LANGFLOW_TIMEOUT_MS` (15000), `INTERNAL_API_TOKEN`, `SEED_NURSE_EMAIL`, `SEED_NURSE_PASSWORD`. No variable uses the `NEXT_PUBLIC_` prefix. The module is marked `server-only` so importing it from a client component fails the build.

### Data model

All seven tables are created here. Columns beyond the plan's key fields are listed so later changes share one vocabulary.

| Table | Columns |
| --- | --- |
| `puskesmas` | id (uuid), name, phone, created_at |
| `nurses` | id, puskesmas_id, email (unique, lower-cased), password_hash, created_at |
| `patients` | id, puskesmas_id, code (unique per puskesmas), start_date, phase (`intensive`/`continuation`), pickup_interval_days, pmo_contact_hash (nullable), family_token_hash (unique, nullable), token_revoked_at, consent_at, created_at |
| `checkins` | id, patient_id, client_id (unique per patient), occurred_on (date), treatment_day, dose_status, symptoms_json, text_redacted, local_level, flow_level, triage_level, risk_score, risk_band, risk_reasons_json, family_message, nurse_line, citations_json, fallback_used, created_at |
| `alerts` | id, checkin_id (unique), patient_id, puskesmas_id, level, created_at, acknowledged_by, acknowledged_at |
| `pickups` | id, patient_id, due_date, done_at, created_at |
| `audit_log` | id (bigserial), actor, action, target, at, meta_json |

Foreign keys from `checkins`, `alerts` and `pickups` to `patients` use `ON DELETE CASCADE`, which implements deletion on request in one statement. `audit_log.target` is a plain string, not a foreign key, so audit entries outlive the patient.

Migrations are generated with drizzle-kit into `web/drizzle/` and applied by a small `migrate` script at container start. Alternative considered: `drizzle-kit push`. Rejected: no history and unsafe for the demo database.

### Time

`web/src/lib/time.ts` exposes `todayJakarta()` and `toJakartaDate(instant)` built on `Intl.DateTimeFormat` with `Asia/Jakarta`. Feature code never calls `new Date()` for day logic directly; functions take a `now` parameter so tests are deterministic.

### Redaction

`web/src/lib/redaction/redact.ts` exports `redact(text, options?)`, a pure function applying ordered regular expressions:

1. Email → `[EMAIL]`
2. NIK (exactly 16 digits, optional separators) → `[NIK]`
3. Phone (`+62`/`62`/`0` prefix, 9 to 13 digits, spaces or dashes allowed) → `[TELEPON]`
4. Address: `jl.`/`jln`/`jalan` followed by a capitalised word or a number, up to the next comma, period or line end; and `RT nn/RW nn` forms → `[ALAMAT]`
5. Name: one to three tokens after `nama saya`, `saya bernama`, `namanya`, `nama (anak|ibu|bapak|suami|istri) saya`; and a capitalised token directly after bare `saya` when that token is not a common Indonesian word → `[NAMA]`

NIK runs before phone so a 16-digit number is not half-matched as a phone number. `options.protectedTerms` lets `add-triage-rules` pass the lexicon so a symptom keyword is never swallowed (the "jalan sempoyongan" case is covered by the capitalised-word condition even without it). Alternative considered: an LLM or NER model for redaction. Rejected: redaction must happen before any LLM call, and must be deterministic and testable.

### Audit log

`web/src/lib/audit/audit.ts` exports `audit(tx, { actor, action, target, meta? })`. Actors are strings: `nurse:<id>`, `family:<patient_id>`, `system`. Actions are a closed TypeScript union (`patient.read`, `patient.create`, `checkin.create`, `auth.login`, ...) extended by each feature change. Writes call `audit` inside the same transaction as the data change. Reads call it before returning the response. `meta` is a small JSON object validated to contain only identifiers and enums; a unit test asserts that passing a `text` or `token` key throws.

### Consent guard

`web/src/lib/consent/requireConsent.ts` loads the patient and throws a typed `ConsentRequiredError` when `consent_at` is null. Every family write route calls it first. Storing consent itself is exposed as `recordConsent(patientId, now)`; the screen that calls it belongs to `add-patient-onboarding`.

### Nurse authentication

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Password check with `bcryptjs` (pure JS, no native build in the container). Unknown emails are compared against a fixed dummy hash so timing does not reveal existence.
- Session: HS256 JWT signed with `SESSION_SECRET` using `jose`, payload `{ sub: nurseId, pid: puskesmasId, exp }`, cookie `session`, httpOnly, SameSite=Lax, Secure when `APP_BASE_URL` is https.
- `requireNurse(request)` returns `{ nurseId, puskesmasId }` or throws; all nurse route handlers start with it. `web/src/middleware.ts` redirects unauthenticated page requests under `/nurse` to `/login`.
- Throttling: an in-memory map keyed by email, 5 failures per 15 minutes. Alternative considered: a table. Rejected for the MVP: one web container, and a restart clearing the counter is acceptable.

### Neutral wording check

Family copy lives in `web/src/copy/family.id.ts`, nurse copy in `web/src/copy/nurse.id.ts`. A Vitest test loads the family copy, `manifest.webmanifest` and the metadata exported by every route under `src/app/f/`, and fails on a case-insensitive whole-word match of `TB`, `TBC`, `tuberkulosis`, `TuntasTB`.

## Cross-cutting

- **Redaction**: this change owns the redactor. No feature may send text to Langflow or store it without calling `redact` first; the raw string lives only in request memory.
- **Audit logging**: this change owns the writer and the rule (reads and writes of patient data). Login, logout and failed login are the first audited actions.
- **Neutral wording**: the manifest, family layout title and icon are created here as "Pengingat Harian". The nurse console sits behind login and may use the product name.
- **Bahasa copy**: login errors and the family shell use plain Bahasa Indonesia from the copy files. No English strings reach users.

## Risks / Trade-offs

- [Regex redaction misses a name written without a naming phrase] → Accepted for the MVP and stated in the consent copy ("jangan tulis nama atau alamat"); the check-in text field carries the same hint. Tracked by redaction cases in the golden set.
- [Regex redaction removes a symptom word] → Address and name patterns require capitalisation or a naming phrase; `protectedTerms` plus a parity test in `add-triage-rules` assert the triage level is the same before and after redaction.
- [`host.docker.internal` does not resolve on Linux] → `extra_hosts` with `host-gateway` in compose.
- [In-memory login throttle resets on restart and is per process] → Acceptable with one container; noted for production hardening.
- [Auditing every read adds a write to each request] → Single-row insert; acceptable at Puskesmas scale.

## Migration Plan

Greenfield: apply migrations on first start, run the seed command. Rollback is dropping the compose volume.

## Open Questions

- Which retention window after treatment end applies before data is purged? It does not change this change's scope (purge job is out of scope) and needs the Puskesmas's policy.
