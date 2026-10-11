# Design

## Context

Check-ins are stored with a level, a risk score, reasons and a nurse line; RED check-ins already create `alerts` rows. Nothing yet shows any of it to the nurse. This change builds the nurse-facing half. Requirements are in `specs/nurse-queue/spec.md`.

## Goals / Non-Goals

**Goals:**

- A queue that is a pure function of stored data and the current date, so it can be unit-tested and reused by the internal API.
- Alerts that arrive in seconds with one container and no extra infrastructure.
- Overrides that leave a complete trail and cannot erase evidence.

**Non-Goals:**

- Guaranteed delivery to a nurse who is not looking at the console.
- Pagination and search beyond what one Puskesmas TB caseload needs (tens to low hundreds of patients).

## Decisions

### Queue computation (`web/src/lib/queue/buildQueue.ts`)

`buildQueue(db, puskesmasId, asOf)`:

1. Load all patients of the Puskesmas with their latest check-in.
2. For each, `scoreRisk(buildRiskSnapshot(db, patient.id, asOf))` (queue-time path from `add-dropout-risk-score`), using the check-in's effective level (`override_level ?? triage_level`).
3. Sort by `score` descending, then `latestCheckinAt` descending with nulls last, then `code` ascending so the order is total and stable.
4. Attach `reason` (the stored `nurse_line`, or `buildNurseLine` when queue-time factors such as silence changed the picture) and `suggestedAction`.

`suggestAction(snapshot)`, first match wins:

| Condition | Action |
| --- | --- |
| `daysSinceLastCheckin >= 3` or `consecutiveMissedBefore + (doseStatus === "no" ? 1 : 0) >= 3` | kunjungan rumah |
| `missedPickup` | ambil obat lebih awal |
| `score > 0` | telepon |
| otherwise | none ("Tidak ada tindakan") |

The spec asks for exactly one action per entry; zero-score patients show "Tidak ada tindakan" in the same slot. The per-patient snapshot queries are batched into three queries for the whole Puskesmas (latest check-ins of the last 14 days, open pickups, patients) to avoid one round trip per patient.

Routes: `GET /api/nurse/queue` (session), `GET /api/internal/queue?puskesmas_id=&date=` (header `x-internal-token`, compared in constant time; 401 for every request when `INTERNAL_API_TOKEN` is unset). The internal response is the same list minus note text; `date` sets `asOf`.

### Real-time alerts

- **Publish**: the code that inserts an alert, and the acknowledge handler, call `pg_notify('alerts', json)` inside the same transaction with `{ type, alertId, puskesmasId }`. Postgres delivers the notification only on commit, so a rolled-back alert is never announced.
- **Subscribe**: one shared `postgres` listener per web process (`sql.listen('alerts', ...)`) fans out to in-memory subscribers keyed by `puskesmasId`.
- **Stream**: `GET /api/nurse/alerts/stream` is a Node-runtime route handler returning a `ReadableStream` with `Content-Type: text/event-stream`. On connect it sends the current unacknowledged alerts, then `alert.created` and `alert.acknowledged` events for the session's Puskesmas, and a comment line every 20 seconds to keep proxies from closing the connection. The payload is fetched from the database by id after the notification, so the notify channel itself carries no patient data.
- **Client**: `EventSource` with automatic reconnect. If it errors twice in a row, or `EventSource` is missing, the client polls `GET /api/nurse/alerts?status=open` every 3 seconds; while streaming it still polls every 30 seconds as a safety net. Three seconds of polling plus request time keeps the fallback inside the 5 second requirement.

Alternative considered: an in-process event emitter only. Rejected: it breaks silently with a second web instance or in development where route handlers can live in separate module instances. LISTEN/NOTIFY costs one connection. Alternative considered: WebSockets. Rejected: one-way traffic, and SSE works through the Next.js route handler without a custom server.

### Alert presentation

A banner component in the nurse layout shows the unacknowledged count on every page and plays a short sound on `alert.created` (after the first user interaction, as browsers require). The inbox at `/nurse/alerts` lists open alerts first, then the acknowledge log.

### Acknowledge

`POST /api/nurse/alerts/[id]/ack`: `UPDATE alerts SET acknowledged_by, acknowledged_at WHERE id = ? AND puskesmas_id = ? AND acknowledged_at IS NULL`. Zero rows updated on an already acknowledged alert returns the existing acknowledgement with 200, which is how the first acknowledgement wins. Audit `alert.ack` in the same transaction.

### Override

`POST /api/nurse/checkins/[id]/override` with `{ level, note }`. Stores `override_level`, `override_note` (redacted), `overridden_by`, `overridden_at`; `triage_level` is never modified. Audit `checkin.override` with `meta { from, to }`. Raising to RED inserts the alert if missing (and notifies). Lowering leaves alerts untouched. The family's stored reply is not rewritten: the nurse is expected to phone, and silently changing what a family saw would falsify the record.

A nurse may override in either direction. The system-level rule "escalation only" binds the software, not the clinician; the note and audit entry are the control.

### Timeline

`GET /api/nurse/patients/[id]/timeline` returns check-ins newest first with the fields in the spec; audit `patient.read`. The page marks fallback check-ins with a "fallback" tag and shows `review_status` of the rules and corpus in the footer.

### `nurse_digest` flow

```
Text Input (puskesmas_id, date)
  → Queue Reader   (langflow/components/queue_reader.py: GET /api/internal/queue with x-internal-token)
  → Prompt         (summarise each entry in one line, keep order, no advice)
  → Gemini model
  → Merge          (custom: re-attach model lines to entries by index; on any mismatch or model error use the app's reasons)
  → Chat Output    (JSON: [{ rank, code, score, band, level, reason, suggested_action }])
```

The ranking step in the plan's flow table is the application's ranking passed through; the flow does not sort. `Merge` checks the model returned exactly N lines and runs the dosing and diagnosis patterns over them; any failure falls back to the application's reasons. The Queue Reader's base URL and token are Langflow global variables (`TUNTAS_APP_URL`, `TUNTAS_INTERNAL_TOKEN`) set by the deploy script. From a Langflow on the host, the app is `http://localhost:3000`; from the compose `langflow` profile, `http://web:3000`.

## Cross-cutting

- **Redaction**: override notes are passed through `redact` before storage. The internal queue response and therefore the digest prompt contain patient codes, scores, levels and reason lines, never note text or contact hashes. Patient codes are pseudonymous and are sent to the LLM provider in the digest; this is documented in `langflow/README.md`.
- **Audit logging**: `queue.read`, `alert.list`, `alert.ack`, `patient.read` (timeline), `checkin.override`, `internal_queue.read` (actor `system:internal`). The SSE connection writes one `alert.stream_open` entry per connection, not per event.
- **Neutral wording**: the nurse console is behind login and may use the product name, but the browser tab title is "Konsol Perawat" and alert sounds carry no spoken words, so a screen or speaker in a shared room reveals little.
- **Bahasa copy**: labels, actions ("Telepon", "Kunjungan rumah", "Ambil obat lebih awal"), the acknowledge button ("Sudah saya lihat") and validation messages are Bahasa Indonesia in `nurse.id.ts`.

## Risks / Trade-offs

- [No nurse has the console open when a RED arrives] → The alert waits unacknowledged and is the first thing shown on next open; the family's RED reply already tells them to go today. Out-of-console notification is a stated non-goal.
- [SSE blocked by a proxy] → Automatic polling fallback; the heartbeat comment keeps idle connections alive.
- [A nurse lowers a true RED] → Requires a note, is audited, keeps the alert and acknowledgement, and shows "diubah oleh perawat" with the original level on the timeline.
- [Queue-time scoring is slower than reading stored scores] → Batched queries; caseload per Puskesmas is small.
- [Internal token leaks] → The endpoint returns minimised data, the token is a long random secret compared in constant time, and it can be rotated by changing one variable.

## Open Questions

- Do nurses want the queue to hide zero-score patients by default? A display preference to settle in the usability test.
