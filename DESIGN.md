---
name: TuntasTB / Pengingat Harian
description: One light, high-contrast system for a family daily reminder and a nurse console, readable on a low-end phone in sunlight.
colors:
  canvas: "#f3f6f5"
  surface: "#ffffff"
  sunken: "#e8eeec"
  ink: "#0f1f1d"
  ink-muted: "#3b4b48"
  line: "#c9d3d0"
  line-strong: "#5f706c"
  primary: "#0b5a54"
  primary-strong: "#084540"
  primary-soft: "#d9efeb"
  on-primary-soft: "#083f3a"
  on-solid: "#ffffff"
  focus: "#1a4fd6"
  scrim: "#0f1f1d"
  triage-green-bg: "#dff3e4"
  triage-green-ink: "#0d4a24"
  triage-green-solid: "#17703a"
  triage-yellow-bg: "#fcefc0"
  triage-yellow-ink: "#553800"
  triage-yellow-solid: "#8a5a00"
  triage-red-bg: "#fde3df"
  triage-red-ink: "#7a1512"
  triage-red-solid: "#b3261e"
  triage-red-strong: "#8f1d17"
  info-bg: "#dfeafb"
  info-ink: "#12366e"
typography:
  body:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  control:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.5
  title:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.2
  numeral:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1
rounded:
  control: "0.75rem"
  card: "1rem"
  pill: "9999px"
spacing:
  touch-gap: "12px"
  page-x: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-solid}"
    rounded: "{rounded.control}"
    height: "56px"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    height: "56px"
  button-disabled:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-muted}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "56px"
    padding: "12px 16px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "48px"
  chip-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.on-primary-soft}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  app-bar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-solid}"
    height: "56px"
---

# DESIGN

The normative values live in `web/src/app/globals.css` (`@theme`) and are mirrored in
`web/src/design/tokens.ts`. `web/src/design/tokens.test.ts` fails when the two drift or when a
declared colour pair drops below its contrast threshold. See every token, component state and
mockup rendered at `/design`.

## Overview

The system borrows from the tear-off wall calendar found in every Indonesian household: a white
sheet, heavy black numerals, one day at a time. The family area is called "Pengingat Harian" and
its icon is a calendar with a tick, so the reference is already the product's own. The calendar
lends four things only: large numeral-first type, a paper-and-ink palette with a teal binding
strip, one job per sheet on family screens, and one signature element, the **date tile**. Layout,
navigation and controls are ordinary web controls.

The use scene decides everything else: an older family member on a 360×640 low-end Android phone,
outdoors, for twenty seconds a day; a nurse walking between rooms with a phone, or at a desk.

## Colors

- **One light theme.** No dark variant exists; the page declares `color-scheme: light`.
- **Paper and ink.** `ink` on `surface`/`canvas` is above 15:1. `ink-muted` is still above 7:1, so
  "secondary" text is never faint.
- **Teal is the binding strip and the one primary action.** It appears on the app bar, the primary
  button, the current selection and links. Nowhere as decoration.
- **Triage colours mean triage.** Each level has `-bg` (tint), `-ink` (text on that tint), `-solid`
  (carries white text; also the border). Yellow's solid is a dark amber, because bright yellow
  cannot hold readable text in sunlight. Red is never used for emphasis or for calendar "red days".
- **Borders that matter are `line-strong`** (≥ 3:1). `line` is for dividers that carry no meaning.
- Tailwind's default palette is switched off (`--color-*: initial`): an untokened colour class does
  nothing.

Thresholds enforced by test: body text 7:1, other text 4.5:1, control borders, meaningful icons
and the focus ring 3:1.

## Typography

One family, **Atkinson Hyperlegible Next**, self-hosted through `next/font`. Weights 400, 500,
600, 700.

| Token | Size | Use |
|---|---|---|
| `text-5xl` | 56px | Day number on the date tile |
| `text-4xl` | 44px | Preview page title |
| `text-3xl` | 34px | Family page title |
| `text-2xl` | 28px | Page and section titles |
| `text-xl` | 24px | Question, card headline |
| `text-lg` | 20px | Buttons, inputs, family body |
| `text-base` | 18px | Body, hints, chips |
| `text-sm`, `text-xs` | 16px | Small labels in the nurse console only |

Nothing is smaller than 16px; family screens use nothing below 18px. Sizes are in `rem`. Line
height is 1.5 or more for running text. Prose is capped near 65 characters.

## Layout

- Mobile first. Family screens are one column, max 28rem, 16px side padding.
- The main action of a family screen sits in a bottom action bar that sticks to the bottom edge.
- The nurse console is one column on a phone and widens to 72rem; lists become 2 or 3 columns from
  `lg`. Navigation is one row under the app bar at every width.
- Works at 320px and at 200% zoom: no fixed widths, long values wrap, the three-way choice stacks
  below 21rem.
- Touch targets are at least 48×48px (primary controls 56px) with at least 12px between them.

## Elevation & Depth

Flat by default. `shadow-card` separates a white sheet from the page; `shadow-raised` is for the
dialog and phone frames; `shadow-bar` lifts the bottom action bar. Every shadow has an offset and
a blur. Meaning is never carried by shadow.

## Shapes

Controls 12px radius, cards 16px, chips and pills fully round. Control borders are 2px. Selected
and disabled states change shape as well as colour: selected gains a tick or a filled dot and a
thicker edge; disabled gets a dashed edge.

## Components

All in `web/src/components/ui/`, exported from `index.ts`.

- **Button / ButtonLink**: `primary` (once per screen), `secondary`, `danger`, `quiet`; sizes `lg`
  (56px) and `md` (48px); `loading`, `disabled`, optional leading icon.
- **TextInput / TextArea / Select / Field**: label above, hint above the control, error below with
  an icon and `role="alert"`; ids and ARIA wired automatically.
- **ToggleChip / ChipGroup / Chip**: symptom chips are real checkboxes with an icon and a word.
- **RadioCardGroup**: the big "Sudah / Belum / Sebagian" choice, real radios under large tiles.
- **Alert**: info, success, warning, danger, each with its own icon shape.
- **TriageBadge**: GREEN circle-check "Lanjutkan", YELLOW triangle "Perawat akan menghubungi", RED
  octagon "Segera ke Puskesmas". `banner` size heads a family reply; `solid` is for RED.
- **StatusPill**: small icon-and-word state label for the nurse console.
- **DateTile**: the calendar sheet. Heads the family home, the nurse home and the queue.
- **AppBar, PageHeader, StepIndicator, BottomActionBar, Card, EmptyState**.

Focus is one ring everywhere: 3px `focus` blue, 2px offset. Chips and choice tiles draw it on the
whole label.

## Do's and Don'ts

- Do give every screen one primary action and say what happens next.
- Do pair every status with an icon and a word.
- Do put new copy in `web/src/copy/*.id.ts`; family sentences stay at 20 words or fewer.
- Don't use opacity to show disabled or secondary: it fails in sunlight.
- Don't add a colour, size or radius outside the tokens.
- Don't use red or the triage tints for decoration.
- Don't name the illness, or use the word "aman", on anything a family member can see.
- Don't rely on hover; don't animate anything that carries meaning.
