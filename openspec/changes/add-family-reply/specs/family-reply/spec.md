# Spec Delta

## Purpose

Tells the family, in a few plain words grounded in a reviewed source, what today's symptom usually means and the one thing to do next, while guaranteeing that no generated text reassures falsely, advises on doses or names a diagnosis.

## ADDED Requirements

### Requirement: Reply structure
Every family reply SHALL consist of an explanation, exactly one action determined by the triage level, one source label, and the Puskesmas contact as its last line.

#### Scenario: GREEN reply
- **WHEN** a check-in with the note "kencingnya merah" is GREEN and the flow returns a valid message
- **THEN** the reply explains that this is common with the medicine, gives the single action to keep taking the medicine, shows one source label and ends with the Puskesmas contact

#### Scenario: Contact is last
- **WHEN** any reply is rendered
- **THEN** its last line contains the Puskesmas name and phone number

#### Scenario: One action only
- **WHEN** any reply is rendered
- **THEN** it contains exactly one action line and that line is the one defined for the reply's level

### Requirement: Action is fixed by level
The action shown to the family MUST be taken from the fixed text for the final triage level and MUST NOT be written by the language model.

#### Scenario: YELLOW action
- **WHEN** the final level is YELLOW
- **THEN** the action says to keep taking the medicine and that the nurse will be in contact within 1 working day

#### Scenario: RED action
- **WHEN** the final level is RED
- **THEN** the action says to go to the Puskesmas or IGD today

#### Scenario: Demo day 41
- **WHEN** the note is "mual terus seminggu, Dimas bilang sudah sembuh, mau berhenti" and the level is YELLOW
- **THEN** the reply tells the family not to stop yet and that the nurse will be in contact

### Requirement: Length limit
The explanation and action together MUST NOT exceed 60 words; the source label and the contact line are not counted.

#### Scenario: Within the limit
- **WHEN** a generated explanation of 30 words is combined with its action
- **THEN** the reply is shown as generated

#### Scenario: Too long
- **WHEN** a generated explanation would bring the explanation and action above 60 words
- **THEN** the generated explanation is discarded and the static template for the level is shown

#### Scenario: Static templates fit
- **WHEN** each static template is combined with its action
- **THEN** the total is at most 60 words

### Requirement: Plain language
The explanation SHALL be in Bahasa Indonesia with sentences of at most 20 words and MUST NOT contain terms from the medical jargon list.

#### Scenario: Jargon
- **WHEN** a generated explanation contains "hepatotoksik"
- **THEN** it is discarded and the static template for the level is shown

#### Scenario: Long sentence
- **WHEN** a generated explanation contains a 28-word sentence
- **THEN** it is discarded and the static template for the level is shown

### Requirement: Never says "aman"
A family reply MUST NOT contain the word "aman" in any letter case, and a generated message containing it SHALL be replaced by the static template for the level.

#### Scenario: Reassurance
- **WHEN** a generated explanation says "Ini aman, tidak perlu khawatir"
- **THEN** it is discarded and the static template is shown

#### Scenario: Upper case
- **WHEN** a generated explanation contains "AMAN"
- **THEN** it is discarded

#### Scenario: Different word containing the letters
- **WHEN** a generated explanation contains "nyaman" and no other violation
- **THEN** it is not discarded for this reason

### Requirement: No dosing content
A family reply MUST NOT contain dosing content: an amount in milligrams, a number of tablets, capsules or pills, the word "dosis", or an instruction to reduce, increase, double, skip or change the medicine; a generated message containing any of these SHALL be replaced by the static template.

#### Scenario: Milligrams
- **WHEN** a generated explanation contains "300 mg"
- **THEN** it is discarded and the static template is shown

#### Scenario: Tablet count
- **WHEN** a generated explanation contains "minum 2 tablet saja"
- **THEN** it is discarded

#### Scenario: Reduce the dose
- **WHEN** a generated explanation contains "kurangi dosis"
- **THEN** it is discarded

#### Scenario: Change the medicine
- **WHEN** a generated explanation contains "ganti obat"
- **THEN** it is discarded

#### Scenario: Family asks about doses in the note
- **WHEN** the check-in note is "boleh dikurangi obatnya jadi setengah?"
- **THEN** the reply contains no dosing content and directs the family to the nurse

### Requirement: No diagnosis
A family reply MUST NOT state or suggest what condition the patient has, and a generated message containing diagnosis wording or a named condition from the forbidden list SHALL be replaced by the static template.

#### Scenario: Named condition
- **WHEN** a generated explanation contains "ini tanda hepatitis"
- **THEN** it is discarded and the static template is shown

#### Scenario: Diagnostic phrasing
- **WHEN** a generated explanation contains "Anda menderita"
- **THEN** it is discarded

### Requirement: Grounded with one citation
A generated family message SHALL be shown only when it cites exactly one section that exists in the corpus manifest, and the reply SHALL display that section's label.

#### Scenario: Valid citation
- **WHEN** the flow returns a message citing a section listed in the manifest
- **THEN** the reply shows that section's display label as the source

#### Scenario: No citation
- **WHEN** the flow returns a message with an empty citation list
- **THEN** the message is discarded and the static template with its default citation is shown

#### Scenario: Citation not in the corpus
- **WHEN** the flow returns a message citing an identifier that is not in the manifest
- **THEN** the message is discarded and the static template with its default citation is shown

#### Scenario: Static templates are cited
- **WHEN** any static template is shown
- **THEN** it carries a source label from the manifest

### Requirement: Message matches the final level
A generated message MUST be discarded when it was written for a level different from the final level or when it contradicts the final level's action.

#### Scenario: Level raised after generation
- **WHEN** the flow wrote its message for GREEN and the final level is RED
- **THEN** the static RED template is shown

#### Scenario: Stop instruction below RED
- **WHEN** the final level is YELLOW and the generated explanation says to stop taking the medicine
- **THEN** it is discarded and the static YELLOW template is shown

#### Scenario: Continue instruction at RED
- **WHEN** the final level is RED and the generated explanation says to keep taking the medicine
- **THEN** it is discarded and the static RED template is shown

### Requirement: Static fallback
When the flow is unavailable, returns invalid output or returns no message, the system SHALL show the static template for the level together with the standing warning about yellow eyes or skin, rash and vision problems.

#### Scenario: Langflow down
- **WHEN** a check-in is processed while Langflow is unreachable
- **THEN** the reply is the static template for the level, includes "Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas." and ends with the Puskesmas contact

### Requirement: The filter applies to everything shown
The system MUST apply the same content checks to static templates, corpus-derived source labels and generated messages, and the automated tests MUST fail when a static template violates a check.

#### Scenario: Unsafe edit to a template
- **WHEN** a static template is edited to contain "aman"
- **THEN** the automated tests fail

### Requirement: Source labels are neutral
Source labels shown to families MUST NOT contain "TB", "TBC", "tuberkulosis" or "TuntasTB".

#### Scenario: Manifest labels
- **WHEN** the display labels of all sections in the manifest are checked
- **THEN** none contains a forbidden term

### Requirement: Nurse line
The system SHALL provide, for every check-in, a one-line reason for the nurse of at most 120 characters, using the generated line when it passes the dosing and diagnosis checks and otherwise a line built deterministically from the symptoms and risk reasons.

#### Scenario: Demo day 41
- **WHEN** the check-in reports nausea for 7 days and a stop-intent phrase
- **THEN** the nurse line mentions both the 7 days of nausea and that the patient says they are cured or want to stop

#### Scenario: Generated line rejected
- **WHEN** the generated nurse line contains "kurangi dosis"
- **THEN** the deterministic line is stored instead

#### Scenario: Flow unavailable
- **WHEN** the flow is unavailable
- **THEN** a deterministic nurse line is stored

### Requirement: Curated corpus
The corpus SHALL consist of Bahasa Indonesia documents with stable section identifiers, each carrying its source reference and review status, and the explanation stage MUST retrieve only from this corpus.

#### Scenario: Every section is citable
- **WHEN** the corpus manifest is generated
- **THEN** every section of every corpus document has a unique identifier, a display label and a source reference

#### Scenario: Corpus ingestion is repeatable
- **WHEN** the ingestion flow is run twice on the same corpus
- **THEN** the vector store contains each section once

#### Scenario: Draft status is recorded
- **WHEN** a corpus document has not been reviewed by a clinician
- **THEN** its review status is "draft" and that status appears in the manifest

### Requirement: Discarded messages are recorded
The system SHALL record, for each check-in, whether the generated message was shown or replaced and the reason for replacement, without storing the discarded text in the audit log.

#### Scenario: Replacement reason
- **WHEN** a generated message is replaced because it contains "aman"
- **THEN** the check-in records that the static template was used and that the reason was forbidden reassurance
