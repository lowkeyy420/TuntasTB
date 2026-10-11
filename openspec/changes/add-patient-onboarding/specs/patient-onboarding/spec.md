# Spec Delta

## Purpose

Lets a Puskesmas nurse register a patient by code only and hand the family a private link, and makes sure the family has consented before the system collects anything about the patient.

## ADDED Requirements

### Requirement: Nurse registers a patient
The system SHALL let an authenticated nurse create a patient with a patient code, treatment start date, regimen phase (intensive or continuation) and pickup interval in days, and the patient MUST belong to that nurse's Puskesmas.

#### Scenario: Valid registration
- **WHEN** a nurse submits code "JKT-0042", start date 1 March 2026, phase intensive and pickup interval 7
- **THEN** the patient is created in the nurse's Puskesmas and appears in the nurse's patient list

#### Scenario: Missing required field
- **WHEN** a nurse submits the form without a start date
- **THEN** no patient is created and the form shows which field is missing in Bahasa Indonesia

#### Scenario: Start date in the future
- **WHEN** a nurse submits a start date later than today
- **THEN** no patient is created and the form explains that the start date cannot be in the future

#### Scenario: Pickup interval out of range
- **WHEN** a nurse submits a pickup interval of 0 or greater than 60
- **THEN** no patient is created and the form shows the allowed range

### Requirement: No name is collected
The registration form and API MUST NOT offer or accept a patient name, date of birth, address or NIK, and the patient code SHALL be the only identifier of the patient.

#### Scenario: Form has no name field
- **WHEN** the registration form is rendered
- **THEN** it contains no input for a name, date of birth, address or NIK

#### Scenario: Extra field is rejected
- **WHEN** a registration request includes a `name` property
- **THEN** the request is rejected and no patient is created

### Requirement: Patient code format and uniqueness
The patient code SHALL be 3 to 20 characters of uppercase letters, digits and hyphens, and MUST be unique within a Puskesmas.

#### Scenario: Duplicate code
- **WHEN** a nurse submits a code already used in their Puskesmas
- **THEN** no patient is created and the form shows "Kode sudah dipakai"

#### Scenario: Code with a space
- **WHEN** a nurse submits the code "Budi Santoso"
- **THEN** no patient is created and the form shows the allowed code format

#### Scenario: Same code in another Puskesmas
- **WHEN** a nurse submits a code that exists only in a different Puskesmas
- **THEN** the patient is created

### Requirement: PMO contact is stored as a hash
The system SHALL accept an optional PMO phone number at registration, MUST store it only as a keyed hash, and MUST NOT store, log or display the number afterwards.

#### Scenario: PMO phone provided
- **WHEN** a nurse registers a patient with PMO phone "0812-3456-7890"
- **THEN** a hash is stored, the digits appear in no table or log, and the patient is shown as having a PMO

#### Scenario: No PMO
- **WHEN** a nurse registers a patient without a PMO phone
- **THEN** the patient is created and shown as having no PMO

#### Scenario: Same number in different formats
- **WHEN** "0812-3456-7890" and "+62 812 3456 7890" are hashed
- **THEN** both produce the same stored hash

### Requirement: Family link is issued once and stored hashed
On registration the system SHALL generate an unguessable family link of the form `/f/<token>`, show it to the nurse exactly once, and MUST store only a hash of the token.

#### Scenario: Link shown after registration
- **WHEN** a patient is created
- **THEN** the nurse sees the full family link with a copy button

#### Scenario: Link cannot be read back
- **WHEN** the nurse opens the same patient later
- **THEN** the link is not displayed and only its status (active, revoked) is shown

#### Scenario: Token is not stored in clear
- **WHEN** a patient is created
- **THEN** the token value appears in no database table, audit entry or log

### Requirement: Family link resolves to exactly one patient
The system SHALL give the holder of a valid family link access to that one patient's family view and to nothing else, and MUST show a neutral page for an unknown or revoked link.

#### Scenario: Valid link
- **WHEN** a family member opens a valid, unrevoked link
- **THEN** the family view for that patient opens without asking for an account

#### Scenario: Unknown link
- **WHEN** someone opens `/f/` followed by a token that matches no patient
- **THEN** the page shows "Tautan tidak berlaku. Hubungi petugas Puskesmas." and reveals nothing about any patient

#### Scenario: Revoked link gives the same answer
- **WHEN** someone opens a revoked link
- **THEN** the response is identical to the unknown-link response

### Requirement: Nurse can rotate and revoke the family link
The system SHALL let a nurse rotate a patient's family link, which invalidates the old token and issues a new one, and revoke it, which leaves the patient with no working link.

#### Scenario: Rotate
- **WHEN** a nurse rotates a patient's link
- **THEN** the new link is shown once, the old link stops working immediately and the action is audited

#### Scenario: Revoke
- **WHEN** a nurse revokes a patient's link
- **THEN** the link stops working immediately, family API calls with it are rejected, and the action is audited

#### Scenario: Other Puskesmas
- **WHEN** a nurse tries to rotate the link of a patient in another Puskesmas
- **THEN** the request is rejected and the link is unchanged

### Requirement: Consent before first check-in
The system SHALL show a consent screen in plain Bahasa Indonesia the first time a family link is opened, and MUST NOT show the check-in or accept any patient-reported data until consent is given.

#### Scenario: First open
- **WHEN** a family member opens a valid link for a patient without recorded consent
- **THEN** the consent screen is shown instead of the check-in

#### Scenario: Consent given
- **WHEN** the family member taps "Saya setuju"
- **THEN** the consent time is recorded, an audit entry is written and the check-in screen opens

#### Scenario: Consent declined
- **WHEN** the family member taps "Tidak setuju"
- **THEN** nothing is recorded about the patient and the screen shows how to contact the Puskesmas

#### Scenario: Consent already given
- **WHEN** a family member opens the link after consent was recorded
- **THEN** the consent screen is not shown again

#### Scenario: Consent survives link rotation
- **WHEN** a nurse rotates the link of a patient who has already consented
- **THEN** the new link opens the check-in without asking for consent again

### Requirement: Consent screen content
The consent screen SHALL state what is collected, who can see it, that text is processed by an automated system after personal details are removed, that the service does not replace the nurse, and how to withdraw, and MUST NOT name the illness.

#### Scenario: Required statements present
- **WHEN** the consent screen is rendered
- **THEN** it contains each of the five statements and none of the forbidden terms for family-visible surfaces

### Requirement: Nurse patient list
The system SHALL show a nurse the patients of their Puskesmas with code, treatment day, phase, PMO status, consent status and link status.

#### Scenario: List after registration
- **WHEN** a nurse opens the patient list after registering a patient
- **THEN** the patient appears with consent status "Belum setuju" and link status "Aktif"

#### Scenario: Treatment day
- **WHEN** a patient's start date is 1 March and today is 18 March
- **THEN** the list shows treatment day 18

### Requirement: Onboarding actions are audited
The system SHALL write an audit entry for patient creation, link rotation, link revocation, consent, and each nurse view of the patient list or a patient.

#### Scenario: Registration is audited
- **WHEN** a nurse registers a patient
- **THEN** an audit entry records the nurse, a patient-create action, the patient and the time, without the PMO number or the token
