# TuntasTB

Side-effect triage and dropout early-warning for families supervising a TB patient at home, with the Puskesmas TB nurse in the loop.

Every daily check-in from the patient or their family PMO is sorted into **GREEN** (continue), **YELLOW** (nurse will call) or **RED** (stop and go to the Puskesmas today) by fixed guideline rules. Every morning the nurse gets a ranked list of who is about to drop out and why. The LLM only reads messy input and writes plain explanations; rules decide.

> Status: under construction. See [`docs/build-plan.md`](docs/build-plan.md) for the full plan.

## Development workflow

This project uses spec-driven development with [OpenSpec](https://github.com/Fission-AI/OpenSpec).
Specs live in `openspec/specs`, proposed changes in `openspec/changes`.

- `main`: stable, initial setup
- `development`: all feature work, Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, ...)

## Local setup

Prerequisites: Docker Desktop (or Docker Engine + Compose v2) and, for working
on the web app directly, Node 22+ and npm.

### Run the full stack with Docker Compose

```sh
# 1. Create your local environment file and fill in secrets.
cp .env.example .env
#    Generate two 48-char secrets for SESSION_SECRET and HASH_PEPPER, e.g.:
#    node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
#    Leave LANGFLOW_API_KEY empty to run in rules-only mode.

# 2. Build and start web + postgres (postgres is published on host port 5433).
docker compose up -d --build

# 3. Seed one Puskesmas, the demo nurse and five synthetic patients.
#    Safe to run more than once (idempotent).
docker compose exec web npm run db:seed

# 4. Check health (200 OK; "degraded" is expected when Langflow is absent).
curl -s localhost:3000/api/health

# 5. Log in as the demo nurse.
curl -i -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"perawat@demo.id","password":"demo12345"}'
```

Open http://localhost:3000/login and sign in with `perawat@demo.id` / `demo12345`.
The family area lives under `/f/<token>` and is titled "Pengingat Harian".

Migrations run automatically when the `web` container starts. Langflow is **not**
part of this stack; containers reach a Langflow you run on the host at
`http://host.docker.internal:7860`. To run Langflow in Compose instead, enable
its profile and point `LANGFLOW_BASE_URL` at `http://langflow:7860`:

```sh
docker compose --profile langflow up -d
```

### Work on the web app directly

```sh
cd web
npm ci --ignore-scripts     # install dependencies
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit
npm test                    # Vitest (database-backed tests are skipped
                            # unless TEST_DATABASE_URL is set)
npm run build               # production build (standalone)
```

Database-backed tests run when `TEST_DATABASE_URL` points at a reachable
Postgres (the Compose database is on `postgres://tuntas:tuntas@localhost:5433/tuntas`).

Reset everything (drops the database volume):

```sh
docker compose down -v
```
