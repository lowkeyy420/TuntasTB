# Spec Delta

## Purpose

Keeps families aware of when the next medicine pickup is due and lets the nurse and the risk score see at once when a pickup has been missed.

## ADDED Requirements

### Requirement: First pickup is scheduled at registration
When a patient is registered the system SHALL create a pickup due on the treatment start date plus the pickup interval, or on the next multiple of the interval after today when that date has already passed.

#### Scenario: New patient
- **WHEN** a patient is registered today with start date today and a pickup interval of 7 days
- **THEN** a pickup due 7 days from today exists for that patient

#### Scenario: Patient registered after starting
- **WHEN** a patient is registered on 20 March with start date 1 March and a pickup interval of 7 days
- **THEN** the first pickup is due on 22 March

### Requirement: Next due date follows from the interval
When a pickup is marked done the system SHALL schedule the next pickup on the date it was done plus the patient's pickup interval, and a patient MUST have at most one open pickup at a time.

#### Scenario: Done on time
- **WHEN** a pickup due on 8 March is marked done on 8 March for a patient with a 7-day interval
- **THEN** the next pickup is due on 15 March

#### Scenario: Done late
- **WHEN** a pickup due on 8 March is marked done on 10 March for a patient with a 7-day interval
- **THEN** the next pickup is due on 17 March

#### Scenario: Done early
- **WHEN** a pickup due on 8 March is marked done on 6 March for a patient with a 7-day interval
- **THEN** the next pickup is due on 13 March

#### Scenario: Only one open pickup
- **WHEN** a pickup is marked done twice
- **THEN** exactly one new open pickup exists

#### Scenario: Interval changed
- **WHEN** a nurse changes a patient's pickup interval from 7 to 14 days
- **THEN** the current open pickup keeps its due date and the pickup after it is scheduled 14 days after the current one is done

### Requirement: Countdown for the family
The family view SHALL show the number of days until the next pickup, computed in calendar days in Jakarta time.

#### Scenario: Days remaining
- **WHEN** the next pickup is due in 5 days
- **THEN** the family view shows "Ambil obat 5 hari lagi" with the due date

#### Scenario: Due today
- **WHEN** the next pickup is due today
- **THEN** the family view shows "Ambil obat hari ini"

#### Scenario: Late evening
- **WHEN** the next pickup is due on 10 March and the family opens the app at 23:30 Jakarta time on 8 March
- **THEN** the countdown shows 2 days

### Requirement: Nudge two days before
The family view SHALL show a nudge banner when the next pickup is due in 2 days or fewer, and MUST NOT show it earlier.

#### Scenario: Three days before
- **WHEN** the next pickup is due in 3 days
- **THEN** no nudge banner is shown

#### Scenario: Two days before
- **WHEN** the next pickup is due in 2 days
- **THEN** the nudge banner is shown

#### Scenario: One day before
- **WHEN** the next pickup is due tomorrow
- **THEN** the nudge banner is shown and says the pickup is tomorrow

#### Scenario: Banner clears after pickup
- **WHEN** the nurse marks the pickup done and the next one is more than 2 days away
- **THEN** the nudge banner is no longer shown

### Requirement: Missed pickup
A pickup SHALL be considered missed when its due date is before today in Jakarta time and it has not been marked done, and the family view SHALL then show an overdue banner with the Puskesmas contact.

#### Scenario: Day after the due date
- **WHEN** a pickup was due yesterday and is not marked done
- **THEN** the pickup is missed and the family view shows that the pickup is overdue with the Puskesmas number

#### Scenario: Due today is not missed
- **WHEN** a pickup is due today and is not marked done
- **THEN** the pickup is not missed

#### Scenario: Marked done after being missed
- **WHEN** a missed pickup is marked done
- **THEN** the patient no longer has a missed pickup

### Requirement: Missed pickup raises the risk score
While a patient has a missed pickup the dropout-risk score MUST include the missed-pickup points with their reason, and the points MUST disappear once the pickup is marked done.

#### Scenario: Risk rises
- **WHEN** a patient with a score of 2 has a pickup that became missed today
- **THEN** the patient's current score is 6 and the reasons include the missed pickup

#### Scenario: Risk falls back
- **WHEN** the nurse marks that pickup done
- **THEN** the patient's current score no longer includes the missed-pickup points

### Requirement: Nurse marks a pickup done
The system SHALL let a nurse mark the open pickup of a patient in their Puskesmas as done, with today's date by default or an earlier date, and MUST reject a future date.

#### Scenario: Mark done today
- **WHEN** a nurse marks a patient's open pickup as done
- **THEN** the pickup stores the completion time and the next pickup is scheduled

#### Scenario: Backdated
- **WHEN** a nurse marks a pickup done with yesterday's date
- **THEN** the next pickup is scheduled from yesterday

#### Scenario: Future date
- **WHEN** a nurse submits a completion date later than today
- **THEN** the request is rejected and the pickup stays open

#### Scenario: Other Puskesmas
- **WHEN** a nurse tries to mark done a pickup of a patient in another Puskesmas
- **THEN** the request is rejected

#### Scenario: Family cannot mark done
- **WHEN** a request to mark a pickup done is made with a family link token
- **THEN** the request is rejected

### Requirement: Nurse corrects a due date
The system SHALL let a nurse change the due date of a patient's open pickup.

#### Scenario: Reschedule
- **WHEN** a nurse changes an open pickup's due date from 8 March to 10 March
- **THEN** the family countdown and the missed status use 10 March

### Requirement: Nurse sees pickup status
The nurse console SHALL show, for each patient, the next due date and whether the pickup is upcoming, due within 2 days, or missed with the number of days overdue.

#### Scenario: Overdue patient
- **WHEN** a patient's pickup was due 3 days ago and is not done
- **THEN** the console shows the pickup as missed, 3 days overdue

### Requirement: Family pickup view needs a valid link and consent
The system MUST return pickup information only for the patient of a valid, unrevoked family link with recorded consent.

#### Scenario: Revoked link
- **WHEN** pickup information is requested with a revoked token
- **THEN** the request is rejected

### Requirement: Pickup wording is neutral and non-clinical
Pickup banners MUST NOT name the illness or the medicine and MUST NOT give any instruction about doses, including what to do when medicine has run out.

#### Scenario: Overdue banner
- **WHEN** the overdue banner is shown
- **THEN** it asks the family to contact or visit the Puskesmas and contains no dosing instruction and no forbidden term

### Requirement: Pickup actions are audited
The system SHALL write an audit entry when a nurse marks a pickup done or changes a due date, and when pickup information is read.

#### Scenario: Mark done is audited
- **WHEN** a nurse marks a pickup done
- **THEN** an audit entry records the nurse, the action, the pickup and the time
