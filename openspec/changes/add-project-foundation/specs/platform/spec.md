# Spec Delta

## Purpose

Defines how the system is started, configured, migrated, seeded and health-checked, so that any contributor or judge can run the whole product with one command and know whether its dependencies are working.

## ADDED Requirements

### Requirement: One-command local stack
The system SHALL start the web application and the database with a single Docker Compose command from the repository root, without requiring Langflow to be part of that stack.

#### Scenario: Default stack starts
- **WHEN** a contributor copies `.env.example` to `.env` and runs `docker compose up`
- **THEN** the `web` and `postgres` services start and the web application answers HTTP requests on its published port

#### Scenario: Optional Langflow profile
- **WHEN** a contributor runs Docker Compose with the `langflow` profile enabled
- **THEN** a Langflow service is started in addition to `web` and `postgres`

#### Scenario: Langflow is not started by default
- **WHEN** a contributor runs `docker compose up` without any profile
- **THEN** no Langflow container is started and the web application is configured to reach Langflow at `http://host.docker.internal:7860`

### Requirement: Documented and validated configuration
The system SHALL document every environment variable in `.env.example` and MUST refuse to start when a required variable is missing or malformed, naming the variable in the error.

#### Scenario: Missing required variable
- **WHEN** the web application starts without the session secret configured
- **THEN** startup fails with an error that names the missing variable and does not print any secret value

#### Scenario: Langflow variables absent
- **WHEN** the web application starts without a Langflow API key configured
- **THEN** startup succeeds and the application runs in rules-only mode

### Requirement: Secrets stay on the server
The system MUST NOT expose the Langflow API key, the internal API token, the session secret or the database URL to the browser.

#### Scenario: Client bundle contains no secrets
- **WHEN** the production client bundle is built with test secret values configured
- **THEN** none of those secret values appear in any file served to the browser

### Requirement: Database migrations
The system SHALL create and update the database schema through versioned migrations that are applied before the web application serves requests.

#### Scenario: Fresh database
- **WHEN** the stack starts against an empty database
- **THEN** the tables `puskesmas`, `nurses`, `patients`, `checkins`, `alerts`, `pickups` and `audit_log` exist before the first request is served

#### Scenario: Migrations are repeatable
- **WHEN** the stack is restarted against an already migrated database
- **THEN** no migration is applied twice and startup succeeds

### Requirement: No patient name in the data model
The database schema MUST NOT contain any column intended to store a patient's name, and patients SHALL be identified by a patient code only.

#### Scenario: Schema has no name column
- **WHEN** the columns of the `patients` and `checkins` tables are listed
- **THEN** no column named or documented as a patient name exists

### Requirement: Synthetic demo seed
The system SHALL provide a seed command that inserts one Puskesmas with a contact number, one demo nurse and synthetic patients, and MUST NOT insert any real personal data.

#### Scenario: Seed creates a usable demo
- **WHEN** the seed command is run against a migrated empty database
- **THEN** the demo nurse can log in and at least one synthetic patient exists for that nurse's Puskesmas

#### Scenario: Seed is idempotent
- **WHEN** the seed command is run twice
- **THEN** the second run does not create duplicate Puskesmas, nurse or patient records

### Requirement: Health endpoint
The system SHALL expose `GET /api/health` that reports the status of the database and the reachability of Langflow, without authentication and without returning any patient data or secret.

#### Scenario: Everything reachable
- **WHEN** the database and Langflow are reachable and `GET /api/health` is called
- **THEN** the response has HTTP status 200 and reports the database as up and Langflow as up

#### Scenario: Langflow unreachable
- **WHEN** Langflow is unreachable and `GET /api/health` is called
- **THEN** the response has HTTP status 200, reports the database as up and Langflow as down, and marks the overall status as degraded

#### Scenario: Database unreachable
- **WHEN** the database is unreachable and `GET /api/health` is called
- **THEN** the response has HTTP status 503

### Requirement: Day boundaries use Jakarta time
The system SHALL compute all calendar-day values (treatment day, due dates, "today") in the Asia/Jakarta time zone regardless of the server's own time zone.

#### Scenario: Late evening in UTC
- **WHEN** the current instant is 18:30 UTC on 1 March
- **THEN** the system treats the current calendar day as 2 March

### Requirement: Continuous integration checks
The repository SHALL run lint, type checking and unit tests on every push and pull request, and the run MUST fail when any of them fails.

#### Scenario: Failing unit test blocks the run
- **WHEN** a commit that makes a unit test fail is pushed
- **THEN** the continuous integration run is reported as failed
