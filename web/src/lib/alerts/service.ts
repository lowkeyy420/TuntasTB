import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { alerts, checkins, nurses, patients } from "@/lib/db/schema";
import { copy } from "@/copy/nurse.id";
import { audit } from "@/lib/audit/audit";
import { formatClock } from "@/lib/queue/format";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { TriageTable } from "@/lib/triage/types";
import { notifyAlert } from "./notify";
import type { AlertItem, AlertStatus } from "./types";

export type { AlertItem, AlertStatus } from "./types";

/**
 * Nurse-side reads and writes of RED alerts. Everything is scoped by the
 * session's Puskesmas, never by request input.
 */

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

/** How many acknowledged alerts the log shows. */
export const ACK_LOG_LIMIT = 50;

/**
 * Plain-words red flags of a check-in: the red-flag and symptom codes stored
 * with it whose table level is RED. A check-in raised to RED by a nurse override
 * with no flag of its own says so.
 */
export function flagLabels(
  symptomsJson: unknown,
  overrideLevel: string | null,
  table: Pick<TriageTable, "symptoms">,
): string[] {
  const codes = new Set<string>();
  const stored = (symptomsJson ?? {}) as Record<string, unknown>;
  for (const key of ["redFlags", "symptoms", "chips"]) {
    const list = stored[key];
    if (Array.isArray(list)) for (const c of list) if (typeof c === "string") codes.add(c);
  }
  const labels = table.symptoms
    .filter((s) => s.level === "RED" && codes.has(s.code))
    .map((s) => s.label_id);
  if (labels.length > 0) return labels;
  return [overrideLevel === "RED" ? copy.alerts.overrideFlag : copy.alerts.unknownFlag];
}

const columns = {
  id: alerts.id,
  patientId: alerts.patientId,
  createdAt: alerts.createdAt,
  acknowledgedAt: alerts.acknowledgedAt,
  acknowledgedBy: nurses.email,
  code: patients.code,
  day: checkins.treatmentDay,
  symptomsJson: checkins.symptomsJson,
  overrideLevel: checkins.overrideLevel,
};

type Row = {
  id: string;
  patientId: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  code: string;
  day: number | null;
  symptomsJson: unknown;
  overrideLevel: string | null;
};

function toItem(row: Row, table: Pick<TriageTable, "symptoms">): AlertItem {
  return {
    id: row.id,
    patientId: row.patientId,
    code: row.code,
    day: row.day,
    flags: flagLabels(row.symptomsJson, row.overrideLevel, table),
    time: formatClock(row.createdAt),
    createdAt: row.createdAt.toISOString(),
    acknowledged: row.acknowledgedAt !== null,
    acknowledgedBy: row.acknowledgedAt !== null ? (row.acknowledgedBy ?? "") : null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedTime: row.acknowledgedAt ? formatClock(row.acknowledgedAt) : null,
  };
}

function select(db: Pick<Database, "select">, where: SQL | undefined) {
  return db
    .select(columns)
    .from(alerts)
    .innerJoin(patients, eq(patients.id, alerts.patientId))
    .innerJoin(checkins, eq(checkins.id, alerts.checkinId))
    .leftJoin(nurses, eq(nurses.id, alerts.acknowledgedBy))
    .where(where);
}

/** One alert of a Puskesmas, or null (also when it belongs to another Puskesmas). */
export async function getAlertItem(
  db: Pick<Database, "select">,
  alertId: string,
  puskesmasId: string,
  table: Pick<TriageTable, "symptoms"> = defaultRules().table,
): Promise<AlertItem | null> {
  const [row] = await select(db, and(eq(alerts.id, alertId), eq(alerts.puskesmasId, puskesmasId)));
  return row ? toItem(row, table) : null;
}

/** Unacknowledged alerts of a Puskesmas, newest first. */
export async function openAlerts(
  db: Pick<Database, "select">,
  puskesmasId: string,
  table: Pick<TriageTable, "symptoms"> = defaultRules().table,
): Promise<AlertItem[]> {
  const rows = await select(db, and(eq(alerts.puskesmasId, puskesmasId), isNull(alerts.acknowledgedAt))).orderBy(
    desc(alerts.createdAt),
  );
  return rows.map((r) => toItem(r, table));
}

/**
 * Lists alerts: `open` (newest first), `acknowledged` (the log, newest
 * acknowledgement first) or `all` (open, then the log). Audited as `alert.list`
 * unless `quiet` is set, which the periodic polling of an open console uses so
 * the audit trail records people opening the list, not a timer.
 */
export async function listAlerts(
  db: Database,
  session: NurseSession,
  status: AlertStatus,
  options: { quiet?: boolean } = {},
): Promise<AlertItem[]> {
  const table = defaultRules().table;
  const open = status === "acknowledged" ? [] : await openAlerts(db, session.puskesmasId, table);
  const log =
    status === "open"
      ? []
      : (
          await select(db, and(eq(alerts.puskesmasId, session.puskesmasId), isNotNull(alerts.acknowledgedAt)))
            .orderBy(desc(alerts.acknowledgedAt))
            .limit(ACK_LOG_LIMIT)
        ).map((r) => toItem(r, table));
  const items = [...open, ...log];
  if (!options.quiet) {
    await audit(db, {
      actor: `nurse:${session.nurseId}`,
      action: "alert.list",
      target: session.puskesmasId,
      meta: { status, count: items.length },
    });
  }
  return items;
}

export type AckResult =
  | { kind: "not_found" }
  | { kind: "acknowledged"; alert: AlertItem }
  /** Someone acknowledged first: their acknowledgement is kept. */
  | { kind: "already"; alert: AlertItem };

/**
 * Acknowledges an alert for the session's nurse. The first acknowledgement
 * wins (`WHERE acknowledged_at IS NULL`); a later one changes nothing and
 * returns the stored acknowledgement. The audit entry and the notification
 * share the transaction with the update.
 */
export async function acknowledgeAlert(
  db: Database,
  session: NurseSession,
  alertId: string,
  now: Date = new Date(),
): Promise<AckResult> {
  const table = defaultRules().table;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(alerts)
      .set({ acknowledgedBy: session.nurseId, acknowledgedAt: now })
      .where(and(eq(alerts.id, alertId), eq(alerts.puskesmasId, session.puskesmasId), isNull(alerts.acknowledgedAt)))
      .returning({ id: alerts.id, patientId: alerts.patientId });
    if (updated) {
      await audit(tx, {
        actor: `nurse:${session.nurseId}`,
        action: "alert.ack",
        target: `alert:${updated.id}`,
        meta: { patientId: updated.patientId, puskesmasId: session.puskesmasId },
      });
      await notifyAlert(tx, { type: "alert.acknowledged", alertId: updated.id, puskesmasId: session.puskesmasId });
    }
    const alert = await getAlertItem(tx, alertId, session.puskesmasId, table);
    if (!alert) return { kind: "not_found" };
    return { kind: updated ? "acknowledged" : "already", alert };
  });
}
