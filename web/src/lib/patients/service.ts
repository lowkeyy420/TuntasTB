import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { scopedPatientWhere } from "@/lib/auth/requireNurse";
import { generateFamilyToken, hashFamilyToken } from "@/lib/family-token";
import { todayJakarta, treatmentDay } from "@/lib/time";
import { hashPmoContact } from "./pmo";
import type { RegistrationInput, UpdateInput } from "./schema";

/**
 * Patient registration and link management. Every function takes the nurse's
 * session (nurseId, puskesmasId) and scopes by the session's Puskesmas, never
 * by request input. Reads and writes are audited; writes share a transaction
 * with their audit entry.
 */

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

export type LinkStatus = "active" | "revoked" | "none";

/** What the nurse sees. Never contains the token, its hash or the PMO hash. */
export interface PatientView {
  id: string;
  code: string;
  startDate: string;
  treatmentDay: number;
  phase: string;
  pickupIntervalDays: number;
  hasPmo: boolean;
  consented: boolean;
  linkStatus: LinkStatus;
}

export class DuplicateCodeError extends Error {
  constructor() {
    super("patient code already used in this Puskesmas");
    this.name = "DuplicateCodeError";
  }
}

type PatientRow = typeof patients.$inferSelect;

export function toView(row: PatientRow, today: string): PatientView {
  return {
    id: row.id,
    code: row.code,
    startDate: row.startDate,
    treatmentDay: treatmentDay(row.startDate, today),
    phase: row.phase,
    pickupIntervalDays: row.pickupIntervalDays,
    hasPmo: row.pmoContactHash !== null,
    consented: row.consentAt !== null,
    linkStatus:
      row.familyTokenHash === null
        ? "none"
        : row.tokenRevokedAt !== null
          ? "revoked"
          : "active",
  };
}

export function familyLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/f/${token}`;
}

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

const actorOf = (s: NurseSession) => `nurse:${s.nurseId}` as const;

export async function createPatient(
  db: Database,
  session: NurseSession,
  input: RegistrationInput,
  pepper: string,
  now: Date = new Date(),
): Promise<{ patient: PatientView; token: string }> {
  const token = generateFamilyToken();
  const pmoContactHash = hashPmoContact(input.pmoPhone, pepper);
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(patients)
        .values({
          puskesmasId: session.puskesmasId,
          code: input.code,
          startDate: input.startDate,
          phase: input.phase,
          pickupIntervalDays: input.pickupIntervalDays,
          pmoContactHash,
          familyTokenHash: hashFamilyToken(token),
        })
        .returning();
      await audit(tx, {
        actor: actorOf(session),
        action: "patient.create",
        target: created.id,
        meta: { puskesmasId: session.puskesmasId, hasPmo: pmoContactHash !== null },
      });
      return created;
    });
    return { patient: toView(row, todayJakarta(now)), token };
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateCodeError();
    throw e;
  }
}

export async function listPatients(
  db: Database,
  session: NurseSession,
  now: Date = new Date(),
): Promise<PatientView[]> {
  const rows = await db
    .select()
    .from(patients)
    .where(eq(patients.puskesmasId, session.puskesmasId))
    .orderBy(desc(patients.createdAt), asc(patients.code));
  await audit(db, {
    actor: actorOf(session),
    action: "patient.list",
    target: session.puskesmasId,
    meta: { count: rows.length },
  });
  const today = todayJakarta(now);
  return rows.map((r) => toView(r, today));
}

export async function getPatient(
  db: Database,
  session: NurseSession,
  patientId: string,
  now: Date = new Date(),
): Promise<PatientView | null> {
  const [row] = await db
    .select()
    .from(patients)
    .where(scopedPatientWhere(patientId, session.puskesmasId));
  if (!row) return null;
  await audit(db, {
    actor: actorOf(session),
    action: "patient.read",
    target: row.id,
  });
  return toView(row, todayJakarta(now));
}

export async function updatePatient(
  db: Database,
  session: NurseSession,
  patientId: string,
  input: UpdateInput,
  now: Date = new Date(),
): Promise<PatientView | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(patients)
      .set({
        ...(input.phase !== undefined ? { phase: input.phase } : {}),
        ...(input.pickupIntervalDays !== undefined
          ? { pickupIntervalDays: input.pickupIntervalDays }
          : {}),
      })
      .where(scopedPatientWhere(patientId, session.puskesmasId))
      .returning();
    if (!row) return null;
    await audit(tx, {
      actor: actorOf(session),
      action: "patient.update",
      target: row.id,
      meta: {
        fields: [
          ...(input.phase !== undefined ? ["phase"] : []),
          ...(input.pickupIntervalDays !== undefined ? ["pickupIntervalDays"] : []),
        ],
      },
    });
    return toView(row, todayJakarta(now));
  });
}

/** Issues a new token, replacing the old hash and clearing any revocation. */
export async function rotateToken(
  db: Database,
  session: NurseSession,
  patientId: string,
): Promise<{ token: string } | null> {
  const token = generateFamilyToken();
  const ok = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(patients)
      .set({ familyTokenHash: hashFamilyToken(token), tokenRevokedAt: null })
      .where(scopedPatientWhere(patientId, session.puskesmasId))
      .returning({ id: patients.id });
    if (!row) return false;
    await audit(tx, {
      actor: actorOf(session),
      action: "family_token.rotate",
      target: row.id,
    });
    return true;
  });
  return ok ? { token } : null;
}

/** Marks the link revoked but keeps the hash, so "revoked" differs from "never issued". */
export async function revokeToken(
  db: Database,
  session: NurseSession,
  patientId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: patients.id, tokenRevokedAt: patients.tokenRevokedAt })
      .from(patients)
      .where(scopedPatientWhere(patientId, session.puskesmasId))
      .for("update");
    if (!current) return false;
    if (current.tokenRevokedAt === null) {
      await tx
        .update(patients)
        .set({ tokenRevokedAt: now })
        .where(eq(patients.id, current.id));
    }
    await audit(tx, {
      actor: actorOf(session),
      action: "family_token.revoke",
      target: current.id,
    });
    return true;
  });
}

