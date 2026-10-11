# Proposal

## Why

The screens built so far are close to unreadable and leave people stranded. `globals.css` still carries the framework's starter dark mode, so on a phone set to dark the page turns near-black while every component was styled for a light page (grey text, faint borders). The family home says "Bagaimana kabar hari ini?" and then offers nothing to tap, because the check-in (S02) is not built yet. The plan's "Fairness and access" commitment (low-end Android, large text, voice input, plain Bahasa at a primary-school reading level) has no enforceable form, and S02, S06, S07, S08 and S09 are about to add screens on top of this.

## What Changes

- Remove the accidental dark mode. Ship one light, high-contrast theme and declare the page light-only.
- Introduce design tokens (colour with declared text-on-background pairs, type scale, spacing, radii, shadows, focus ring) as the single source for every screen.
- Introduce a locally served typeface chosen for legibility, replacing the starter fonts.
- Introduce a set of reusable accessible components: button, card, form field, text input, text area, symptom chip, big-choice radio cards, alert, triage badge, status pill, empty state, page header, step indicator, bottom action bar, date tile.
- Restyle every existing screen with them: landing, nurse login, nurse console home, patient list, patient registration, one-time family link dialog, family consent, declined, invalid link, loading and error states, family home.
- Replace the family home dead end with a "what happens next" state that names what is coming and gives one thing to do now.
- Add a nurse console shell (header, navigation, sign out) that works on a phone and widens on a laptop.
- Add a design preview page at `/design` ("Pratinjau Desain") showing tokens with contrast ratios, the type scale, every component in every state, and clickable phone-width mockups with made-up data of the screens not built yet: daily check-in, the three family replies, pickup countdown, "Tanya" with an abstain answer, nurse morning queue, RED alert inbox.
- Add an automated contrast test over the declared colour pairs, and extend the family forbidden-words test to all new family copy.

Behaviour, routes, API contracts and existing copy keys do not change.

## Capabilities

### New Capabilities

- `design-system`: the visual and interaction contract every screen must meet: contrast, text size, touch targets, small-screen and zoom behaviour, motion, colour-independent status, plain copy with an obvious next step, and the preview page used to review screens before they are built.

### Modified Capabilities

None.

## Plan reference

This change implements no single plan spec. It delivers the "Fairness and access" row of the risk table in `docs/build-plan.md`, restyles the screens delivered by S01 (patient onboarding), and supplies the components and reviewed mockups that S02 (daily check-in), S06 (family reply), S07 (nurse queue and alerts), S08 (guideline Q&A) and S09 (pickup planner) will build on.

## Out of Scope

- A designed dark mode. Only the light theme ships; dark may follow as its own change.
- Building S02, S06, S07, S08 or S09. Their screens appear only as static mockups with made-up data; no check-in is stored, no flow is called, no alert is raised.
- Real speech recognition. The microphone button in the mockup is a visual stand-in.
- Offline support, service worker, install prompts.
- Any change to triage rules, risk scoring, API routes, database schema, authentication or audit logging.
- Languages other than Bahasa Indonesia; right-to-left layout.
- Illustrations, photography, a logo redesign or marketing pages.
- Changes under `rules/`, `langflow/`, `corpus/`, `eval/`.

## Impact

- Depends on `add-project-foundation` and `add-patient-onboarding` (the screens being restyled).
- Changed: `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/app/manifest.ts`, `web/src/app/page.tsx`, `web/src/app/login/page.tsx`, `web/src/app/nurse/**`, `web/src/app/f/[token]/**`, `web/src/copy/family.id.ts`, `web/src/copy/nurse.id.ts`, `web/src/copy/family-wording.test.ts`.
- New: `web/src/components/ui/`, `web/src/design/` (tokens, contrast maths and their test), `web/src/app/design/`, `web/src/app/nurse/layout.tsx`, `web/src/copy/design.id.ts`, root `PRODUCT.md` and `DESIGN.md`.
- New dependency: `lucide-react` (icons, bundled at build time). No new service, no runtime CDN; the typeface is downloaded at build time and served from the app's own origin.
- `add-daily-checkin`, `add-family-reply`, `add-pickup-planner`, `add-guideline-qa` and `add-nurse-queue-alerts` should build their screens from these components and from the mockups once the product owner has reviewed them.
