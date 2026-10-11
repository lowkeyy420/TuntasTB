import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { defaultRules } from "../triage/loadFiles";
import type { Level, Rules } from "../triage/types";
import { jakartaDate } from "./dates";
import {
  deriveSnapshot,
  symptomCodesFromJson,
  type HistoryCheckin,
  type TodayInput,
} from "./history";
import type { RiskSnapshot } from "./types";

export type RiskDb = PostgresJsDatabase<typeof schema>;

const LEVELS: readonly string[] = ["GREEN", "YELLOW", "RED"];
const asLevel = (s: string | null): Level | null => (s !== null && LEVELS.includes(s) ? (s as Level) : null);

/**
 * Reads the patient, their check-ins and pickups and derives the risk snapshot
 * for `asOf` (a Jakarta `YYYY-MM-DD` date). Pass `todayInput` when scoring a
 * check-in being made now; omit it for the nurse queue, which scores the most
 * recent check-in against the current date.
 */
export async function buildRiskSnapshot(
  db: RiskDb,
  patientId: string,
  asOf: string,
  todayInput?: TodayInput,
  rules: Rules = defaultRules(),
): Promise<RiskSnapshot> {
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId));
  if (patient === undefined) throw new Error(`patient not found: ${patientId}`);

  const rows = await db.select().from(schema.checkins).where(eq(schema.checkins.patientId, patientId));
  const pickups = await db.select().from(schema.pickups).where(eq(schema.pickups.patientId, patientId));

  const history: HistoryCheckin[] = rows.map((r) => ({
    occurredOn: r.occurredOn,
    createdAt: r.createdAt.getTime(),
    doseStatus: r.doseStatus,
    symptomCodes: symptomCodesFromJson(r.symptomsJson),
    textRedacted: r.textRedacted,
    triageLevel: asLevel(r.triageLevel),
  }));

  return deriveSnapshot({
    asOf,
    history,
    rules,
    today: todayInput,
    patient: {
      registeredOn: jakartaDate(patient.createdAt),
      hasPmo: patient.pmoContactHash !== null,
      pickups: pickups.map((p) => ({ dueDate: p.dueDate, done: p.doneAt !== null })),
    },
  });
}
