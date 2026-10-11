# Spec Delta

## Purpose

Defines the visual and interaction contract that every screen must meet so that a family member of any age or reading level, on a small low-end phone in bright light, and a nurse on a phone or laptop, can read each screen and always know what to do next.

## ADDED Requirements

### Requirement: Single light theme
The application SHALL render one light theme regardless of the device's colour-scheme preference and MUST declare itself light-only to the browser.

#### Scenario: Device set to dark
- **WHEN** a page is opened on a device whose colour-scheme preference is dark
- **THEN** the page background and text colours are identical to those shown when the preference is light

#### Scenario: Browser chrome
- **WHEN** any page is loaded
- **THEN** the document declares a light colour scheme and a theme colour taken from the design tokens

#### Scenario: No dark-scheme rules
- **WHEN** the global stylesheet is inspected
- **THEN** it contains no rule conditional on a dark colour-scheme preference

### Requirement: Text contrast
Every declared text-on-background colour pair MUST have a contrast ratio of at least 4.5:1, and pairs declared for body text MUST reach at least 7:1.

#### Scenario: Body text pair
- **WHEN** the contrast of the body text colour against the page and card backgrounds is computed
- **THEN** each ratio is at least 7:1

#### Scenario: Secondary and status text
- **WHEN** the contrast of every other declared text pair, including helper text, button labels and each triage level's text on its own background, is computed
- **THEN** each ratio is at least 4.5:1

#### Scenario: A failing pair blocks the build
- **WHEN** a declared pair falls below its threshold
- **THEN** the automated test suite fails and names the pair

### Requirement: Component and border contrast
The boundary of every input, unselected choice and outlined button, and the focus indicator, MUST have a contrast ratio of at least 3:1 against the surface beside it.

#### Scenario: Input border
- **WHEN** the contrast of the input border colour against the page and card backgrounds is computed
- **THEN** each ratio is at least 3:1

#### Scenario: Focus ring
- **WHEN** the contrast of the focus ring colour against the page and card backgrounds is computed
- **THEN** each ratio is at least 3:1

### Requirement: Visible keyboard focus
Every interactive element SHALL show a visible focus indicator at least 3px thick when it receives keyboard focus, and the indicator MUST NOT be removed without a replacement.

#### Scenario: Tabbing through a form
- **WHEN** a user moves through the patient registration form with the Tab key
- **THEN** each input, the select and the submit button shows the focus ring in turn

#### Scenario: Custom choices
- **WHEN** keyboard focus lands on a symptom chip or a big-choice radio card
- **THEN** the whole chip or card shows the focus ring

### Requirement: Status is never shown by colour alone
A triage level, a patient status and a form error SHALL each be shown with an icon and a word in addition to colour. The triage words are "Lanjutkan" for GREEN, "Perawat akan menghubungi" for YELLOW and "Segera ke Puskesmas" for RED.

#### Scenario: GREEN
- **WHEN** a GREEN triage badge is rendered
- **THEN** it contains an icon and the text "Lanjutkan"

#### Scenario: YELLOW
- **WHEN** a YELLOW triage badge is rendered
- **THEN** it contains an icon and the text "Perawat akan menghubungi"

#### Scenario: RED
- **WHEN** a RED triage badge is rendered
- **THEN** it contains an icon and the text "Segera ke Puskesmas"

#### Scenario: Distinct shapes
- **WHEN** the three triage badges are viewed without colour
- **THEN** each level has a different icon shape and a different word

#### Scenario: Form error
- **WHEN** a field fails validation
- **THEN** its message is shown as text with an icon beside the field and is announced to assistive technology

### Requirement: Readable text size
Body text SHALL be at least 18px with a line height of at least 1.5, and no text on any screen MUST be smaller than 16px at the default browser text size.

#### Scenario: Family screens
- **WHEN** any family screen is rendered at the default text size
- **THEN** every paragraph, label and button label is at least 18px

#### Scenario: Smallest text
- **WHEN** the type scale is inspected
- **THEN** its smallest step is at least 16px and every step has a line height of at least 1.5 for running text

#### Scenario: User enlarges text
- **WHEN** the user raises the browser's default text size
- **THEN** all text grows in proportion

### Requirement: Touch targets
Every button, link styled as a button, chip, choice card and form control SHALL be at least 48px high and 48px wide, and adjacent targets MUST be at least 8px apart.

#### Scenario: Buttons
- **WHEN** any button is rendered
- **THEN** its tappable area is at least 48px by 48px

#### Scenario: Symptom chips
- **WHEN** a row of symptom chips wraps onto several lines
- **THEN** each chip is at least 48px high and neighbouring chips are at least 8px apart in both directions

#### Scenario: Stacked actions
- **WHEN** two actions are stacked, such as "Saya setuju" and "Tidak setuju"
- **THEN** there is at least 8px between them

### Requirement: Small screens and zoom
Every screen SHALL be usable at a viewport width of 320px and at 200% zoom with no horizontal scrolling and no clipped or overlapping content.

#### Scenario: 320px wide
- **WHEN** any screen is viewed at a width of 320px
- **THEN** the page does not scroll horizontally and all text and controls are fully visible

#### Scenario: 360 by 640
- **WHEN** a family screen is viewed at 360px by 640px
- **THEN** the screen's main action is reachable without horizontal scrolling

#### Scenario: 200% zoom
- **WHEN** a screen is zoomed to 200% on a 1280px wide display
- **THEN** content reflows into one column and nothing is cut off

#### Scenario: Long words
- **WHEN** a long value such as a family link is shown
- **THEN** it wraps or scrolls inside its own box and does not widen the page

### Requirement: Nurse console scales from phone to laptop
The nurse console SHALL be fully usable on a 360px wide phone and SHALL use the extra width on a laptop for more content side by side without changing what can be done.

#### Scenario: Phone
- **WHEN** a nurse opens the patient list at 360px wide
- **THEN** patients are listed in one column with every action reachable

#### Scenario: Laptop
- **WHEN** a nurse opens the patient list at 1280px wide
- **THEN** patients are shown in more than one column and the navigation stays visible

### Requirement: Works without hover and with reduced motion
No information or action SHALL depend on hovering, and all animation and transitions MUST be removed or reduced to an instant change when the user asks for reduced motion.

#### Scenario: Touch only
- **WHEN** a screen is used on a device with no hover
- **THEN** every action and every piece of information is available by tapping or reading

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** no element animates or transitions for longer than an instant

### Requirement: One primary action and an obvious next step
Every screen SHALL show at most one primary action, and every family screen MUST state what the user should do next or what will happen next.

#### Scenario: One primary action
- **WHEN** any screen is rendered
- **THEN** at most one control uses the primary button style

#### Scenario: Consent progress
- **WHEN** the consent screen is shown
- **THEN** it shows which step of how many the user is on

#### Scenario: Family home before the check-in exists
- **WHEN** a consented family member opens their link before the daily check-in is available
- **THEN** the screen says they are registered, says the daily note will appear on this page, says nothing needs filling in today, and offers one action to phone the Puskesmas with its name and number

#### Scenario: Error with recovery
- **WHEN** a family page cannot be loaded
- **THEN** the screen says so in plain words and offers a "Coba lagi" action

#### Scenario: Empty patient list
- **WHEN** a nurse has no patients
- **THEN** the list says so and offers the action to register the first patient

### Requirement: Labelled symptom chips
Each symptom chip SHALL show an icon together with a text label, and its selected state MUST be shown by more than colour.

#### Scenario: Chip content
- **WHEN** a symptom chip is rendered
- **THEN** it shows an icon and a text label

#### Scenario: Selected chip
- **WHEN** a chip is selected
- **THEN** it shows a check mark in addition to its changed colour and is exposed as checked to assistive technology

### Requirement: Plain Bahasa copy
All user-facing copy added by the design system SHALL be in Bahasa Indonesia, held in the copy files, with sentences of at most 20 words on family screens.

#### Scenario: Sentence length
- **WHEN** the family copy is checked
- **THEN** no sentence is longer than 20 words

#### Scenario: Copy lives in copy files
- **WHEN** a screen or component shows text
- **THEN** the text comes from a copy file and is not written inside the component

### Requirement: Neutral wording on family surfaces
Family-facing copy, including the copy of the family mockups, MUST NOT contain "TB", "TBC", "tuberkulosis" or "TuntasTB", and the family area SHALL be named "Pengingat Harian".

#### Scenario: New family copy
- **WHEN** the forbidden-words test runs over all family copy, including the strings added for the home state and the mockups
- **THEN** no forbidden term is found

#### Scenario: Family name
- **WHEN** a family screen shows the application name
- **THEN** it reads "Pengingat Harian"

#### Scenario: Preview page not reachable from family pages
- **WHEN** any family screen is rendered
- **THEN** it contains no link to the design preview page or the nurse console

### Requirement: Family safety wording holds in mockups
Family copy added for the mockups MUST NOT contain the word "aman", dosing content or a diagnosis, and every mock family reply SHALL end with the Puskesmas contact.

#### Scenario: No reassurance word
- **WHEN** the family copy is checked for the whole word "aman" in any letter case
- **THEN** it is not found

#### Scenario: Contact last
- **WHEN** a mock GREEN, YELLOW or RED reply is rendered
- **THEN** its last line contains the Puskesmas name and phone number

### Requirement: Design preview page
The application SHALL provide a page at `/design` titled "Pratinjau Desain" that shows the colour tokens with their contrast ratios, the type scale and every design-system component in each of its states.

#### Scenario: Page loads
- **WHEN** `/design` is requested
- **THEN** the response has HTTP status 200 and the page is titled "Pratinjau Desain"

#### Scenario: Contrast shown
- **WHEN** the colour section is viewed
- **THEN** each declared colour pair shows its computed contrast ratio and whether it meets its threshold

#### Scenario: Component states
- **WHEN** the components section is viewed
- **THEN** each component is shown in its default, focus, disabled and error states where the state applies

#### Scenario: Not indexed
- **WHEN** the page's metadata is read
- **THEN** it asks search engines not to index it

### Requirement: Mockups of screens not yet built
The preview page SHALL show clickable mockups at phone width, using made-up data and the real design-system components, of: the daily check-in, the GREEN, YELLOW and RED family replies, the pickup countdown, the "Tanya" screen including an abstain answer, the nurse morning queue and the RED alert inbox. A mockup MUST NOT send any network request.

#### Scenario: Check-in mockup
- **WHEN** the check-in mockup is viewed
- **THEN** it shows the question "Obat hari ini sudah diminum?", the choices Sudah, Belum and Sebagian, symptom chips, and an optional note with a microphone button

#### Scenario: Send needs a dose answer
- **WHEN** no dose answer is chosen in the check-in mockup
- **THEN** the send button is disabled, and it becomes enabled once an answer is chosen

#### Scenario: Reply mockups
- **WHEN** a reply mockup is viewed for each level
- **THEN** it shows the level's icon and word, a short explanation, one action, a source label and the Puskesmas contact last

#### Scenario: Pickup mockup
- **WHEN** the pickup mockup is viewed
- **THEN** it shows the number of days until the next pickup with the due date

#### Scenario: Abstain answer
- **WHEN** the unanswerable example question is chosen in the "Tanya" mockup
- **THEN** it shows "Saya belum bisa menjawab ini, tanyakan ke perawat" followed by the Puskesmas contact

#### Scenario: Queue mockup
- **WHEN** the nurse queue mockup is viewed
- **THEN** each entry shows a patient code, treatment day, score, triage level, a one-line reason and one suggested action, ordered from highest score to lowest

#### Scenario: Alert mockup
- **WHEN** the acknowledge button of an alert in the inbox mockup is pressed
- **THEN** that alert is shown as acknowledged and the count of unacknowledged alerts drops by one

#### Scenario: No network
- **WHEN** any control in a mockup is used
- **THEN** no network request is made and nothing is stored
