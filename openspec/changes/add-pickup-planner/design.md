# Design

## Context

The `pickups` table (`patient_id`, `due_date`, `done_at`) exists since the foundation, and `buildRiskSnapshot` already reads "an open pickup whose due date has passed" as `missedPickup`. Until now no row is ever written, so the factor is always false. This change writes the rows and shows them. Requirements are in `specs/pickup-planner/spec.md`. The plan is explicit that this is date math in the application, not a flow.

## Goals / Non-Goals

**Goals:**

- All date logic in pure functions that take `today` as an argument.
- One open pickup per patient at any time, enforced by the database.
- A nurse action that takes one tap for the common case.

**Non-Goals:**

- Reminders that reach a family who does not open the app.
- Modelling partial supplies or pill counts.

## Decisions

### Pure functions (`web/src/lib/pickups/dates.ts`)

```ts
firstDueDate(startDate, intervalDays, today): Date      // start + k*interval, smallest k>=1 with result >= today
nextDueDate(doneOn, intervalDays): Date                 // doneOn + interval
daysUntil(dueDate, today): number                       // calendar days, negative when overdue
pickupState(dueDate, doneAt, today):
  "upcoming" | "nudge" | "due_today" | "missed" | "done"
```

`pickupState`: `done` when `doneAt` is set; `missed` when `daysUntil < 0`; `due_today` when 0; `nudge` when 1 or 2; otherwise `upcoming`. The family banner is shown for `nudge` and `due_today` (the spec's "2 days or fewer"), the overdue banner for `missed`. All dates are Jakarta calendar dates from `time.ts`; `due_date` is a SQL `date`, so there is no time-of-day component to get wrong.

### Why the next due date counts from the day it was done

The plan says "countdown from pickup interval" and describes the countdown as "pills left vs next pickup date". A pickup hands over an interval's worth of medicine, so supply lasts until `done + interval` whether the patient came early or late. Counting from the old due date would tell a late patient to return before their new supply runs low, and would tell an early patient their supply lasts longer than it does. Alternative considered: fixed weekday clinic schedule. Rejected: not in the plan, and the nurse can correct a due date by hand.

### One open pickup

A partial unique index `ON pickups (patient_id) WHERE done_at IS NULL`. Marking done runs in one transaction:

```sql
UPDATE pickups SET done_at = $doneAt WHERE id = $id AND done_at IS NULL;   -- 0 rows → already done, stop
INSERT INTO pickups (patient_id, due_date) VALUES ($patient, $doneOn + interval);
```

A double submission updates zero rows the second time and inserts nothing, which satisfies "exactly one new open pickup".

### Registration hook

`POST /api/nurse/patients` (from `add-patient-onboarding`) gains one insert in its existing transaction: the first pickup at `firstDueDate(start_date, interval, today)`. A one-off script creates first pickups for patients registered before this change (the seeded demo patients).

### Routes

| Route | Purpose |
| --- | --- |
| `GET /api/family/pickup` | Bearer family token; returns `{ dueDate, daysUntil, state, contact }` |
| `POST /api/nurse/patients/[id]/pickups/[pickupId]/done` | Body `{ doneOn? }`, default today, not in the future |
| `PATCH /api/nurse/patients/[id]/pickups/[pickupId]` | Body `{ dueDate }`, open pickups only |
| `GET /api/nurse/patients` | Extended with `nextPickupDue`, `pickupState`, `daysOverdue` |

### Risk integration

No change to the risk engine. `buildRiskSnapshot` already sets `missedPickup` from `due_date < asOf AND done_at IS NULL`; this change adds the integration tests that prove the +4 appears and disappears, and makes that query share `pickupState` so there is one definition of "missed".

### Family banner copy (draft, in `family.id.ts`)

| State | Text |
| --- | --- |
| upcoming | Ambil obat {n} hari lagi ({tanggal}) |
| nudge (2) | Ambil obat 2 hari lagi. Siapkan waktu ke Puskesmas. |
| nudge (1) | Besok jadwal ambil obat di Puskesmas. |
| due_today | Hari ini jadwal ambil obat di Puskesmas. |
| missed | Jadwal ambil obat sudah lewat {n} hari. Segera hubungi atau datang ke Puskesmas: {telepon} |

The pickup card is cached with the family session, so the countdown also renders offline from the last known due date, recomputed against the device date.

### Nurse console

A "Ambil obat" column in the patient list with a state badge and a "Sudah diambil" button (one tap, today's date), plus a small menu for "tanggal lain" and "ubah jadwal". If `add-nurse-queue-alerts` is applied, the queue's suggested action "ambil obat lebih awal" links to the same panel.

## Cross-cutting

- **Redaction**: no free text is collected or sent anywhere in this change, and no LLM is called.
- **Audit logging**: `pickup.read` (family and nurse), `pickup.done`, `pickup.reschedule`, each with the pickup id as target and, for writes, in the same transaction.
- **Neutral wording**: banners say "obat" and "Puskesmas" only; no illness or drug names. All strings are under the forbidden-terms test. There are no system notifications, only in-app banners.
- **Bahasa copy**: short sentences with the date written out ("Senin, 10 Maret"); the overdue banner asks the family to contact the Puskesmas and deliberately says nothing about what to do with remaining or missing pills.

## Risks / Trade-offs

- [A nurse forgets to mark pickups done, so every patient looks overdue and gains 4 points] → One-tap button in the list, backdating allowed, and the queue reason says "Jadwal ambil obat terlewat" so a false flag is recognisable and fixed in one tap.
- [In-app banners do not reach a family that has stopped opening the app] → That family is already surfaced by the `no_checkin` and `missed_pickup` factors; out-of-app reminders are phase 2.
- [Device clock is wrong, so the offline countdown is off] → Online values come from the server; the offline card is labelled with the due date itself, not only the day count.
- [First due date for patients registered mid-treatment is a guess] → The nurse can correct it at registration time with "ubah jadwal".

## Open Questions

- Does the pilot Puskesmas hand out exactly one interval of medicine per pickup? If not, the nurse corrects the due date manually; no design change.
