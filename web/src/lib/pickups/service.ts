import { and, asc, desc, eq, isNull, notExists, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { patients, pickups, puskesmas } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { scopedPatientWhere } from "@/lib/auth/requireNurse";
import type { FamilyPatient } from "@/lib/family-token";
import { addDays } from "@/lib/risk/dates";
import { todayJakarta } from "@/lib/time";
import { daysOverdue, daysUntil, firstDueDate, nextDueDate, pickupState, type PickupState } from "./dates";

/**
 * Pickup storage and the nurse and family operations on it (pickup-planner).
 * Nurse functions scope by the session's Puskesmas, never by request input;
 * writes share a transaction with their audit entry.
 */

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

export type PickupRow = typeof pickups.$inferSelect;

const actorOf = (s: NurseSession) => `nurse:${s.nurseId}` as const;

/** A pickup as the nurse console shows it. */
export interface PickupInfo {
  pickupId: string;
  dueDate: string;
  state: PickupState;
  /** Days until the due date; negative when overdue. */
  daysUntil: number;
  daysOverdue: number;
}

export function toPickupInfo(row: Pick<PickupRow, "id" | "dueDate" | "doneAt">, today: string): PickupInfo {
  return {
    pickupId: row.id,
    dueDate: row.dueDate,
    state: pickupState(row.dueDate, row.doneAt !== null, today),
    daysUntil: daysUntil(row.dueDate, today),
    daysOverdue: daysOverdue(row.dueDate, today),
  };
}

/**
 * The first pickup of a patient, due per `firstDueDate`. Called inside the
 * registration transaction. Does nothing when an open pickup already exists.
 */
export async function createFirstPickup(
  tx: Pick<Database, "insert">,
  patient: { id: string; startDate: string; pickupIntervalDays: number },
  today: string,
): Promise<void> {
  await tx
    .insert(pickups)
    .values({
      patientId: patient.id,
      dueDate: firstDueDate(patient.startDate, patient.pickupIntervalDays, today),
    })
    .onConflictDoNothing();
}

/** The open pickup of one patient, or null. */
export async function openPickupFor(
  db: Pick<Database, "select">,
  patientId: string,
  today: string,
): Promise<PickupInfo | null> {
  const [open] = await db
    .select()
    .from(pickups)
    .where(and(eq(pickups.patientId, patientId), isNull(pickups.doneAt)))
    .limit(1);
  return open ? toPickupInfo(open, today) : null;
}

/** The open pickup of each patient of a Puskesmas, by patient id. */
export async function openPickupsByPatient(
  db: Pick<Database, "select">,
  puskesmasId: string,
  today: string,
): Promise<Map<string, PickupInfo>> {
  const rows = await db
    .select({ pickup: pickups })
    .from(pickups)
    .innerJoin(patients, eq(patients.id, pickups.patientId))
    .where(and(eq(patients.puskesmasId, puskesmasId), isNull(pickups.doneAt)));
  return new Map(rows.map(({ pickup }) => [pickup.patientId, toPickupInfo(pickup, today)]));
}

export type DoneResult =
  | { kind: "not_found" }
  | { kind: "invalid_date" }
  | { kind: "done"; completed: PickupInfo; next: PickupInfo }
  /** The pickup was already done: nothing changed; `next` is the patient's open pickup. */
  | { kind: "already_done"; next: PickupInfo | null };

/**
 * Marks the open pickup done on `doneOn` (default today, never in the future)
 * and schedules the next one `interval` days after it. One transaction: a
 * double submission updates zero rows the second time and inserts nothing.
 */
export async function markPickupDone(
  db: Database,
  session: NurseSession,
  patientId: string,
  pickupId: string,
  doneOn: string | undefined,
  now: Date = new Date(),
): Promise<DoneResult> {
  const today = todayJakarta(now);
  const on = doneOn ?? today;
  return db.transaction(async (tx) => {
    const [patient] = await tx.select().from(patients).where(scopedPatientWhere(patientId, session.puskesmasId));
    if (!patient) return { kind: "not_found" };
    if (on > today || on < patient.startDate) return { kind: "invalid_date" };

    const doneAt = on === today ? now : new Date(`${on}T12:00:00+07:00`);
    const [completed] = await tx
      .update(pickups)
      .set({ doneAt })
      .where(and(eq(pickups.id, pickupId), eq(pickups.patientId, patientId), isNull(pickups.doneAt)))
      .returning();

    if (!completed) {
      const [existing] = await tx
        .select({ id: pickups.id })
        .from(pickups)
        .where(and(eq(pickups.id, pickupId), eq(pickups.patientId, patientId)));
      if (!existing) return { kind: "not_found" };
      const [open] = await tx
        .select()
        .from(pickups)
        .where(and(eq(pickups.patientId, patientId), isNull(pickups.doneAt)));
      return { kind: "already_done", next: open ? toPickupInfo(open, today) : null };
    }

    const [next] = await tx
      .insert(pickups)
      .values({ patientId, dueDate: nextDueDate(on, patient.pickupIntervalDays) })
      .returning();
    await audit(tx, {
      actor: actorOf(session),
      action: "pickup.done",
      target: `pickup:${completed.id}`,
      meta: { patientId, doneOn: on, nextDue: next.dueDate },
    });
    return { kind: "done", completed: toPickupInfo(completed, today), next: toPickupInfo(next, today) };
  });
}

export type RescheduleResult =
  | { kind: "not_found" }
  | { kind: "invalid_date" }
  /** The pickup was already done, so its date can no longer change. */
  | { kind: "closed" }
  | { kind: "ok"; pickup: PickupInfo };

/** Latest due date a nurse may set: about a year ahead. */
const MAX_RESCHEDULE_DAYS = 366;

/** Changes the due date of an OPEN pickup (the nurse's correction). */
export async function reschedulePickup(
  db: Database,
  session: NurseSession,
  patientId: string,
  pickupId: string,
  dueDate: string,
  now: Date = new Date(),
): Promise<RescheduleResult> {
  const today = todayJakarta(now);
  return db.transaction(async (tx) => {
    const [patient] = await tx.select().from(patients).where(scopedPatientWhere(patientId, session.puskesmasId));
    if (!patient) return { kind: "not_found" };
    const [current] = await tx
      .select()
      .from(pickups)
      .where(and(eq(pickups.id, pickupId), eq(pickups.patientId, patientId)))
      .for("update");
    if (!current) return { kind: "not_found" };
    if (dueDate < patient.startDate || dueDate > addDays(today, MAX_RESCHEDULE_DAYS)) {
      return { kind: "invalid_date" };
    }
    if (current.doneAt !== null) return { kind: "closed" };

    const [updated] = await tx.update(pickups).set({ dueDate }).where(eq(pickups.id, pickupId)).returning();
    await audit(tx, {
      actor: actorOf(session),
      action: "pickup.reschedule",
      target: `pickup:${pickupId}`,
      meta: { patientId, from: current.dueDate, to: dueDate },
    });
    return { kind: "ok", pickup: toPickupInfo(updated, today) };
  });
}

/** What the family sees. `pickup` is null when no pickup is scheduled yet. */
export interface FamilyPickup {
  pickup: { dueDate: string; daysUntil: number; state: PickupState; daysOverdue: number } | null;
  contact: { name: string; phone: string };
}

/** The open pickup of the token's patient, with the Puskesmas contact. Audited as `pickup.read`. */
export async function familyPickup(
  db: Database,
  patient: FamilyPatient,
  now: Date = new Date(),
): Promise<FamilyPickup> {
  const today = todayJakarta(now);
  const [open] = await db
    .select()
    .from(pickups)
    .where(and(eq(pickups.patientId, patient.id), isNull(pickups.doneAt)))
    .orderBy(asc(pickups.dueDate))
    .limit(1);
  const [pk] = await db
    .select({ name: puskesmas.name, phone: puskesmas.phone })
    .from(puskesmas)
    .where(eq(puskesmas.id, patient.puskesmasId));
  await audit(db, {
    actor: `family:${patient.id}`,
    action: "pickup.read",
    target: open ? `pickup:${open.id}` : `patient:${patient.id}`,
  });
  const info = open ? toPickupInfo(open, today) : null;
  return {
    pickup: info
      ? { dueDate: info.dueDate, daysUntil: info.daysUntil, state: info.state, daysOverdue: info.daysOverdue }
      : null,
    contact: { name: pk?.name ?? "", phone: pk?.phone ?? "" },
  };
}

/**
 * Creates the first pickup of every patient that has no open pickup (patients
 * registered before this feature, such as the seeded demo patients). Safe to
 * run repeatedly: the partial unique index forbids a second open pickup.
 * Returns the number of pickups created.
 */
export async function backfillPickups(db: Database, now: Date = new Date(), puskesmasId?: string): Promise<number> {
  const today = todayJakarta(now);
  const missing = await db
    .select()
    .from(patients)
    .where(
      and(
        puskesmasId ? eq(patients.puskesmasId, puskesmasId) : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(pickups)
            .where(and(eq(pickups.patientId, patients.id), isNull(pickups.doneAt))),
        ),
      ),
    )
    .orderBy(desc(patients.createdAt));
  let created = 0;
  for (const p of missing) {
    const inserted = await db
      .insert(pickups)
      .values({ patientId: p.id, dueDate: firstDueDate(p.startDate, p.pickupIntervalDays, today) })
      .onConflictDoNothing()
      .returning({ id: pickups.id });
    created += inserted.length;
  }
  return created;
}
