# Product

<!-- impeccable:product-schema 1 -->

> Written without an interview: the session that created this file was non-interactive.
> Everything below is taken from `docs/build-plan.md`, `openspec/config.yaml` and the product
> owner's design brief (11 Oct 2026). Lines marked *(inferred)* were not stated outright and
> should be confirmed.

## Platform

web

## Users

- **Family PMO (primary).** A relative who watches a patient take daily medicine. Often an older
  family member, sometimes with little schooling. Opens a private link on a low-end Android phone
  (360×640), frequently outdoors in bright sun, for about twenty seconds a day.
- **Patient.** Uses the same family link.
- **Puskesmas nurse (customer).** The only person who acts clinically. Works through a morning
  list of patients, on a phone while moving around the clinic and on a laptop at a desk.
- **Community companion.** Uses the nurse view.

## Product Purpose

Side-effect triage and dropout early warning for adults on first-line treatment in Jakarta. The
family reports each day whether the medicine was taken and how the patient feels; fixed rules turn
that into a level (GREEN, YELLOW, RED); the nurse sees who to contact first and why. Success: a
family member can finish the daily report without help, and no red flag goes unseen.

## Positioning

Rules decide the level, never the language model. The system can only make escalation more likely,
never less. It supports the nurse and the family; it does not replace them.

## Operating Context

- Family area is reached only through a one-time link handed over by the nurse. It is named
  "Pengingat Harian" and never names the illness: a bystander looking at the screen, the tab title,
  the home-screen icon or a notification must learn nothing.
- Nurse console sits behind a login and may use the product name.
- Everything runs in Docker Compose; the PWA must work on a slow connection.

## Capabilities and Constraints

- Built today: nurse login, patient registration, family link (issue, rotate, revoke), consent.
- Planned, not built: daily check-in (S02), family reply, pickup countdown, guideline Q&A, nurse
  morning queue and RED alert inbox.
- Never output "aman", never dosing advice, never a diagnosis. Every family message ends with the
  Puskesmas contact.
- No patient names anywhere; patient code only.
- User-facing copy in plain Bahasa Indonesia at a primary-school reading level.
- No runtime CDN, no paid external services.

## Brand Commitments

- Family-facing name: "Pengingat Harian". Nurse-facing name: "TuntasTB".
- Existing icon: a white calendar with a tick on teal (`web/public/icon.svg`). *(inferred: teal is
  the incumbent brand colour and is kept.)*

## Evidence on Hand

- `docs/build-plan.md`, the OpenSpec changes under `openspec/changes/`, the demo nurse account.
- No user research, testimonials or usage data exist. Do not invent any.

## Product Principles

1. The next step is always obvious: one main action per screen, and a waiting state says what is
   coming and what to do meanwhile.
2. Readable by anyone, anywhere: large type, strong contrast, big touch targets, works in sunlight.
3. Meaning never rests on colour alone: a level is always an icon and a word.
4. Discreet by default: nothing on a family screen names the illness.
5. The nurse stays in charge: the interface explains its reasons and suggests, it does not decide.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor (body text aims for 7:1). Body text at least 18px, touch targets at least
48×48px, usable at 320px width and 200% zoom, no hover-only interaction, reduced motion respected.
Voice input is planned for the daily note for users who do not type easily.
