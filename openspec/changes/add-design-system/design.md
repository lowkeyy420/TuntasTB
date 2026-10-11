# Design

## Context

See `proposal.md` for the motivation. What shapes the approach:

- `web/` is Next.js 15 (App Router) with Tailwind v4, configured in CSS (`@theme`), no `tailwind.config`.
- `globals.css` is still the starter file: a `prefers-color-scheme: dark` block flips the page to near-black, and `body` falls back to Arial because the Geist variables are declared but never applied.
- Screens style themselves with ad-hoc utility strings (`text-black/60`, `border-black/10`, `text-sm`), so contrast and size vary screen by screen and nothing is reusable.
- Existing component tests (`FamilyGate.test.tsx`, `PatientForm.test.tsx`) query by role, label text and copy strings, and one asserts the exact order of form control `name` attributes. They must keep passing untouched.
- The real users: an older family member on a 360×640 low-end Android phone, often outdoors, sometimes barely literate; a nurse on a phone or a laptop.
- `/nurse/*` is behind the session middleware. The family area is reached only by token link and must stay neutral.

## Goals / Non-Goals

**Goals:**

- One place to change a colour, size or radius, and a test that fails when a colour pair stops being readable.
- Components that make the accessible choice the default one (size, focus, label wiring, icon plus word).
- Mockups assembled from those same components, so S02 and later lift them rather than redraw them.
- No behaviour change: same routes, same requests, same copy keys.

**Non-Goals:**

- Dark theme, theming API, runtime theme switching.
- A general-purpose component library: only what the current and next screens need.
- Visual regression tooling or a browser-based accessibility test runner.

## Decisions

### D1. Direction: the daily calendar sheet

The family area is called "Pengingat Harian" and its icon is already a calendar with a tick. The system takes its character from the tear-off wall calendar every Indonesian household has: a white sheet, heavy black numerals, one day at a time. It lends four things only: type (large, heavy, numerals first), palette (paper white, ink black, the existing teal as the binding strip), density (one thing per sheet on family screens) and one signature element, the **date tile** (day name, large day number, month) that heads the family home and the nurse queue and answers "which day is this, and what is today's one job". Layout, navigation and controls stay standard web controls.

Calendar red is deliberately not used for Sundays or decoration: red means RED triage and nothing else.

Alternatives considered: the Posyandu growth card (its green/yellow/red bands are familiar, but it would spend the triage colours on decoration); Puskesmas counter signage (reads as officialdom, and green as a brand colour collides with GREEN triage); a generic "healthcare app" cyan-and-green palette suggested by the ui-ux-pro-max database (cyan `#0891B2` under white text is only about 3.7:1, and a green call-to-action collides with GREEN triage).

### D2. Colour: tokens in CSS, mirrored in TypeScript, checked by a test

Tokens are declared once in `globals.css` inside Tailwind v4 `@theme` (`--color-ink`, `--color-primary`, `--color-triage-red-bg`, …), which generates the utilities (`text-ink`, `bg-primary`). The same values are listed in `web/src/design/tokens.ts` together with the **declared pairs** (foreground token, background token, role, minimum ratio). A Vitest test:

1. parses `globals.css` and asserts every `--color-*` value equals the one in `tokens.ts` and vice versa (no drift),
2. computes the WCAG contrast ratio of every declared pair and fails below its threshold (7:1 body, 4.5:1 text, 3:1 non-text),
3. asserts the stylesheet has no `prefers-color-scheme` rule and declares `color-scheme: light`.

The preview page renders from the same `tokens.ts`, so the ratios the product owner sees are the ones the test enforces.

Palette: ink near-black tinted toward teal on a white card over a very light tinted page; the incumbent teal darkened until white text on it passes 7:1; each triage level gets a tinted background, a dark text colour for that background, a solid colour that carries white text, and a border. Yellow's solid is a dark amber-brown rather than a bright yellow, because bright yellow cannot carry readable text or a 3:1 edge in sunlight.

Alternatives considered: values only in CSS with the test parsing pairs out of comments (fragile); values only in TypeScript injected as inline style (loses Tailwind utilities); OKLCH tokens (older Android WebViews on low-end phones do not all support it, hex always works).

### D3. Type: Atkinson Hyperlegible Next, self-hosted, on a raised scale

One family for everything. Atkinson Hyperlegible was drawn by the Braille Institute for low-vision readers: unambiguous letterforms (I, l, 1; O, 0), open counters, which is what an older reader in glare needs. The "Next" version adds the weights 500 and 600 that the original lacks. It covers Bahasa Indonesia fully. It is loaded through `next/font/google`, which downloads the files at build time and serves them from the app's own origin: no request to a font CDN at runtime. `display: swap` with a system fallback keeps text visible on a slow connection.

Tailwind's text steps are redefined so the accessible size is the easy one: `text-xs` and `text-sm` are 16px (nothing can go smaller), `text-base` is 18px, then 20, 24, 28, 34. Sizes are in `rem`, so a user's larger default text size is respected. Line height is 1.5 or more for running text. Fixed steps, no fluid scaling.

Alternatives considered: `next/font/local` with font files committed to the repo (works offline at build time, but adds binaries to a repo whose build already needs the network for npm; revisit if builds must run air-gapped); Noto Sans (wide coverage, less distinctive letterforms); the system font (free, but glyph quality varies widely across low-end Android builds).

### D4. Components: plain React over native controls

Components live in `web/src/components/ui/`, one file each, exported from an `index.ts`. Rules:

- Native elements first. Symptom chips are real checkboxes and the big choice is a real radio group, styled through `:has()`/`peer` selectors, so they work with keyboard, screen readers and forms without custom key handling.
- Server-renderable unless they hold state; no component fetches data.
- Sizes are baked in: controls are at least 48px high, the main family button 56px.
- `Field` wires the label, hint and error to its control (`htmlFor`, `aria-describedby`, `aria-invalid`) and renders errors with an icon and `role="alert"`.
- `TriageBadge` and `StatusPill` take a level or tone and always render icon plus word; the three triage icons differ in outline (circle, triangle, octagon).
- Variants through a small `cx` helper, no class-variance library.
- Icons from `lucide-react` (tree-shaken, one stroke weight), always `aria-hidden` beside a text label.

Alternatives considered: a headless library such as Radix (more than these few controls need, and another dependency on a low-end device); custom `div`-based chips with ARIA (more code, easier to get wrong).

### D5. Layouts

- **Family shell** (`/f/[token]/layout.tsx`): a teal header strip with the calendar mark and "Pengingat Harian", content in one column capped at 28rem, the screen's main action in a bottom action bar that sticks to the bottom edge for thumb reach and respects the safe-area inset.
- **Nurse shell** (new `/nurse/layout.tsx`): header with product name, navigation (Beranda, Pasien, Pratinjau Desain) and sign out. One column on a phone; from `lg` the content area widens to 72rem and lists become multi-column grids. Sign out calls the existing `POST /api/auth/logout`.
- **Dialog**: the one-time link dialog keeps its behaviour (bottom sheet on phone, centred on larger screens) and gains a focus-visible ring and token colours.

### D6. Family home as a "what happens next" state

Until S02 lands, the home shows: the date tile and treatment day; a confirmation that registration is done; a short numbered list (keep this page, the daily note will appear here, nothing to fill in today); and one primary action, a `tel:` link "Telepon Puskesmas" with the name and number from the session. `copy.home.todayPrompt` stays on screen as the section heading because existing tests look for it; it is now followed by an explanation instead of nothing. When S02 is built, the list is replaced by the check-in form and the rest stays.

### D7. Preview page and mockups

`/design` sits outside `/nurse/*` so it can be opened without a session (it contains only made-up data and must return 200 to an unauthenticated request); it is linked only from the nurse console and marked `noindex`. Sections: colour pairs with ratios, type scale, components in each state, mockups.

Forced states (focus, disabled, error) are shown by rendering the real component with the real prop or attribute (`disabled`, `error="…"`); the focus state is shown through a `data-focus-preview` attribute that the focus-ring CSS also matches, so the picture cannot drift from the real ring. Hover is shown the same way for completeness but carries no information.

Mockups are client components in `web/src/app/design/mockups/`, each rendered inside a 360px-wide phone frame, built only from `components/ui` and local `useState`. They import no fetch helper. Family mockup strings live in `family.id.ts` (so the forbidden-words test covers them and S02 can use them as they are); nurse mockup strings live in `nurse.id.ts`; made-up data lives beside the mockups.

### D8. Motion

Transitions are limited to colour and shadow changes of 150ms on controls. A global `prefers-reduced-motion: reduce` rule sets transition and animation durations to effectively zero; nothing in the system uses motion to convey state, so removing it loses no information.

## Cross-cutting

- **Redaction.** No free text is collected or sent by this change. The note field and question box in the mockups keep their text in component state only and send nothing. The existing reminder not to write a name or address stays visible next to the mock note field.
- **Audit logging.** No new reads or writes of patient data, so no new audit events. Existing audited calls (`family.open`, consent, patient list, token rotation and revocation, logout) are made exactly as before; the sign-out control added to the nurse shell uses the already audited logout route.
- **Neutral wording.** All family strings, including the mockup strings, are in `family.id.ts` and covered by the forbidden-words test, which is extended to walk function-valued copy too. The family header, tab title, manifest and theme colour reveal nothing. The preview page is titled "Pratinjau Desain", does not name the illness in its family mockups, and is not linked from any family screen. Tests also assert the family copy never contains the word "aman".
- **Bahasa copy.** Every new string is plain Bahasa Indonesia in `web/src/copy/*.id.ts`; family sentences are capped at 20 words by a test. Components contain no literal user-facing text.

## Risks / Trade-offs

- [The typeface is fetched from Google at build time] → Build needs network access, as it already does for npm; nothing is fetched at runtime. Falls back to system fonts if the font files fail to load.
- [Automated checks cannot prove size, spacing or reflow on a real phone] → The contrast, wording and component tests cover what is computable; touch size, 320px and 200% zoom are checked by hand on the preview page and listed as explicit tasks.
- [Redefining `text-sm` to 16px surprises a future contributor] → Documented in `globals.css` and `DESIGN.md`; the token test pins the minimum.
- [`:has()` for chip styling is missing on very old Android WebViews] → The checkbox stays a real, working checkbox there; only the tinted selected style is lost, and the check icon is driven by the `peer` selector, which is supported everywhere.
- [Mockups set expectations the real S02 to S09 screens must then meet] → Intended: they are the review artefact. Each is labelled as a mockup with made-up data.
- [`/design` is reachable without login] → It holds no real data and is `noindex`; it can be moved behind the nurse session after review.

## Migration Plan

Pure front-end change. Deploy by rebuilding the `web` image. Roll back by reverting the change; no data or schema is touched.
