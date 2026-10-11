import type { Database } from "@/lib/db";
import { copy } from "@/copy/nurse.id";
import { audit } from "@/lib/audit/audit";
import { todayJakarta } from "@/lib/time";
import { buildQueue } from "./build";
import { formatLastCheckin } from "./format";
import type { QueueEntry, QueueItem } from "./types";

export function toQueueItem(e: QueueEntry, now: Date): QueueItem {
  return {
    patientId: e.patientId,
    code: e.code,
    day: e.treatmentDay,
    score: e.score,
    band: e.band,
    level: e.level,
    overridden: e.overridden,
    reason: e.reason,
    action: e.suggestedAction,
    lastCheckin: formatLastCheckin(e.latestCheckinAt, now),
    factors: e.reasons.map((r) => ({ text: r.text, points: r.points })),
  };
}

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

/** The nurse's queue for today. Audited as `queue.read`. */
export async function nurseQueue(db: Database, session: NurseSession, now: Date = new Date()) {
  const date = todayJakarta(now);
  const entries = await buildQueue(db, session.puskesmasId, date);
  await audit(db, {
    actor: `nurse:${session.nurseId}`,
    action: "queue.read",
    target: session.puskesmasId,
    meta: { count: entries.length },
  });
  return { date, entries: entries.map((e) => toQueueItem(e, now)) };
}

/** A queue row as the Langflow `nurse_digest` flow reads it. No note text, no contact, no ids. */
export interface InternalQueueItem {
  rank: number;
  code: string;
  treatment_day: number;
  score: number;
  band: string;
  level: string | null;
  reason: string;
  suggested_action: string;
}

/**
 * The ranked list for the digest flow, for any Puskesmas and date. Reasons are
 * always built from codes and risk factors (never the stored one-liner), so the
 * response carries no free text of any patient. Audited with actor `system:internal`.
 */
export async function internalQueue(db: Database, puskesmasId: string, date: string) {
  const entries = await buildQueue(db, puskesmasId, date, { reasonSource: "deterministic" });
  await audit(db, {
    actor: "system:internal",
    action: "internal_queue.read",
    target: puskesmasId,
    meta: { date, count: entries.length },
  });
  const items: InternalQueueItem[] = entries.map((e, i) => ({
    rank: i + 1,
    code: e.code,
    treatment_day: e.treatmentDay,
    score: e.score,
    band: e.band,
    level: e.level,
    reason: e.reason,
    suggested_action: copy.queue.actions[e.suggestedAction].toLowerCase(),
  }));
  return { puskesmas_id: puskesmasId, date, entries: items };
}
