import { auditLog } from "@/lib/db/schema";

/**
 * Audit log writer.
 *
 * Reads and writes of patient data are recorded here. Writes call `audit`
 * inside the SAME transaction as the data change, so the data change and its
 * audit entry commit or roll back together. Reads call it before returning.
 *
 * Audit entries MUST NOT contain free text, link tokens, passwords or contact
 * details; `assertSafeMeta` enforces that for the `meta` object.
 */

/** Closed union of audit actions. Feature changes extend this list. */
export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "patient.read"
  | "patient.create"
  | "patient.delete"
  | "patient.update"
  | "patient.list"
  | "patient.consent"
  | "family_token.rotate"
  | "family_token.revoke"
  | "family.open"
  | "checkin.create"
  | "checkin.read"
  | "checkin.override"
  | "queue.read"
  | "internal_queue.read"
  | "alert.list"
  | "alert.ack"
  | "alert.stream_open"
  | "pickup.read"
  | "pickup.done"
  | "pickup.reschedule";

export type AuditActor = `nurse:${string}` | `family:${string}` | "system" | `system:${string}`;

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  /** Internal identifier of the target (e.g. a patient id), never a token. */
  target?: string | null;
  /** Small object of identifiers and enums only. */
  meta?: Record<string, unknown>;
}

/** Keys that must never appear in audit meta (would leak sensitive data). */
const FORBIDDEN_META_KEYS = [
  "text",
  "token",
  "password",
  "passwordHash",
  "password_hash",
  "phone",
  "contact",
  "email",
  "nik",
  "secret",
];

export class UnsafeAuditMetaError extends Error {
  constructor(key: string) {
    super(`audit meta must not contain a '${key}' key`);
    this.name = "UnsafeAuditMetaError";
  }
}

/** Throws {@link UnsafeAuditMetaError} if meta carries a forbidden key. */
export function assertSafeMeta(meta: Record<string, unknown> | undefined): void {
  if (!meta) return;
  for (const key of Object.keys(meta)) {
    if (FORBIDDEN_META_KEYS.includes(key.toLowerCase())) {
      throw new UnsafeAuditMetaError(key);
    }
    // Reject nested objects that could smuggle forbidden content.
    const value = meta[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertSafeMeta(value as Record<string, unknown>);
    }
  }
}

/**
 * Minimal interface satisfied by both the Drizzle db and a transaction object.
 * Only `insert` is needed here.
 */
export interface AuditExecutor {
  insert: (table: typeof auditLog) => {
    values: (row: {
      actor: string;
      action: string;
      target: string | null;
      metaJson: Record<string, unknown> | null;
    }) => Promise<unknown> | { returning: () => Promise<unknown> };
  };
}

/**
 * Writes one audit entry using the provided executor (db or transaction).
 */
export async function audit(
  tx: AuditExecutor,
  entry: AuditEntry,
): Promise<void> {
  assertSafeMeta(entry.meta);
  const result = tx.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    target: entry.target ?? null,
    metaJson: entry.meta ?? null,
  });
  await Promise.resolve(result);
}
