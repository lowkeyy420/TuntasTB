# Spec Delta

## Purpose

Decides, by fixed rules and never by a language model, whether a daily check-in is GREEN (continue), YELLOW (nurse will contact) or RED (go to the Puskesmas today), always erring toward escalation.

## ADDED Requirements

### Requirement: Deterministic triage table
The system SHALL assign each known symptom code exactly one base level (GREEN, YELLOW or RED) from a single triage table, and the same input MUST always produce the same level and reasons.

#### Scenario: Orange or red urine
- **WHEN** the only reported symptom is orange or red urine
- **THEN** the level is GREEN

#### Scenario: Mild nausea after pills
- **WHEN** the only reported symptom is mild nausea
- **THEN** the level is GREEN

#### Scenario: Mild joint ache
- **WHEN** the only reported symptom is mild joint ache
- **THEN** the level is GREEN

#### Scenario: Tingling or burning feet
- **WHEN** the only reported symptom is tingling or burning feet
- **THEN** the level is YELLOW

#### Scenario: Itching without rash
- **WHEN** the only reported symptom is itching without rash
- **THEN** the level is YELLOW

#### Scenario: Yellow eyes or skin
- **WHEN** the only reported symptom is yellow eyes or skin
- **THEN** the level is RED

#### Scenario: Vision change
- **WHEN** the only reported symptom is blurred vision or a change in color vision
- **THEN** the level is RED

#### Scenario: Skin rash
- **WHEN** the only reported symptom is a skin rash
- **THEN** the level is RED

#### Scenario: Repeated vomiting
- **WHEN** the only reported symptom is repeated vomiting
- **THEN** the level is RED

#### Scenario: Confusion
- **WHEN** the only reported symptom is confusion
- **THEN** the level is RED

#### Scenario: Repeatable result
- **WHEN** the same input is evaluated 100 times
- **THEN** every evaluation returns an identical level and identical reasons

### Requirement: No symptoms is GREEN
The system SHALL return GREEN when no symptom chip is selected and the text is empty or contains no symptom, unknown symptom or red-flag keyword.

#### Scenario: Nothing reported
- **WHEN** a check-in has no chips and no text
- **THEN** the level is GREEN

### Requirement: Highest level wins
When several symptoms are reported the system SHALL return the highest level among them, with RED above YELLOW above GREEN.

#### Scenario: GREEN with RED
- **WHEN** orange urine and yellow eyes are both reported
- **THEN** the level is RED

#### Scenario: GREEN with YELLOW
- **WHEN** mild nausea and tingling feet are both reported
- **THEN** the level is YELLOW

### Requirement: Red-flag keyword forces RED
The system MUST return RED whenever the text contains a red-flag keyword pattern, regardless of the chips selected, of hedging words such as "agak" or "kayaknya", and of negation words.

#### Scenario: Hedged red flag
- **WHEN** the text is "mual terus, matanya agak kuning" and no chip is selected
- **THEN** the level is RED

#### Scenario: Uncertain red flag
- **WHEN** the text is "kayaknya penglihatannya buram"
- **THEN** the level is RED

#### Scenario: Red flag overrides green chips
- **WHEN** the chip for orange urine is selected and the text is "muntah terus dari pagi"
- **THEN** the level is RED

#### Scenario: Negated red flag still escalates
- **WHEN** the text is "matanya tidak kuning"
- **THEN** the level is RED

#### Scenario: Demo case
- **WHEN** the text is "matanya kuning" on treatment day 23
- **THEN** the level is RED

### Requirement: Indonesian keywords and slang
The system SHALL recognise symptoms in text using a lexicon of Bahasa Indonesia keywords and everyday variants, matching regardless of letter case, punctuation, repeated letters and common suffixes.

#### Scenario: Demo wording for urine
- **WHEN** the text is "kencingnya merah"
- **THEN** the orange or red urine symptom is recognised and the level is GREEN

#### Scenario: Stretched spelling
- **WHEN** the text is "MUALLL banget"
- **THEN** the nausea symptom is recognised

#### Scenario: Colloquial word
- **WHEN** the text is "kakinya kesemutan terus"
- **THEN** the tingling feet symptom is recognised and the level is YELLOW

#### Scenario: Color word without a body part
- **WHEN** the text is "kuning"
- **THEN** the level is at least YELLOW

### Requirement: Duration escalation
The system SHALL raise nausea or poor appetite to YELLOW when it has lasted 7 days or more, using the longer of the duration stated in the text and the duration supplied from the patient's check-in history.

#### Scenario: Duration stated in text
- **WHEN** the text is "mual terus seminggu"
- **THEN** the level is YELLOW

#### Scenario: Duration from history
- **WHEN** mild nausea is reported and the supplied history says it has persisted for 8 days
- **THEN** the level is YELLOW

#### Scenario: Short duration
- **WHEN** mild nausea is reported with a persistence of 3 days and no duration in the text
- **THEN** the level is GREEN

### Requirement: Unknown symptoms are never GREEN
The system MUST return at least YELLOW when the input contains a chip code that is not in the table, an unknown symptom flagged by extraction, or non-empty text in which no lexicon term is found.

#### Scenario: Unclassifiable text
- **WHEN** the text is "badannya aneh rasanya" and no chip is selected
- **THEN** the level is YELLOW

#### Scenario: Unknown chip code
- **WHEN** a chip code that is not in the table is supplied
- **THEN** the level is at least YELLOW and the code is listed in the reasons

#### Scenario: Unknown symptom with a known green one
- **WHEN** orange urine is reported together with a flagged unknown symptom
- **THEN** the level is YELLOW

### Requirement: Reasons accompany every level
The system SHALL return, with each level, the list of matched symptom codes, the matched red-flag patterns and the rule that set the level.

#### Scenario: Reasons for a red flag
- **WHEN** the text "matanya agak kuning" yields RED
- **THEN** the reasons name the jaundice symptom and identify a red-flag keyword match as the deciding rule

### Requirement: Escalation-only combination
When two triage results for the same check-in are combined, the system MUST return the higher of the two levels and MUST NOT return a level lower than either input.

#### Scenario: Local RED, other GREEN
- **WHEN** a RED result is combined with a GREEN result
- **THEN** the combined level is RED

#### Scenario: Local GREEN, other YELLOW
- **WHEN** a GREEN result is combined with a YELLOW result
- **THEN** the combined level is YELLOW

### Requirement: Single source of truth for rules
The application engine and the Langflow rule component SHALL read the same triage table and lexicon files, and MUST produce identical levels for every case in the shared parity fixture.

#### Scenario: Parity across implementations
- **WHEN** the shared parity fixture is run through both implementations
- **THEN** every case yields the same level and the same matched symptom codes in both

#### Scenario: Table edited
- **WHEN** a symptom's level is changed in the triage table file
- **THEN** both implementations return the new level without any code change

### Requirement: Complete test coverage of the table
Every symptom code, every red-flag pattern and every duration rule in the rule files MUST be exercised by at least one automated test, and the test run MUST fail when an entry has no test.

#### Scenario: New symptom without a test
- **WHEN** a symptom code is added to the triage table without a corresponding test case
- **THEN** the test run fails and names the untested code

#### Scenario: Engine line and branch coverage
- **WHEN** the unit tests of the triage engine are run with coverage
- **THEN** line and branch coverage of the engine are both 100%

### Requirement: Rule files are validated
The system MUST reject malformed rule files and lexicon entries that reference a symptom code missing from the triage table.

#### Scenario: Lexicon references an unknown code
- **WHEN** the lexicon maps a keyword to a code that is not in the triage table
- **THEN** validation fails and names the code

### Requirement: Redaction does not lower triage
Redaction of free text MUST NOT lower the triage level: for any text, the level computed from the redacted text SHALL be equal to or higher than the level computed from the original text.

#### Scenario: Address next to a red flag
- **WHEN** the text "rumah di Jl. Mawar No. 3, mata kuning" is redacted and then triaged
- **THEN** the level is RED

#### Scenario: Lexicon terms survive redaction
- **WHEN** every lexicon keyword is placed in a sentence and that sentence is redacted
- **THEN** the keyword is still present in the redacted sentence
