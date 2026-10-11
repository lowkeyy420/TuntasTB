# Spec Delta

## Purpose

Gives the Puskesmas nurse a ranked, explained list of patients to contact and an immediate, acknowledged alert for every red flag, while keeping the nurse in control of the final judgement.

## ADDED Requirements

### Requirement: Ranked queue
The system SHALL show a nurse all patients of their Puskesmas ordered by current dropout-risk score from highest to lowest, and among equal scores by most recent check-in first.

#### Scenario: Higher risk first
- **WHEN** patient A has a score of 8 and patient B a score of 5
- **THEN** A is listed above B

#### Scenario: Tie broken by recency
- **WHEN** patients A and B both have a score of 6, A last checked in today and B yesterday
- **THEN** A is listed above B

#### Scenario: Patient who never checked in
- **WHEN** two patients have equal scores and one has never checked in
- **THEN** the patient who has never checked in is listed below the other

#### Scenario: Demo morning
- **WHEN** the nurse opens the queue the morning after the day 41 check-in "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti"
- **THEN** that patient is first in a queue of otherwise low-risk patients

### Requirement: Score is current when the queue is read
The queue SHALL use each patient's risk score evaluated for the current date, so that silence and missed pickups raise a patient without a new check-in.

#### Scenario: Patient goes silent
- **WHEN** a patient whose last check-in scored 2 has not checked in for 3 days
- **THEN** the queue shows a score of 5 with a reason stating there has been no report for 3 days

### Requirement: Reason and suggested action per entry
Each queue entry SHALL show the patient code, treatment day, score, band, latest triage level, a one-line reason and, when the score is above 0, exactly one suggested action from: telepon, kunjungan rumah, ambil obat lebih awal.

#### Scenario: Nothing to do
- **WHEN** a patient has a score of 0
- **THEN** the entry shows "Tidak ada tindakan" instead of a suggested action

#### Scenario: One-line reason
- **WHEN** the top entry is the demo day 41 patient
- **THEN** its reason mentions 7 days of nausea and that the patient says they are cured

#### Scenario: Suggested home visit
- **WHEN** a patient has not checked in for 3 days or more, or has 3 or more consecutive missed doses
- **THEN** the suggested action is kunjungan rumah

#### Scenario: Suggested early pickup
- **WHEN** a patient has a missed pickup and neither condition for a home visit applies
- **THEN** the suggested action is ambil obat lebih awal

#### Scenario: Suggested call
- **WHEN** a patient has a score above 0 and none of the conditions for a home visit or early pickup applies
- **THEN** the suggested action is telepon

#### Scenario: Reasons behind the score
- **WHEN** a nurse expands a queue entry
- **THEN** every awarded risk factor is listed with its points

### Requirement: Queue is limited to the nurse's Puskesmas
The queue, alert inbox and timeline MUST contain only patients of the authenticated nurse's Puskesmas.

#### Scenario: Other Puskesmas
- **WHEN** a nurse opens the queue
- **THEN** no patient of another Puskesmas appears

### Requirement: RED alert appears within 5 seconds
The system SHALL display a new RED alert in an open nurse console of the patient's Puskesmas within 5 seconds of the check-in being stored, without the nurse reloading the page.

#### Scenario: Live alert
- **WHEN** a RED check-in is stored while a nurse of that Puskesmas has the console open
- **THEN** the alert is visible in that console within 5 seconds

#### Scenario: Alert content
- **WHEN** an alert is displayed
- **THEN** it shows the patient code, treatment day, the red-flag symptoms and the time, and does not show the PMO contact

#### Scenario: Other Puskesmas does not receive it
- **WHEN** a RED check-in is stored for a patient of Puskesmas A
- **THEN** a console of a nurse of Puskesmas B shows no alert

#### Scenario: Live connection unavailable
- **WHEN** the live connection cannot be established or drops
- **THEN** the console falls back to polling and a new RED alert is still visible within 5 seconds

#### Scenario: Console opened later
- **WHEN** a nurse opens the console after a RED alert was created and not yet acknowledged
- **THEN** the alert is shown in the inbox as unacknowledged

### Requirement: Alerts are hard to miss
An unacknowledged alert SHALL remain visible on every nurse console page with a count of unacknowledged alerts until it is acknowledged.

#### Scenario: Navigating away
- **WHEN** a nurse with one unacknowledged alert opens the patient list
- **THEN** the page still shows that there is 1 unacknowledged alert

### Requirement: Acknowledge is logged with actor and time
The system SHALL let a nurse acknowledge an alert, MUST record which nurse acknowledged it and when, and MUST write an audit entry for the acknowledgement.

#### Scenario: Acknowledge
- **WHEN** a nurse presses the acknowledge button on an alert
- **THEN** the alert stores that nurse and the current time, an audit entry is written, and the alert leaves the unacknowledged list

#### Scenario: Acknowledge log
- **WHEN** a nurse opens the acknowledge log
- **THEN** each alert is listed with its creation time, the acknowledging nurse and the acknowledgement time

#### Scenario: Second acknowledgement
- **WHEN** a second nurse acknowledges an alert that is already acknowledged
- **THEN** the first acknowledgement is kept unchanged

#### Scenario: Other consoles update
- **WHEN** one nurse acknowledges an alert
- **THEN** other open consoles of the same Puskesmas stop showing it as unacknowledged within 5 seconds

#### Scenario: Other Puskesmas cannot acknowledge
- **WHEN** a nurse tries to acknowledge an alert of another Puskesmas
- **THEN** the request is rejected and the alert is unchanged

### Requirement: Patient timeline
The system SHALL show a nurse a patient's check-ins in reverse time order with treatment day, dose status, symptoms including unknown ones, the redacted note, triage level, risk score with reasons, the reply shown to the family, whether the fallback was used, and alert status.

#### Scenario: Timeline content
- **WHEN** a nurse opens the timeline of the demo day 41 patient
- **THEN** the day 41 check-in is first and shows YELLOW, the redacted note, a score of 8 and its three reasons

#### Scenario: Viewing is audited
- **WHEN** a nurse opens a patient's timeline
- **THEN** an audit entry records the nurse, a read action, the patient and the time

### Requirement: Override requires a note
The system SHALL let a nurse override the triage level of a check-in only with a note of at least 10 characters, and MUST keep the original level alongside the override.

#### Scenario: Override with a note
- **WHEN** a nurse sets a YELLOW check-in to RED with the note "Keluarga bilang kulit mulai kuning"
- **THEN** the check-in shows RED as overridden by that nurse, and the original YELLOW remains visible

#### Scenario: Override without a note
- **WHEN** a nurse submits an override with an empty note
- **THEN** the override is rejected and the level is unchanged

#### Scenario: Note is redacted
- **WHEN** an override note contains a phone number
- **THEN** the stored note contains the placeholder instead of the number

### Requirement: Override is audited
Every override MUST write an audit entry with the nurse, the time, the check-in, the original level and the new level, in the same operation as the override.

#### Scenario: Audit entry
- **WHEN** an override is saved
- **THEN** an audit entry records the nurse, the check-in, the old level, the new level and the time

### Requirement: Override effects
An override to RED SHALL create an alert if the check-in has none, and an override to a lower level MUST NOT delete an existing alert or its acknowledgement and MUST NOT change the message already shown to the family.

#### Scenario: Raised to RED
- **WHEN** a nurse overrides a YELLOW check-in to RED
- **THEN** an alert exists for that check-in

#### Scenario: Lowered from RED
- **WHEN** a nurse overrides a RED check-in to YELLOW with a note
- **THEN** the alert and any acknowledgement remain in the log and the queue uses YELLOW for that check-in

### Requirement: Internal ranked list for the digest
The system SHALL expose `GET /api/internal/queue` returning the ranked list for a given Puskesmas and date to callers presenting the internal token, and MUST reject callers without it.

#### Scenario: Valid token
- **WHEN** the endpoint is called with the internal token, a Puskesmas identifier and a date
- **THEN** the response lists the patients in queue order with code, score, band, level, reason and suggested action

#### Scenario: Missing or wrong token
- **WHEN** the endpoint is called without the internal token or with a wrong one
- **THEN** the response has HTTP status 401 and contains no patient data

#### Scenario: Minimal fields
- **WHEN** the endpoint responds
- **THEN** the response contains no note text, no contact hash and no family token

#### Scenario: Token not configured
- **WHEN** no internal token is configured
- **THEN** the endpoint rejects every request

### Requirement: Nurse digest flow
The `nurse_digest` flow SHALL return the ranked list for a Puskesmas and date in the order supplied by the application with a one-line reason per patient, and MUST NOT reorder, drop or add patients.

#### Scenario: Order preserved
- **WHEN** the digest is requested for a Puskesmas with five ranked patients
- **THEN** the digest lists the same five patient codes in the same order

#### Scenario: Summary fails
- **WHEN** the language model step fails
- **THEN** the flow returns the ranked list with the application's own one-line reasons

#### Scenario: No dosing or diagnosis in the digest
- **WHEN** a digest is produced
- **THEN** it contains no dosing content and no diagnosis wording
