# Design

## Context

By the time this change is applied the repository has the family link and consent (`add-patient-onboarding`), the triage engine and rule files (`add-triage-rules`) and the risk engine (`add-dropout-risk-score`). This change builds the pipeline of `POST /api/checkins` from the architecture decisions, minus step 4 (the Langflow call), which `add-symptom-extraction` plugs in. Requirements are in `specs/daily-checkin/spec.md`.

## Goals / Non-Goals

**Goals:**

- An end-to-end check-in that is correct and safe with no LLM at all.
- A pipeline with one clearly named seam for the flow call, so adding it later cannot weaken the local result.
- Offline behavior that never leaves a family with a red-flag symptom and no instruction.

**Non-Goals:**

- Background push or reminders.
- A history view for the family (the nurse timeline is in `add-nurse-queue-alerts`).

## Decisions

### Request and response

```
POST /api/checkins
Authorization: Bearer <family token>
{
  "clientId": "uuid generated on the device",
  "occurredOn": "2026-03-18",
  "doseStatus": "yes" | "no" | "partial",
  "chips": ["nausea_mild"],
  "text": "optional, max 500"
}

200
{
  "checkinId": "...",
  "level": "GREEN" | "YELLOW" | "RED",
  "message": "...", "action": "...",
  "citations": [],
  "contact": { "name": "Puskesmas ...", "phone": "..." },
  "fallbackUsed": true
}
```

The body is validated with zod `.strict()`; `patientId` or `treatmentDay` in the body is therefore a 400. The risk score is not in the response: it is nurse-facing.

### Pipeline (`web/src/lib/checkin/pipeline.ts`)

1. `resolveFamilyToken` then `requireConsent`.
2. Validate. Resolve `occurredOn`: accept the client's date when it is not in the future and at most 7 days old in Jakarta time, otherwise use today. Compute `treatmentDay = daysBetween(start_date, occurredOn) + 1`.
3. Idempotency: look up `(patient_id, client_id)`. If found, return the stored result and stop.
4. `textRedacted = redact(text, { protectedTerms })`. The raw `text` variable is not referenced after this line.
5. `local = triage({ chips, text: textRedacted, persistenceDays }, rules)`.
6. `flow = await enrich(...)`. In this change `enrich` is a stub returning `null`; `add-symptom-extraction` replaces it. Its result can only be combined through `maxLevel`.
7. `level = flow ? maxLevel(local.level, flow.level) : local.level`.
8. `risk = scoreRisk(buildRiskSnapshot(db, patientId, occurredOn, { doseStatus, moodFlags, persistence, level }))`.
9. One transaction: insert `checkins` (with `local_level`, `flow_level`, `triage_level`, risk fields, `fallback_used`), insert `alerts` when `level === "RED"`, insert the audit entry. A unique index on `alerts.checkin_id` guarantees one alert.
10. Build the reply from `triageTable.levels[level]` plus the Puskesmas contact, and append `fallback_warning_id` when `fallbackUsed`.

`fallbackUsed` is true whenever no flow result was used, which in this change is always.

Steps 5 to 8 are pure given their inputs, so the pipeline is unit-tested with an in-memory fake of the database functions.

### Multiple check-ins per day

A family may check in again when a symptom appears later in the day. Each submission is its own row; consumers that need "the day's check-in" use the latest row of that day. A cap of 20 per patient per day limits abuse of a leaked link.

### Taps

The screen is a single page, no steps: three large dose buttons, the chip grid, the note field with the microphone, and "Kirim" fixed at the bottom. Dose (1), chip (2), Kirim (3). The note and microphone are optional and outside the tap budget. A Playwright test counts clicks for both scenarios.

### Voice

The microphone button uses the browser's `SpeechRecognition` (`webkitSpeechRecognition`) with `lang = "id-ID"` and writes interim and final transcripts into the note field. It is rendered only when the API exists. No audio reaches our server. On Chrome for Android, recognition is performed by the browser vendor's speech service, so speech leaves the device before our redaction can run; the consent text and a short hint under the button ("Jangan sebut nama atau alamat") say so. Alternative considered: recording audio and transcribing server-side. Rejected: it would mean storing or relaying raw audio of health information.

### Offline

- **Shell**: the service worker precaches the family route's HTML shell, JS, CSS, icon and a JSON bundle of `triage-table.json` and `lexicon.id.json`. Navigation requests to `/f/<token>` fall back to the cached shell; the token stays in the URL and in memory, and the last `GET /api/family/session` response (consent state, Puskesmas contact) is cached in IndexedDB so the offline screen can show the phone number.
- **Queue**: an IndexedDB store `outbox` holding `{ clientId, occurredOn, payload, status }`. `submit()` always writes to the outbox first, then tries the network. Success marks the entry `sent` and stores the server reply; a network error leaves it `queued`.
- **Flush**: on the `online` event, on page load and on visibility change. Background Sync is registered where available as an extra trigger, not relied on.
- **Idempotency**: the server's `(patient_id, client_id)` unique index plus step 3 make retries safe.
- **Provisional reply**: the client imports the same `triage()` TypeScript module and the bundled rule files. Offline, it shows the level's static text with a banner "Belum terkirim". For RED the text is replaced by: "Segera ke Puskesmas atau IGD hari ini. Laporan ini belum sampai ke perawat. Telepon Puskesmas: {phone}."
- A queued check-in older than 7 days is still sent; the server then dates it to the receive day (spec scenario "Implausible device date").

The note is stored unredacted in the device's own outbox until sent. That is the user's own device and own text; it is deleted from the outbox once the server confirms.

### Static copy

Question, answers, chip labels (from `label_id`), status lines and the offline RED text go through `family.id.ts`. Level texts come from `rules/triage-table.json`.

## Cross-cutting

- **Redaction**: step 4 runs before triage, before the enrich seam and before the insert. A test spies on the enrich seam and the insert and asserts neither receives a phone number present in the input. Server logs never include request bodies.
- **Audit logging**: `checkin.create` with actor `family:<patient_id>` and target `checkin:<id>`, inside the insert transaction. `meta` carries the level and `fallback_used` only.
- **Neutral wording**: the screen title is "Pengingat Harian"; the question says "obat" with no illness name; all new strings fall under the forbidden-terms test. The service worker shows no notifications.
- **Bahasa copy**: short everyday words ("Sudah", "Belum", "Sebagian", "Kirim", "Belum terkirim"), one idea per line, written for a primary-school reading level.

## Risks / Trade-offs

- [An offline RED never reaches the nurse if the phone stays offline] → The provisional reply tells the family to go today and to phone, and states plainly that the nurse has not been informed.
- [Speech recognition sends audio to the browser vendor] → Disclosed in consent and at the button; typing is always available; the button can be turned off with a build-time flag if the pilot Puskesmas objects.
- [iOS Safari support for speech recognition and background sync is partial] → Feature detection hides the microphone; flush on load and on `online` does not need Background Sync.
- [A stale cached shell runs old rule files offline] → The bundle carries the rule `version`; the server result always replaces the provisional one on sync, and the service worker refreshes the bundle on each online visit.
- [Dating an old offline check-in to the receive day distorts the consecutive-miss count] → Limited to check-ins more than 7 days late, which the `no_checkin` factor has already surfaced.

## Open Questions

- Median check-in time (target 30 s or less) can only be measured in the usability test with family members; no code depends on the answer.
