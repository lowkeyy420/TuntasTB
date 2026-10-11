# Spec Delta

## Purpose

Lets a family member or patient report, in about twenty seconds a day and even without a connection, whether today's medicine was taken and how the patient feels, and turns that report into a stored check-in with a triage level and a risk score.

## ADDED Requirements

### Requirement: Check-in inputs
The check-in screen SHALL ask "Obat hari ini sudah diminum?" with the answers Sudah, Belum and Sebagian, offer one chip per symptom in the triage table, and offer an optional note of up to 500 characters.

#### Scenario: Screen content
- **WHEN** a consented family member opens their link
- **THEN** the question, the three answers, the symptom chips and the optional note field are shown

#### Scenario: Chips come from the triage table
- **WHEN** a symptom is added to the triage table
- **THEN** a chip for it appears on the check-in screen without a code change to the screen

#### Scenario: Note length limit
- **WHEN** a user types more than 500 characters in the note
- **THEN** the field stops accepting input at 500 characters and shows the remaining count

### Requirement: Submission in at most three taps
A check-in with a dose status and one symptom SHALL be submittable in at most 3 taps from the moment the check-in screen is shown, and a check-in with no symptom in at most 2 taps.

#### Scenario: Dose and one symptom
- **WHEN** a user taps "Sudah", taps one symptom chip and taps "Kirim"
- **THEN** the check-in is submitted

#### Scenario: Dose only
- **WHEN** a user taps "Sudah" and taps "Kirim"
- **THEN** the check-in is submitted

#### Scenario: Send is blocked without a dose status
- **WHEN** no dose status has been chosen
- **THEN** the "Kirim" button is disabled

### Requirement: Voice note
The check-in screen SHALL offer a microphone button that converts speech in Bahasa Indonesia into text in the note field where the device supports it, and the system MUST NOT store or upload audio.

#### Scenario: Dictation
- **WHEN** a user taps the microphone and says "mual terus, matanya agak kuning"
- **THEN** the transcript appears in the note field and can be edited before sending

#### Scenario: Device without speech recognition
- **WHEN** the device does not support speech recognition
- **THEN** the microphone button is not shown and the note field still works

#### Scenario: Only text is submitted
- **WHEN** a dictated check-in is submitted
- **THEN** the request contains the transcript text and no audio data

### Requirement: Server-side validation
The system MUST reject a check-in whose dose status is not yes, no or partial, whose chip list is not a list of strings, or whose note exceeds 500 characters, and MUST store nothing for a rejected check-in.

#### Scenario: Invalid dose status
- **WHEN** a check-in is submitted with dose status "maybe"
- **THEN** the response has HTTP status 400 and nothing is stored

#### Scenario: Note too long
- **WHEN** a check-in is submitted with a 501-character note
- **THEN** the response has HTTP status 400 and nothing is stored

#### Scenario: Unknown chip code is kept
- **WHEN** a check-in is submitted with a chip code that is not in the triage table
- **THEN** the check-in is accepted and its level is at least YELLOW

### Requirement: Access by family link with consent
The system MUST accept a check-in only when it carries a valid, unrevoked family link token for a patient with recorded consent, and SHALL attribute it to that patient only.

#### Scenario: Revoked link
- **WHEN** a check-in is submitted with a revoked token
- **THEN** the request is rejected and nothing is stored

#### Scenario: No consent
- **WHEN** a check-in is submitted for a patient without recorded consent
- **THEN** the request is rejected and nothing is stored

#### Scenario: Patient cannot be chosen by the client
- **WHEN** a check-in request includes a patient identifier different from the token's patient
- **THEN** the request is rejected

### Requirement: Treatment day is computed by the server
The system SHALL compute the treatment day of a check-in from the patient's start date and the check-in's date, and MUST ignore any treatment day supplied by the client.

#### Scenario: Day 18
- **WHEN** a patient who started on 1 March checks in on 18 March
- **THEN** the stored treatment day is 18

#### Scenario: Client-supplied day
- **WHEN** a check-in request includes a treatment day of 99
- **THEN** the stored treatment day is the one computed by the server

### Requirement: Note is redacted before storage
The system MUST redact the note before storing it and before any other processing that leaves the request, and MUST NOT persist the original note.

#### Scenario: Phone number in the note
- **WHEN** a check-in note contains "telepon 081234567890"
- **THEN** the stored note contains "[TELEPON]" and the number is stored nowhere

### Requirement: Every check-in is triaged by the deterministic rules
The system SHALL run the deterministic triage rules on the chips and the redacted note for every check-in, and the stored triage level MUST NOT be lower than the level those rules return.

#### Scenario: GREEN demo case
- **WHEN** a check-in on day 18 has dose status yes and the note "kencingnya merah"
- **THEN** the deterministic rules return GREEN and the stored level is not lower than GREEN

#### Scenario: YELLOW demo case
- **WHEN** a check-in on day 41 has dose status yes and the note "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti"
- **THEN** the stored level is YELLOW and the stored risk band is high

#### Scenario: RED demo case
- **WHEN** a check-in on day 23 has the note "matanya kuning"
- **THEN** the stored level is RED

### Requirement: Every check-in is scored
The system SHALL compute the dropout-risk score for every check-in and store the score, band and reasons with it.

#### Scenario: Score stored with reasons
- **WHEN** a check-in with dose status no is stored
- **THEN** the stored check-in has a score of at least 2 and reasons that include the missed dose

### Requirement: RED creates an alert immediately
The system MUST create exactly one alert for a check-in whose stored level is RED, in the same operation that stores the check-in, and MUST NOT create an alert for GREEN or YELLOW.

#### Scenario: RED check-in
- **WHEN** a RED check-in is stored
- **THEN** one unacknowledged alert exists for it, for the patient's Puskesmas

#### Scenario: YELLOW check-in
- **WHEN** a YELLOW check-in is stored
- **THEN** no alert is created

#### Scenario: Check-in and alert are stored together
- **WHEN** the alert for a RED check-in cannot be stored
- **THEN** the check-in is not reported to the family as sent and the device keeps it for retry

### Requirement: Reply after submission
After a check-in is stored the system SHALL show the family the triage level's message, exactly one action for that level and the Puskesmas contact number, and the reply for RED MUST tell them to go to the Puskesmas or IGD today.

#### Scenario: RED reply
- **WHEN** a RED check-in is submitted online
- **THEN** the reply tells the family to go to the Puskesmas or IGD today, says the nurse has been informed and ends with the Puskesmas contact number

#### Scenario: YELLOW reply
- **WHEN** a YELLOW check-in is submitted
- **THEN** the reply says to keep taking the medicine and that the nurse will be in contact within 1 working day, and ends with the Puskesmas contact number

#### Scenario: Reply never reassures falsely
- **WHEN** any reply is shown
- **THEN** it does not contain the word "aman"

### Requirement: Works offline
The check-in screen SHALL open and accept a check-in without a network connection once it has been opened online before, and SHALL keep unsent check-ins on the device until they are stored by the server.

#### Scenario: Open without a connection
- **WHEN** a user who has used the link before opens it with no connection
- **THEN** the check-in screen is shown and usable

#### Scenario: Submit without a connection
- **WHEN** a user submits a check-in with no connection
- **THEN** the check-in is saved on the device and the screen shows "Belum terkirim, akan dikirim saat ada sinyal"

#### Scenario: Unsent check-ins survive a restart
- **WHEN** the browser is closed and reopened before the connection returns
- **THEN** the unsent check-in is still queued

### Requirement: Sync later without duplicates
The system SHALL send queued check-ins when the connection returns or the app is next opened, and a check-in submitted more than once MUST be stored only once.

#### Scenario: Connection returns
- **WHEN** the device regains its connection while a check-in is queued
- **THEN** the check-in is sent, stored by the server and marked "Terkirim" on the device

#### Scenario: Retry after an unknown outcome
- **WHEN** the same check-in is received by the server twice because the first response was lost
- **THEN** one check-in exists and both requests receive the same result

#### Scenario: Date of an offline check-in
- **WHEN** a check-in made offline on 3 March is synced on 4 March
- **THEN** it is stored for 3 March with the treatment day of 3 March

#### Scenario: Implausible device date
- **WHEN** a synced check-in claims a date in the future or more than 7 days in the past
- **THEN** it is stored for the day the server received it

### Requirement: Provisional reply while offline
While offline the device SHALL apply the same triage rule files to the check-in and show a provisional reply, and for a provisional RED it MUST tell the family to go to the Puskesmas or IGD today and that the nurse has not yet been informed.

#### Scenario: Offline RED
- **WHEN** a user submits "matanya kuning" with no connection
- **THEN** the screen tells them to go to the Puskesmas or IGD today, states that the nurse has not received the report yet, and shows the Puskesmas number to call

#### Scenario: Offline non-RED
- **WHEN** a user submits a check-in with no red-flag symptom while offline
- **THEN** the provisional reply includes the standing warning to go to the Puskesmas for yellow eyes or skin, rash or vision problems

#### Scenario: Server result replaces the provisional one
- **WHEN** a queued check-in is synced and the server returns a level
- **THEN** the device shows the server's reply for that check-in

### Requirement: Usable on low-end phones by low-literacy users
The check-in screen SHALL use body text of at least 18 CSS pixels and touch targets of at least 48 by 48 CSS pixels, and SHALL remain fully usable at a viewport width of 320 CSS pixels.

#### Scenario: Narrow screen
- **WHEN** the check-in screen is rendered at a width of 320 CSS pixels
- **THEN** all controls are visible without horizontal scrolling and each is at least 48 CSS pixels high

### Requirement: Submission limit
The system SHALL accept at most 20 check-ins per patient per calendar day.

#### Scenario: Twenty-first check-in
- **WHEN** a twenty-first check-in is submitted for a patient on the same day
- **THEN** the response has HTTP status 429 and nothing is stored

### Requirement: Check-ins are audited
The system SHALL write an audit entry for every stored check-in, in the same operation, without the note text.

#### Scenario: Audit entry
- **WHEN** a check-in is stored
- **THEN** an audit entry records the family actor for that patient, a check-in action, the check-in as target and the time
