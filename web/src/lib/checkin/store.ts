import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { alerts, checkins } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { notifyAlert } from "@/lib/alerts/notify";
import type { HistoryCheckin } from "@/lib/risk/history";
import { symptomCodesFromJson } from "@/lib/risk/history";
import type { Level } from "@/lib/triage/types";
import type { CheckinDraft } from "./pipeline";

/** At most this many check-ins per patient per calendar day (Asia/Jakarta). */
export const DAILY_LIMIT = 20;

export class DailyLimitError extends Error {
  constructor() {
    super(`more than ${DAILY_LIMIT} check-ins today`);
    this.name = "DailyLimitError";
  }
}

export type StoredCheckin = typeof checkins.$inferSelect;

export async function findByClientId(
  db: Pick<Database, "select">,
  patientId: string,
  clientId: string,
): Promise<StoredCheckin | null> {
  const [row] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.patientId, patientId), eq(checkins.clientId, clientId)));
  return row ?? null;
}

/** Check-ins stored for the patient on a Jakarta calendar day (the day they were received). */
export async function countReceivedOn(
  db: Pick<Database, "select">,
  patientId: string,
  day: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkins)
    .where(
      and(
        eq(checkins.patientId, patientId),
        sql`(${checkins.createdAt} AT TIME ZONE 'Asia/Jakarta')::date = ${day}::date`,
      ),
    );
  return row?.n ?? 0;
}

const asLevel = (s: string | null): Level | null =>
  s === "GREEN" || s === "YELLOW" || s === "RED" ? s : null;

/** The patient's stored check-ins reduced to what symptom persistence needs. */
export async function loadHistory(
  db: Pick<Database, "select">,
  patientId: string,
): Promise<HistoryCheckin[]> {
  const rows = await db.select().from(checkins).where(eq(checkins.patientId, patientId));
  return rows.map((r) => ({
    occurredOn: r.occurredOn,
    createdAt: r.createdAt.getTime(),
    doseStatus: r.doseStatus,
    symptomCodes: symptomCodesFromJson(r.symptomsJson),
    textRedacted: r.textRedacted,
    triageLevel: asLevel(r.triageLevel),
  }));
}

export interface SaveArgs {
  patientId: string;
  puskesmasId: string;
  clientId: string;
  draft: CheckinDraft;
  /** The instant of receipt: stored as `created_at`; its Jakarta day is what the daily limit counts. */
  receivedAt: Date;
  /** Jakarta calendar day of `receivedAt`. */
  receivedOn: string;
}

export type SaveResult =
  | { kind: "created"; row: StoredCheckin }
  /** The same `(patient, clientId)` was stored by a concurrent request. */
  | { kind: "existing"; row: StoredCheckin };

/**
 * Stores the check-in, its RED alert and the audit entry in ONE transaction:
 * if the alert cannot be stored the check-in is not stored either, so the
 * family is never told "sent" for a RED the nurse cannot see.
 *
 * A per-patient advisory lock serialises concurrent submissions, so the
 * idempotency check and the daily limit hold under races.
 */
export async function saveCheckin(db: Database, args: SaveArgs): Promise<SaveResult> {
  const { draft } = args;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${args.patientId}))`);

    const existing = await findByClientId(tx, args.patientId, args.clientId);
    if (existing) return { kind: "existing", row: existing };
    if ((await countReceivedOn(tx, args.patientId, args.receivedOn)) >= DAILY_LIMIT) {
      throw new DailyLimitError();
    }

    const [row] = await tx
      .insert(checkins)
      .values({
        patientId: args.patientId,
        clientId: args.clientId,
        occurredOn: draft.occurredOn,
        treatmentDay: draft.treatmentDay,
        doseStatus: draft.doseStatus,
        symptomsJson: draft.symptoms,
        textRedacted: draft.textRedacted === "" ? null : draft.textRedacted,
        localLevel: draft.localLevel,
        flowLevel: draft.flowLevel,
        triageLevel: draft.level,
        riskScore: draft.risk.score,
        riskBand: draft.risk.band,
        riskReasonsJson: draft.risk.reasons,
        familyMessage: draft.reply.explanation,
        nurseLine: draft.nurseLine,
        citationsJson: draft.reply.citations,
        fallbackUsed: draft.fallbackUsed,
        replyTemplateUsed: draft.reply.templateUsed,
        replyReplaceReason: draft.reply.replaceReason,
        replyAction: draft.reply.action,
        createdAt: args.receivedAt,
      })
      .returning();

    if (draft.level === "RED") {
      const [alert] = await tx
        .insert(alerts)
        .values({
          checkinId: row.id,
          patientId: args.patientId,
          puskesmasId: args.puskesmasId,
          level: "RED",
        })
        .returning({ id: alerts.id });
      // Delivered by Postgres only when this transaction commits.
      await notifyAlert(tx, { type: "alert.created", alertId: alert.id, puskesmasId: args.puskesmasId });
    }

    await audit(tx, {
      actor: `family:${args.patientId}`,
      action: "checkin.create",
      target: `checkin:${row.id}`,
      // Identifiers and enums only, never the note.
      meta: { level: draft.level, fallbackUsed: draft.fallbackUsed },
    });

    return { kind: "created", row };
  });
}
