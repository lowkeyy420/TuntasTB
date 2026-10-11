# Spec Delta

## Purpose

Scores how likely a patient is to stop treatment using a fixed, published point table, so the nurse's list can be ordered by need and every position on it can be explained.

## ADDED Requirements

### Requirement: Points for dose adherence
The system SHALL add 2 points when today's dose was not taken, 2 points for each consecutive day before today on which the dose was reported as not taken (this part capped at 10 points), and 1 point when today's dose was taken only partially.

#### Scenario: Dose taken
- **WHEN** today's dose status is yes and there are no earlier missed days
- **THEN** no adherence points are added

#### Scenario: Missed today only
- **WHEN** today's dose status is no and yesterday's was yes
- **THEN** 2 points are added for adherence

#### Scenario: Missed today and the two days before
- **WHEN** today's dose status is no and the two preceding days were also no
- **THEN** 6 points are added for adherence

#### Scenario: Cap on consecutive days
- **WHEN** today's dose status is no and the eight preceding days were also no
- **THEN** 12 points are added for adherence, of which 10 are for the consecutive days

#### Scenario: Partial dose
- **WHEN** today's dose status is partial and there are no earlier missed days
- **THEN** 1 point is added for adherence

### Requirement: Points for stop-intent and stigma words
The system SHALL add 4 points when the check-in contains a stop-intent expression and 2 points when it contains a stigma expression, each counted once per check-in, using the shared lexicon and any mood flags supplied by extraction.

#### Scenario: Says they are cured
- **WHEN** the text is "Dimas bilang sudah sembuh, mau berhenti"
- **THEN** 4 points are added for stop intent, once

#### Scenario: Tired of the pills
- **WHEN** the text is "capek minum obat"
- **THEN** 4 points are added for stop intent

#### Scenario: Stigma
- **WHEN** the text is "malu, takut ketahuan tetangga"
- **THEN** 2 points are added for stigma, once

#### Scenario: Flag supplied by extraction only
- **WHEN** the text matches no lexicon entry but extraction supplies a stop-intent flag
- **THEN** 4 points are added for stop intent

#### Scenario: No such words
- **WHEN** the text is "kencingnya merah"
- **THEN** no points are added for stop intent or stigma

### Requirement: Points for an unresolved side effect
The system SHALL add 3 points, once, when at least one symptom reported today has persisted for 7 days or more.

#### Scenario: Seven days of nausea
- **WHEN** nausea is reported today with a persistence of 7 days
- **THEN** 3 points are added

#### Scenario: Two long-running symptoms
- **WHEN** two symptoms reported today have each persisted for 10 days
- **THEN** 3 points are added, not 6

#### Scenario: Recent symptom
- **WHEN** nausea is reported today with a persistence of 3 days
- **THEN** no points are added for an unresolved side effect

### Requirement: Points for today's triage level
The system SHALL add 1 point when today's final triage level is YELLOW and 5 points when it is RED.

#### Scenario: YELLOW today
- **WHEN** today's final triage level is YELLOW
- **THEN** 1 point is added

#### Scenario: RED today
- **WHEN** today's final triage level is RED
- **THEN** 5 points are added and none for YELLOW

#### Scenario: GREEN today
- **WHEN** today's final triage level is GREEN
- **THEN** no points are added for the triage level

### Requirement: Points for program factors
The system SHALL add 4 points when the patient has a missed pickup, 2 points when the patient has no PMO, and 3 points when no check-in has been received for 3 days or more.

#### Scenario: Missed pickup
- **WHEN** the patient has a pickup whose due date has passed without being marked done
- **THEN** 4 points are added

#### Scenario: No PMO
- **WHEN** the patient was registered without a PMO contact
- **THEN** 2 points are added

#### Scenario: Three silent days
- **WHEN** the patient's most recent check-in was 3 days before the evaluation date
- **THEN** 3 points are added

#### Scenario: Two silent days
- **WHEN** the patient's most recent check-in was 2 days before the evaluation date
- **THEN** no points are added for silence

#### Scenario: Never checked in
- **WHEN** a patient registered 4 days ago has never checked in
- **THEN** 3 points are added for silence

### Requirement: Total and band
The system SHALL return the sum of all points as the score and a band of low for 0 to 3, medium for 4 to 7 and high for 8 or more.

#### Scenario: Band boundaries
- **WHEN** scores of 3, 4, 7 and 8 are banded
- **THEN** the bands are low, medium, medium and high

#### Scenario: Demo day 41
- **WHEN** the dose was taken, the text is "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti", the triage level is YELLOW and the patient has a PMO and no missed pickup
- **THEN** the score is 8 (stop intent 4, unresolved side effect 3, YELLOW 1) and the band is high

#### Scenario: Nothing to report
- **WHEN** the dose was taken, there is no text, the level is GREEN, the patient has a PMO, no missed pickup and checked in today
- **THEN** the score is 0 and the band is low

### Requirement: Points are returned with reasons
The system SHALL return, with every score, one reason per awarded factor containing the factor's identifier, its points and a Bahasa Indonesia explanation, and the points in the reasons MUST sum to the score.

#### Scenario: Reasons sum to the score
- **WHEN** any score is computed
- **THEN** the sum of the points listed in its reasons equals the score

#### Scenario: Reason wording
- **WHEN** 4 points are awarded for stop intent
- **THEN** the reasons include an entry with 4 points and a Bahasa Indonesia explanation that the patient said they want to stop or feel cured

#### Scenario: No reasons for a zero score
- **WHEN** the score is 0
- **THEN** the list of reasons is empty

### Requirement: Same input, same score
The risk computation MUST be deterministic: the same input snapshot SHALL always return the same score, band and reasons in the same order, and it MUST NOT depend on the current time, random values or a language model.

#### Scenario: Repeated evaluation
- **WHEN** the same snapshot is scored 100 times
- **THEN** all results are identical

#### Scenario: Evaluation date is an input
- **WHEN** the same patient history is scored for two different evaluation dates
- **THEN** the only differences are those caused by the supplied dates

### Requirement: Inputs derived from history
The system SHALL derive consecutive missed days, symptom persistence, days since the last check-in, missed pickup and PMO presence from stored data for a given evaluation date, using the latest check-in of each calendar day.

#### Scenario: Consecutive misses stop at a taken dose
- **WHEN** the dose status was no yesterday, no two days ago, yes three days ago and no four days ago
- **THEN** the number of consecutive missed days before today is 2

#### Scenario: A day without a check-in breaks the run
- **WHEN** yesterday has no check-in and the day before was no
- **THEN** the number of consecutive missed days before today is 0

#### Scenario: Persistence from history
- **WHEN** nausea appears in today's check-in and in every check-in back to one made 6 days ago
- **THEN** the persistence of nausea is 7 days

#### Scenario: Persistence resets
- **WHEN** nausea appears today and 6 days ago but a check-in in between did not report it
- **THEN** the persistence of nausea counts only from the first check-in after that gap

### Requirement: Risk never lowers triage
The risk score MUST NOT be used to lower or replace the triage level.

#### Scenario: Low risk with RED
- **WHEN** a check-in is RED and all other risk factors are absent
- **THEN** the triage level stays RED and the score is 5

### Requirement: Same points in the flow component
The Langflow risk component SHALL use the same point table as the application and MUST return identical scores and bands for every case in the shared risk fixture.

#### Scenario: Parity
- **WHEN** the shared risk fixture is run through both implementations
- **THEN** every case yields the same score, band and factor identifiers in both
