import { redactAndTriage } from "@/lib/triage/redactTriage";
import { maxLevel } from "@/lib/triage/engine";
import { parseDurationDays } from "@/lib/triage/match";
import { normalise } from "@/lib/triage/normalise";
import type { Level, Rules, TriageResult } from "@/lib/triage/types";
import { detectMoodFlags, mergeMoodFlags } from "@/lib/risk/mood";
import { latestPerDay, persistenceDays, type HistoryCheckin, type TodayInput } from "@/lib/risk/history";
import { scoreRisk } from "@/lib/risk/score";
import type { RiskPoints, RiskResult, RiskSnapshot } from "@/lib/risk/types";
import { composeReply, type ComposedReply } from "@/lib/reply/compose";
import { forbiddenFromLexicon } from "@/lib/reply/forbidden";
import { buildNurseLine, chooseNurseLine } from "@/lib/reply/nurseLine";
import { todayJakarta } from "@/lib/time";
import { checkinTreatmentDay, resolveOccurredOn } from "./dates";
import type { Enrich, EnrichResult } from "./enrich";
import type { CheckinBody } from "./schema";

/**
 * Steps 4 to 10 of the check-in pipeline (design.md): redact, local triage,
 * enrich seam, level, risk, reply. A function over injected dependencies
 * with no database access of its own, so it is unit-tested with fakes.
 */

export interface PipelineDeps {
  rules: Rules;
  riskPoints: RiskPoints;
  /** The seam for the Langflow call. Rules-only mode passes `noEnrich`. */
  enrich: Enrich;
  /** The patient's stored check-ins, for symptom persistence. */
  loadHistory: (patientId: string) => Promise<HistoryCheckin[]>;
  /** Risk snapshot for the check-in being made (reads the database in production). */
  buildSnapshot: (patientId: string, asOf: string, today: TodayInput) => Promise<RiskSnapshot>;
}

export interface PipelinePatient {
  id: string;
  startDate: string;
}

export interface PipelineInput {
  patient: PipelinePatient;
  contact: { name: string; phone: string };
  body: CheckinBody;
  now: Date;
}

/** Everything the store needs, and everything the reply needs. */
export interface CheckinDraft {
  occurredOn: string;
  treatmentDay: number;
  doseStatus: CheckinBody["doseStatus"];
  /** Stored as `symptoms_json`: chips as sent, symptoms found, unknown codes. */
  symptoms: { chips: string[]; symptoms: string[]; unknown: string[] };
  /** The only form of the note that leaves this function. */
  textRedacted: string;
  localLevel: Level;
  flowLevel: Level | null;
  level: Level;
  risk: RiskResult;
  nurseLine: string;
  reply: ComposedReply;
  fallbackUsed: boolean;
  rulesVersion: string;
}

const unique = (items: string[]) => [...new Set(items)].sort();

async function runEnrich(enrich: Enrich, args: Parameters<Enrich>[0]): Promise<EnrichResult | null> {
  try {
    return await enrich(args);
  } catch {
    // A failing flow never blocks a check-in: fall back to the local result.
    return null;
  }
}

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<CheckinDraft> {
  const { rules } = deps;
  const { patient, body } = input;

  // 2. Dates.
  const occurredOn = resolveOccurredOn(body.occurredOn, todayJakarta(input.now));
  const day = checkinTreatmentDay(patient.startDate, occurredOn);
  const chips = unique(body.chips);

  // 4. Redact. The raw note is passed to `redactAndTriage` only, which triages
  //    it locally (so redaction can never lower the level) and returns the
  //    redacted text; nothing below this block sees the raw string.
  const first = redactAndTriage({ chips, rawText: body.text }, rules);
  const textRedacted = first.redactedText;

  // 5. Local triage, with how long each symptom has already lasted.
  const history = await deps.loadHistory(patient.id);
  const earlier = latestPerDay(history.filter((h) => h.occurredOn < occurredOn));
  const persistence: Record<string, number> = {};
  for (const code of first.result.symptoms) persistence[code] = persistenceDays(code, occurredOn, earlier);
  const local: TriageResult = redactAndTriage(
    { chips, rawText: body.text, persistenceDays: persistence },
    rules,
  ).result;

  // 6. The seam. Only redacted text goes in.
  const flow = await runEnrich(deps.enrich, {
    patientId: patient.id,
    treatmentDay: day,
    doseStatus: body.doseStatus,
    chips,
    text: textRedacted,
    local,
  });

  // 7. The flow can only raise the level.
  const level = flow ? maxLevel(local.level, flow.level) : local.level;

  // 8. Risk.
  const moodFlags = mergeMoodFlags(detectMoodFlags(textRedacted, rules), flow?.moodFlags ?? []);
  const statedDays = parseDurationDays(normalise(textRedacted), rules.durations);
  const stated: Record<string, number> = {};
  if (statedDays > 0) for (const code of local.symptoms) stated[code] = statedDays;
  const snapshot = await deps.buildSnapshot(patient.id, occurredOn, {
    doseStatus: body.doseStatus,
    moodFlags,
    symptomCodes: local.symptoms,
    statedDurationDays: stated,
    level,
  });
  const risk = scoreRisk(snapshot, deps.riskPoints);

  // 10. Reply and nurse line.
  const forbidden = forbiddenFromLexicon(rules.lexicon);
  const durations: Record<string, number> = {};
  for (const code of local.symptoms) durations[code] = Math.max(persistence[code] ?? 0, stated[code] ?? 0);
  const nurseLine = chooseNurseLine(
    flow?.nurseLine,
    buildNurseLine({ symptoms: local.symptoms, unknown: local.unknown, durations, reasons: risk.reasons }),
    forbidden,
  );
  const fallbackUsed = flow === null;
  const reply = composeReply({
    level,
    flowLevel: flow?.level ?? null,
    generated: flow?.generated ?? null,
    table: rules.table,
    contact: input.contact,
    fallbackUsed,
    stopIntent: moodFlags.stopIntent,
    doseMissed: body.doseStatus !== "yes",
    noSymptom: level === "GREEN" && local.decidedBy === "no_symptoms",
    forbidden,
  });

  return {
    occurredOn,
    treatmentDay: day,
    doseStatus: body.doseStatus,
    symptoms: { chips, symptoms: local.symptoms, unknown: local.unknown },
    textRedacted,
    localLevel: local.level,
    flowLevel: flow?.level ?? null,
    level,
    risk,
    nurseLine,
    reply,
    fallbackUsed,
    rulesVersion: local.rulesVersion,
  };
}
