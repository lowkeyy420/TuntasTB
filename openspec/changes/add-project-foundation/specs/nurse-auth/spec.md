# Spec Delta

## Purpose

Ensures that only an authenticated Puskesmas nurse can reach the nurse console and its data, and that each nurse only ever sees patients of their own Puskesmas.

## ADDED Requirements

### Requirement: Nurse login
The system SHALL authenticate a nurse with email and password and, on success, issue a signed session in an httpOnly cookie that expires after 12 hours.

#### Scenario: Correct credentials
- **WHEN** the seeded demo nurse submits their correct email and password
- **THEN** the response sets an httpOnly, SameSite=Lax session cookie and the nurse can open the nurse console

#### Scenario: Wrong password
- **WHEN** a nurse submits a correct email with a wrong password
- **THEN** the response has HTTP status 401, sets no session cookie and shows "Email atau kata sandi salah"

#### Scenario: Unknown email gives the same answer
- **WHEN** a login is attempted with an email that does not exist
- **THEN** the response is indistinguishable from the wrong-password response

### Requirement: Passwords are stored hashed
The system MUST store nurse passwords only as bcrypt hashes and MUST NOT log or return a password or its hash.

#### Scenario: Stored value is a hash
- **WHEN** the demo nurse is seeded
- **THEN** the stored password value is a bcrypt hash and differs from the plain password

### Requirement: Login attempt throttling
The system SHALL reject further login attempts for an email after 5 failed attempts within 15 minutes.

#### Scenario: Sixth attempt is throttled
- **WHEN** a sixth login is attempted for the same email within 15 minutes of five failures
- **THEN** the response has HTTP status 429 even if the password is correct

### Requirement: Protected nurse routes
The system MUST reject every request to a nurse page or nurse API route that does not carry a valid, unexpired session.

#### Scenario: API call without a session
- **WHEN** a nurse API route is called without a session cookie
- **THEN** the response has HTTP status 401 and contains no patient data

#### Scenario: Page without a session
- **WHEN** a nurse page is opened without a session cookie
- **THEN** the browser is redirected to the login page

#### Scenario: Tampered session
- **WHEN** a request carries a session cookie whose signature is invalid
- **THEN** the request is treated as unauthenticated

#### Scenario: Expired session
- **WHEN** a request carries a session cookie issued more than 12 hours ago
- **THEN** the request is treated as unauthenticated

### Requirement: Puskesmas scoping
The system MUST limit every nurse read and write to patients of the nurse's own Puskesmas, taking the Puskesmas from the session and never from request input.

#### Scenario: Patient of another Puskesmas
- **WHEN** a nurse requests a patient that belongs to another Puskesmas
- **THEN** the response has HTTP status 404 and reveals nothing about that patient

#### Scenario: Request tries to choose a Puskesmas
- **WHEN** a nurse request includes a Puskesmas identifier different from the one in their session
- **THEN** the identifier from the request is ignored

### Requirement: Logout
The system SHALL end the session when a nurse logs out.

#### Scenario: Logout clears access
- **WHEN** a logged-in nurse logs out and then calls a nurse API route
- **THEN** the response has HTTP status 401

### Requirement: Authentication events are audited
The system SHALL record an audit entry for each successful login, failed login and logout, without recording the password.

#### Scenario: Failed login is recorded
- **WHEN** a login fails
- **THEN** an audit entry records a failed login for the attempted email and the current time
