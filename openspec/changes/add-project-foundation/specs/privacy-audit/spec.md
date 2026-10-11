# Spec Delta

## Purpose

Protects patients and families from disclosure: personal identifiers are removed from free text, every access to patient data is traceable, data is only collected with consent, and nothing a bystander can see reveals the illness.

## ADDED Requirements

### Requirement: Free-text redaction
The system SHALL replace phone numbers, 16-digit NIK numbers, email addresses, personal names introduced by a self-naming phrase, and street addresses in free text with fixed placeholders, and the same input MUST always produce the same output.

#### Scenario: Phone number
- **WHEN** the text "hubungi saya di 0812-3456-7890 ya" is redacted
- **THEN** the result is "hubungi saya di [TELEPON] ya"

#### Scenario: International phone format
- **WHEN** the text "wa +62 812 3456 7890" is redacted
- **THEN** the result contains "[TELEPON]" and contains no digit sequence from the number

#### Scenario: NIK
- **WHEN** the text "NIK 3174012345678901" is redacted
- **THEN** the result is "NIK [NIK]"

#### Scenario: Email
- **WHEN** the text "email rina@example.com" is redacted
- **THEN** the result is "email [EMAIL]"

#### Scenario: Name after a self-naming phrase
- **WHEN** the text "nama saya Budi Santoso, mual terus" is redacted
- **THEN** the result is "nama saya [NAMA], mual terus"

#### Scenario: Address
- **WHEN** the text "rumah di Jl. Kebon Jeruk No. 12 RT 03/RW 05, mata kuning" is redacted
- **THEN** the result contains "[ALAMAT]", does not contain "Kebon Jeruk", and still contains "mata kuning"

#### Scenario: Ordinary sentence is unchanged
- **WHEN** the text "saya mual dan jalan sempoyongan" is redacted
- **THEN** the result is identical to the input

### Requirement: Redaction before storage and before any LLM call
The system MUST redact free text before storing it and before sending it to any external service, and MUST NOT persist or log the unredacted text.

#### Scenario: Stored text is redacted
- **WHEN** free text containing a phone number is accepted by the system
- **THEN** the stored value contains the placeholder and the phone number appears in no database table and no application log

#### Scenario: Outbound payload is redacted
- **WHEN** the system sends text to Langflow
- **THEN** the payload contains only the redacted text

### Requirement: Audit log of reads and writes
The system SHALL record an audit entry with actor, action, target and timestamp for every read and every write of patient data, and audit entries MUST NOT contain free text, link tokens, passwords or contact details.

#### Scenario: Nurse reads a patient
- **WHEN** an authenticated nurse opens a patient's record
- **THEN** an audit entry is stored with that nurse as actor, a read action, the patient as target and the current time

#### Scenario: Family access is audited
- **WHEN** a family member opens their link and submits data
- **THEN** audit entries are stored with a family actor bound to that patient and without the link token

#### Scenario: Write and audit succeed or fail together
- **WHEN** a write of patient data is attempted and the audit entry cannot be stored
- **THEN** the write is not committed

### Requirement: Audit log is append-only
The system MUST NOT provide any application function that updates or deletes audit entries.

#### Scenario: No mutation route exists
- **WHEN** any API route of the application is called with any method
- **THEN** no existing audit entry is changed or removed

### Requirement: Consent is stored and enforced
The system SHALL store the time consent was given for each patient and MUST reject the collection of check-ins, questions or any other patient-reported data for a patient without stored consent.

#### Scenario: Data submitted before consent
- **WHEN** patient-reported data is submitted for a patient whose consent time is empty
- **THEN** the request is rejected, nothing is stored and no external service is called

#### Scenario: Consent recorded
- **WHEN** consent is given for a patient
- **THEN** the consent time is stored and an audit entry records the event

### Requirement: Deletion on request
The system SHALL let a nurse delete a patient of their own Puskesmas together with that patient's check-ins, alerts and pickups, and MUST keep an audit entry of the deletion that identifies the patient only by internal identifier.

#### Scenario: Patient deleted
- **WHEN** a nurse confirms deletion of a patient in their Puskesmas
- **THEN** the patient, their check-ins, alerts and pickups no longer exist and an audit entry records who deleted them and when

#### Scenario: Other Puskesmas
- **WHEN** a nurse requests deletion of a patient belonging to another Puskesmas
- **THEN** the request is rejected and nothing is deleted

### Requirement: Neutral wording on family-visible surfaces
The application name, page titles, PWA manifest name and short name, icons, notifications and source labels shown to families SHALL be neutral, using the name "Pengingat Harian", and MUST NOT contain "TB", "TBC", "tuberkulosis" or "TuntasTB".

#### Scenario: Manifest is neutral
- **WHEN** the PWA manifest is fetched
- **THEN** its name and short name are "Pengingat Harian" and it contains none of the forbidden terms

#### Scenario: Family page titles are neutral
- **WHEN** any page under the family link is rendered
- **THEN** its title contains none of the forbidden terms

#### Scenario: Forbidden term in family copy fails the build checks
- **WHEN** a family-visible string containing "TBC" is added to the application
- **THEN** the automated wording check fails

### Requirement: Plain Bahasa Indonesia copy
All user-facing copy SHALL be written in plain Bahasa Indonesia and kept in one place per audience so it can be reviewed without reading application logic.

#### Scenario: Copy is centralised
- **WHEN** a reviewer opens the family copy file
- **THEN** every string shown on family pages is present there in Bahasa Indonesia
