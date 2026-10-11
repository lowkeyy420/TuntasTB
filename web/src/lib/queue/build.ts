import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { checkins, patients, pickups } from "@/lib/db/schema";
import { copy } from "@/copy/nurse.id";
import { buildNurseLine } from "@/lib/reply/nurseLine";
import { addDays, jakartaDate } from "@/lib/risk/dates";
import { deriveSnapshot, latestPerDay, persistenceDays, symptomCodesFromJson, type HistoryCheckin } from "@/lib/risk/history";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { scoreRisk } from "@/lib/risk/score";
import type { RiskPoints } from "@/lib/risk/types";
import { treatmentDay } from "@/lib/time";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Level, Rules } from "@/lib/triage/types";
import { suggestAction } from "./suggest";
import type { QueueEntry } from "./types";

type StoredCheckin = typeof checkins.$inferSelect;

/** How far back the queue reads check-ins: enough for a 7-day persistence run and the miss cap. */
export const QUEUE_WINDOW_DAYS = 14;

export interface QueueOptions {
  /**
   * `stored`: use the one-line reason saved with the latest check-in when the
   * risk factors still match (nurse console). `deterministic`: always build it
   * from codes and factors, so no stored text can reach the caller (internal API).
   */
  reasonSource?: "stored" | "deterministic";
  rules?: Rules;
  riskPoints?: RiskPoints;
}

let pointsCache: RiskPoints | undefined;

const LEVELS: readonly string[] = ["GREEN", "YELLOW", "RED"];
const asLevel = (s: string | null): Level | null => (s !== null && LEVELS.includes(s) ? (s as Level) : null);

/** Level the queue uses for a check-in: the nurse's override, else the stored triage level. */
export const effectiveLevel = (row: Pick<StoredCheckin, "overrideLevel" | "triageLevel">): Level | null =>
  asLevel(row.overrideLevel) ?? asLevel(row.triageLevel);

function toHistory(row: StoredCheckin): HistoryCheckin {
  return {
    occurredOn: row.occurredOn,
    createdAt: row.createdAt.getTime(),
    doseStatus: row.doseStatus,
    symptomCodes: symptomCodesFromJson(row.symptomsJson),
    textRedacted: row.textRedacted,
    triageLevel: effectiveLevel(row),
  };
}

const factorsOf = (json: unknown): string[] =>
  (Array.isArray(json) ? json : [])
    .map((r) => (r as { factor?: unknown }).factor)
    .filter((f): f is string => typeof f === "string")
    .sort();

/**
 * The ranked queue of a Puskesmas for the date `asOf` (Jakarta `YYYY-MM-DD`):
 * every patient scored with the queue-time risk path, so silence and missed
 * pickups raise a patient without a new check-in. A pure function of the
 * stored data and the date.
 *
 * Order: score descending, then latest check-in newest first (patients who
 * never reported last), then code ascending, so the order is total and stable.
 *
 * Four reads however many patients there are: patients, check-ins of the last
 * 14 days, the last check-in of patients silent for longer, open pickups.
 */
export async function buildQueue(
  db: Pick<Database, "select" | "selectDistinctOn">,
  puskesmasId: string,
  asOf: string,
  options: QueueOptions = {},
): Promise<QueueEntry[]> {
  const rules = options.rules ?? defaultRules();
  const points = options.riskPoints ?? (pointsCache ??= loadRiskPointsFromDir());
  const source = options.reasonSource ?? "stored";

  const people = await db.select().from(patients).where(eq(patients.puskesmasId, puskesmasId));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);

  const recent = await db
    .select()
    .from(checkins)
    .where(
      and(
        inArray(checkins.patientId, ids),
        gte(checkins.occurredOn, addDays(asOf, -QUEUE_WINDOW_DAYS)),
        lte(checkins.occurredOn, asOf),
      ),
    );
  const byPatient = new Map<string, StoredCheckin[]>();
  for (const row of recent) byPatient.set(row.patientId, [...(byPatient.get(row.patientId) ?? []), row]);

  // Patients with nothing in the window may still have an older last check-in.
  const quiet = ids.filter((id) => !byPatient.has(id));
  if (quiet.length > 0) {
    const older = await db
      .selectDistinctOn([checkins.patientId])
      .from(checkins)
      .where(and(inArray(checkins.patientId, quiet), lte(checkins.occurredOn, asOf)))
      .orderBy(asc(checkins.patientId), desc(checkins.occurredOn), desc(checkins.createdAt));
    for (const row of older) byPatient.set(row.patientId, [row]);
  }

  const open = await db
    .select({ patientId: pickups.patientId, dueDate: pickups.dueDate })
    .from(pickups)
    .where(and(inArray(pickups.patientId, ids), isNull(pickups.doneAt)));
  const openByPatient = new Map<string, { dueDate: string; done: boolean }[]>();
  for (const p of open) {
    openByPatient.set(p.patientId, [...(openByPatient.get(p.patientId) ?? []), { dueDate: p.dueDate, done: false }]);
  }

  const entries = people.map((patient): QueueEntry => {
    const rows = byPatient.get(patient.id) ?? [];
    const history = rows.map(toHistory);
    const snapshot = deriveSnapshot({
      asOf,
      history,
      rules,
      patient: {
        registeredOn: jakartaDate(patient.createdAt),
        hasPmo: patient.pmoContactHash !== null,
        pickups: openByPatient.get(patient.id) ?? [],
      },
    });
    const result = scoreRisk(snapshot, points);

    // The most recent check-in on or before asOf (the one the snapshot scored).
    const lastRow = [...rows]
      .filter((r) => r.occurredOn <= asOf)
      .sort((a, b) => (a.occurredOn === b.occurredOn ? b.createdAt.getTime() - a.createdAt.getTime() : a.occurredOn < b.occurredOn ? 1 : -1))[0];

    let reason = "";
    if (lastRow) {
      const sameFactors = factorsOf(lastRow.riskReasonsJson).join() === result.reasons.map((r) => r.factor).sort().join();
      if (source === "stored" && sameFactors && lastRow.nurseLine) {
        reason = lastRow.nurseLine;
      } else {
        const earlier = latestPerDay(history).filter((h) => h.occurredOn < lastRow.occurredOn);
        const codes = symptomCodesFromJson(lastRow.symptomsJson);
        const durations: Record<string, number> = {};
        for (const code of codes) durations[code] = persistenceDays(code, lastRow.occurredOn, earlier);
        reason = buildNurseLine({ symptoms: codes, unknown: [], durations, reasons: result.reasons });
      }
    } else {
      reason = buildNurseLine({ symptoms: [], unknown: [], durations: {}, reasons: result.reasons });
    }
    if (reason === "") reason = lastRow ? copy.queue.reasonNone : copy.queue.neverReported;

    return {
      patientId: patient.id,
      code: patient.code,
      treatmentDay: treatmentDay(patient.startDate, asOf),
      score: result.score,
      band: result.band,
      level: snapshot.level,
      overridden: lastRow?.overrideLevel != null,
      reasons: result.reasons,
      reason,
      suggestedAction: suggestAction(snapshot, result.score),
      latestCheckinAt: lastRow?.createdAt ?? null,
      daysSinceLastCheckin: snapshot.daysSinceLastCheckin,
    };
  });

  return entries.sort(compareEntries);
}

/** Score desc, latest check-in newest first with nulls last, then code asc. */
export function compareEntries(a: QueueEntry, b: QueueEntry): number {
  if (a.score !== b.score) return b.score - a.score;
  const ta = a.latestCheckinAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const tb = b.latestCheckinAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (ta !== tb) return tb - ta;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}
