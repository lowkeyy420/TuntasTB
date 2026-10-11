# Tasks

## 1. Foundations: tokens, theme, typeface

- [x] 1.1 Write `PRODUCT.md` and `DESIGN.md` at the repo root (users, principles, palette, type, components); verify `impeccable context` loads both without a missing-file notice
- [x] 1.2 Add `web/src/design/contrast.ts` (WCAG relative luminance and ratio) with unit tests for black on white (21:1), equal colours (1:1) and a known mid pair; verify the tests pass
- [x] 1.3 Add `web/src/design/tokens.ts` with the colour values and the declared pairs (foreground, background, role, minimum ratio)
- [x] 1.4 Rewrite `web/src/app/globals.css`: remove the dark-scheme block, declare tokens in `@theme` (colours, type scale, radii, shadows), base styles, focus ring, reduced-motion rule, `color-scheme: light`
- [x] 1.5 Add `web/src/design/tokens.test.ts`: CSS and TypeScript colour values match, every declared pair meets its threshold, no `prefers-color-scheme` rule, smallest type step is at least 16px and body is at least 18px; verify it passes and fails when a pair is deliberately weakened
- [x] 1.6 Load the typeface through `next/font` in `web/src/app/layout.tsx`, add the theme colour and light colour scheme to the viewport, update `manifest.ts` colours; verify `npm run typecheck` passes and the manifest test still passes
- [x] 1.7 Add `lucide-react` to `web/package.json` and the lockfile; verify `npm ci --ignore-scripts` style install succeeds and an icon imports under typecheck

## 2. Components

- [x] 2.1 Build `Button` and `ButtonLink` (primary, secondary, danger, quiet; two sizes; loading and disabled) with a test that each renders at the 48px-minimum size classes and a disabled button is not clickable; verify the test passes
- [x] 2.2 Build `Field`, `TextInput`, `TextArea` and `Select` with a test that label, hint and error are wired to the control and the error is announced; verify the test passes
- [x] 2.3 Build `ToggleChip` and `RadioCardGroup` on native inputs with a test that they are reachable by role and name and report checked state; verify the test passes
- [x] 2.4 Build `TriageBadge` and `StatusPill` with a test that each triage level renders an icon and its exact word; verify the test passes
- [x] 2.5 Build `Alert`, `Card`, `EmptyState`, `PageHeader`, `StepIndicator`, `BottomActionBar` and `DateTile`; verify they render in a component test without errors and export from `components/ui/index.ts`

## 3. Copy

- [x] 3.1 Add the family strings for the home state, triage words, check-in, replies, pickup and "Tanya" to `family.id.ts`, and the nurse shell, queue, alert and preview strings to `nurse.id.ts` and `design.id.ts`
- [x] 3.2 Extend `family-wording.test.ts` to walk function-valued copy, and add tests that family copy never contains the word "aman", that no family sentence exceeds 20 words and that each mock reply ends with the Puskesmas contact; verify the tests pass

## 4. Restyle existing screens

- [x] 4.1 Restyle the landing page `/` and `/login` with the components; verify the login test suite still passes and the pages render at 320px without horizontal scroll
- [x] 4.2 Add the nurse shell (`/nurse/layout.tsx`: header, navigation, sign out) and restyle `/nurse`; verify sign out calls `POST /api/auth/logout` and returns to `/login`
- [x] 4.3 Restyle `PatientForm`, `PatientList` and `LinkModal` (status pills with icons, empty state with action, multi-column list from `lg`); verify `PatientForm.test.tsx` passes unchanged
- [x] 4.4 Restyle the family shell, consent (with step indicator), declined, invalid-link, loading and error states; verify `FamilyGate.test.tsx` passes unchanged
- [x] 4.5 Replace the family home placeholder with the "what happens next" state and the "Telepon Puskesmas" action; add a component test for the scenario "Family home before the check-in exists" and verify it passes

## 5. Design preview

- [x] 5.1 Build `/design` with the colour-pair, type-scale and component-state sections, titled "Pratinjau Desain" and `noindex`; verify the page builds and a test asserts its metadata
- [x] 5.2 Build the family mockups (check-in, GREEN/YELLOW/RED reply, pickup countdown, "Tanya" with abstain) in a phone frame; add component tests for the check-in send-button rule and the abstain answer; verify they pass
- [x] 5.3 Build the nurse mockups (morning queue, RED alert inbox with acknowledge); add a component test that acknowledging lowers the unacknowledged count and that no mockup calls `fetch`; verify it passes
- [x] 5.4 Link the preview from the nurse console only; verify no family screen links to `/design` or `/nurse` (component test)

## 6. Integration checks

- [x] 6.1 Run `npm run lint`, `npm run typecheck` and `npm test` in `web/`; verify all three exit 0
- [x] 6.2 Run the impeccable detector over `web/src`, fix the findings that matter and record what remains
- [x] 6.3 Run `docker compose up -d --build web`; verify `/`, `/login` and `/design` return HTTP 200
- [x] 6.4 Check by hand at 320px, 360×640 and 200% zoom that the restyled screens and the preview have no horizontal scroll and that keyboard focus is visible on every control
