import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { alerts, checkins, patients } from "@/lib/db/schema";
import { copy } from "@/copy/nurse.id";
import { notifyAlert } from "@/lib/alerts/notify";
import { audit } from "@/lib/audit/audit";
import { effectiveLevel } from "@/lib/queue/build";
import { redactWithLexicon } from "@/lib/redaction/withLexicon";
import { formatClock } from "@/lib/queue/format";
import { OVERRIDE_NOTE_MAX, OVERRIDE_NOTE_MIN } from "./override-limits";
import type { Level } from "@/lib/triage/types";

export { OVERRIDE_NOTE_MIN, OVERRIDE_NOTE_MAX };

const v = copy.timeline.override;

/** Body of `POST /api/nurse/checkins/[id]/override`. Pure, so the dialog can validate the same way. */
export const overrideSchema = z
  .object({
    level: z.enum(["GREEN", "YELLOW", "RED"]),
    note: z
      .string({ required_error: v.noteTooShort, invalid_type_error: v.noteTooShort })
      .trim()
      .min(OVERRIDE_NOTE_MIN, v.noteTooShort)
      .max(OVERRIDE_NOTE_MAX),
  })
  .strict();

export type OverrideInput = z.infer<typeof overrideSchema>;

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

export type OverrideResult =
  | { kind: "not_found" }
  | { kind: "same_level" }
  | {
      kind: "ok";
      checkinId: string;
      level: Level;
      originalLevel: Level | null;
      /** True when the override created the alert (raised to RED). */
      alertCreated: boolean;
    };

/**
 * Overrides the level of a check-in of the session's Puskesmas.
 *
 *  - the stored `triage_level` is never changed; the override sits beside it;
 *  - the note is redacted before storage;
 *  - raised to RED: an alert is created if the check-in has none, and announced;
 *  - lowered: alerts and acknowledgements stay as they are;
 *  - the family's stored reply is not touched;
 *  - the audit entry (nurse, check-in, old and new level) shares the transaction.
 */
export async function overrideCheckin(
  db: Database,
  session: NurseSession,
  checkinId: string,
  input: OverrideInput,
  now: Date = new Date(),
): Promise<OverrideResult> {
  const note = redactWithLexicon(input.note);
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ checkin: checkins })
      .from(checkins)
      .innerJoin(patients, eq(patients.id, checkins.patientId))
      .where(and(eq(checkins.id, checkinId), eq(patients.puskesmasId, session.puskesmasId)))
      .for("update", { of: checkins });
    if (!found) return { kind: "not_found" };
    const current = found.checkin;
    const before = effectiveLevel(current);
    if (before === input.level) return { kind: "same_level" };

    await tx
      .update(checkins)
      .set({ overrideLevel: input.level, overrideNote: note, overriddenBy: session.nurseId, overriddenAt: now })
      .where(eq(checkins.id, checkinId));

    let alertCreated = false;
    if (input.level === "RED") {
      const [alert] = await tx
        .insert(alerts)
        .values({ checkinId, patientId: current.patientId, puskesmasId: session.puskesmasId, level: "RED" })
        .onConflictDoNothing()
        .returning({ id: alerts.id });
      if (alert) {
        alertCreated = true;
        await notifyAlert(tx, { type: "alert.created", alertId: alert.id, puskesmasId: session.puskesmasId });
      }
    }

    const original = current.triageLevel === "GREEN" || current.triageLevel === "YELLOW" || current.triageLevel === "RED"
      ? current.triageLevel
      : null;
    await audit(tx, {
      actor: `nurse:${session.nurseId}`,
      action: "checkin.override",
      target: `checkin:${checkinId}`,
      meta: { patientId: current.patientId, from: before, to: input.level, original, time: formatClock(now) },
    });
    return { kind: "ok", checkinId, level: input.level, originalLevel: original, alertCreated };
  });
}
