import { eq, type SQL } from "drizzle-orm";
import { patients } from "@/lib/db/schema";
import { audit, type AuditActor, type AuditExecutor } from "@/lib/audit/audit";

/**
 * Consent storage and enforcement.
 *
 * Every family write route must call `requireConsent` first. It throws
 * {@link ConsentRequiredError} when the patient has no stored consent, so no
 * patient-reported data is stored and no external service is called.
 */

export class ConsentRequiredError extends Error {
  constructor(public readonly patientId: string) {
    super(`consent required for patient ${patientId}`);
    this.name = "ConsentRequiredError";
  }
}

export class PatientNotFoundError extends Error {
  constructor(public readonly patientId: string) {
    super(`patient ${patientId} not found`);
    this.name = "PatientNotFoundError";
  }
}

/** Minimal reader interface: find a patient's consent timestamp. */
export interface ConsentReader {
  getConsentAt: (patientId: string) => Promise<Date | null | undefined>;
}

/**
 * Throws if the patient has no stored consent. Returns the consent timestamp
 * when present.
 */
export async function requireConsent(
  reader: ConsentReader,
  patientId: string,
): Promise<Date> {
  const consentAt = await reader.getConsentAt(patientId);
  if (consentAt === undefined) throw new PatientNotFoundError(patientId);
  if (consentAt === null) throw new ConsentRequiredError(patientId);
  return consentAt;
}

/** Drizzle-backed reader for use in route handlers. */
export function drizzleConsentReader(db: {
  query: {
    patients: {
      findFirst: (args: {
        where: unknown;
        columns: { consentAt: true };
      }) => Promise<{ consentAt: Date | null } | undefined>;
    };
  };
}): ConsentReader {
  return {
    getConsentAt: async (patientId: string) => {
      const row = await db.query.patients.findFirst({
        where: eq(patients.id, patientId),
        columns: { consentAt: true },
      });
      if (!row) return undefined;
      return row.consentAt;
    },
  };
}

/**
 * Minimal writer interface for recording consent: updates the patient and
 * writes an audit entry in the same transaction.
 */
export interface ConsentWriter extends AuditExecutor {
  update: (table: typeof patients) => {
    set: (values: { consentAt: Date }) => {
      where: (cond: SQL | undefined) => PromiseLike<unknown>;
    };
  };
}

/**
 * Records consent for a patient at time `now` and writes an audit entry.
 * Both happen through `tx` so they commit or roll back together.
 */
export async function recordConsent(
  tx: ConsentWriter,
  patientId: string,
  now: Date,
  actor: AuditActor = "system",
): Promise<void> {
  await tx.update(patients).set({ consentAt: now }).where(eq(patients.id, patientId));
  await audit(tx, {
    actor,
    action: "patient.consent",
    target: patientId,
    meta: { recordedAt: now.toISOString() },
  });
}
