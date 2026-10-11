import { desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { alerts, checkins, nurses, patients } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { scopedPatientWhere } from "@/lib/auth/requireNurse";
import { effectiveLevel } from "@/lib/queue/build";
import { formatClock } from "@/lib/queue/format";
import { symptomCodesFromJson } from "@/lib/risk/history";
import { todayJakarta, treatmentDay } from "@/lib/time";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Level } from "@/lib/triage/types";
import { corpusReviewStatus } from "./corpus";
import type { Timeline, TimelineCheckin } from "./types";

export interface NurseSession {
  nurseId: string;
  puskesmasId: string;
}

/** Newest check-ins shown. */
export const TIMELINE_LIMIT = 100;

const asLevel = (s: string | null): Level | null => (s === "GREEN" || s === "YELLOW" || s === "RED" ? s : null);
const asDose = (s: string | null): TimelineCheckin["doseStatus"] =>
  s === "yes" || s === "no" || s === "partial" ? s : null;
const asBand = (s: string | null): TimelineCheckin["riskBand"] =>
  s === "high" || s === "medium" || s === "low" ? s : null;

function unknownCodes(json: unknown): string[] {
  const list = (json as { unknown?: unknown } | null)?.unknown;
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : [];
}

function riskReasons(json: unknown): TimelineCheckin["riskReasons"] {
  if (!Array.isArray(json)) return [];
  return json
    .map((r) => r as { text?: unknown; points?: unknown })
    .filter((r) => typeof r.text === "string" && typeof r.points === "number")
    .map((r) => ({ text: r.text as string, points: r.points as number }));
}

/**
 * A patient's check-ins, newest first, for the nurse of the patient's
 * Puskesmas (null for any other). Audited as `patient.read`.
 */
export async function getTimeline(
  db: Database,
  session: NurseSession,
  patientId: string,
  now: Date = new Date(),
): Promise<Timeline | null> {
  const rules = defaultRules();
  const [patient] = await db.select().from(patients).where(scopedPatientWhere(patientId, session.puskesmasId));
  if (!patient) return null;

  const rows = await db
    .select({ checkin: checkins, alert: alerts, ackBy: nurses.email })
    .from(checkins)
    .leftJoin(alerts, eq(alerts.checkinId, checkins.id))
    .leftJoin(nurses, eq(nurses.id, alerts.acknowledgedBy))
    .where(eq(checkins.patientId, patientId))
    .orderBy(desc(checkins.createdAt))
    .limit(TIMELINE_LIMIT);
  const overriders = new Map<string, string>();
  const overriderIds = [...new Set(rows.map((r) => r.checkin.overriddenBy).filter((id): id is string => id !== null))];
  for (const id of overriderIds) {
    const [n] = await db.select({ email: nurses.email }).from(nurses).where(eq(nurses.id, id));
    if (n) overriders.set(id, n.email);
  }

  const labelOf = new Map(rules.table.symptoms.map((s) => [s.code, s.label_id]));
  const items: TimelineCheckin[] = rows.map(({ checkin: c, alert, ackBy }) => {
    const override = asLevel(c.overrideLevel);
    return {
      id: c.id,
      occurredOn: c.occurredOn,
      time: formatClock(c.createdAt),
      treatmentDay: c.treatmentDay,
      doseStatus: asDose(c.doseStatus),
      symptoms: [
        ...new Set([
          ...symptomCodesFromJson(c.symptomsJson),
          ...(((c.symptomsJson as { redFlags?: unknown } | null)?.redFlags as string[] | undefined) ?? []),
        ]),
      ]
        .filter((code) => labelOf.has(code))
        .map((code) => labelOf.get(code) as string),
      unknown: unknownCodes(c.symptomsJson),
      note: c.textRedacted,
      level: effectiveLevel(c),
      originalLevel: asLevel(c.triageLevel),
      override:
        override && c.overriddenAt
          ? {
              level: override,
              note: c.overrideNote ?? "",
              by: c.overriddenBy ? (overriders.get(c.overriddenBy) ?? null) : null,
              time: formatClock(c.overriddenAt),
            }
          : null,
      riskScore: c.riskScore,
      riskBand: asBand(c.riskBand),
      riskReasons: riskReasons(c.riskReasonsJson),
      familyMessage: c.familyMessage,
      familyAction: c.replyAction,
      fallbackUsed: c.fallbackUsed,
      alert: !alert
        ? { status: "none", acknowledgedBy: null, acknowledgedTime: null }
        : alert.acknowledgedAt
          ? { status: "acknowledged", acknowledgedBy: ackBy, acknowledgedTime: formatClock(alert.acknowledgedAt) }
          : { status: "open", acknowledgedBy: null, acknowledgedTime: null },
    };
  });

  await audit(db, {
    actor: `nurse:${session.nurseId}`,
    action: "patient.read",
    target: patient.id,
    meta: { view: "timeline", count: items.length },
  });

  return {
    patient: {
      id: patient.id,
      code: patient.code,
      treatmentDay: treatmentDay(patient.startDate, todayJakarta(now)),
      phase: patient.phase,
    },
    checkins: items,
    reviewStatus: { rules: rules.table.review_status, corpus: corpusReviewStatus() },
  };
}
