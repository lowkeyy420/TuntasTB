import { redactAndTriage } from "@/lib/triage/redactTriage";
import { maxLevel, triage } from "@/lib/triage/engine";
import { parseDurationDays } from "@/lib/triage/match";
import { normalise } from "@/lib/triage/normalise";
import type { Level, Rules, TriageResult } from "@/lib/triage/types";
import { detectMoodFlags, mergeMoodFlags, type MoodFlags } from "@/lib/risk/mood";
import { latestPerDay, persistenceDays, type HistoryCheckin, type TodayInput } from "@/lib/risk/history";
import { scoreRisk } from "@/lib/risk/score";
import type { RiskPoints, RiskResult, RiskSnapshot } from "@/lib/risk/types";
import { composeReply, type ComposedReply } from "@/lib/reply/compose";
import { forbiddenFromLexicon } from "@/lib/reply/forbidden";
import { buildNurseLine, chooseNurseLine } from "@/lib/reply/nurseLine";
import { BUILTIN_MANIFEST, type SourceManifest } from "@/lib/reply/sources";
import type { FlowOutput } from "@/lib/langflow/flowSchema";
import { todayJakarta } from "@/lib/time";
import { combineFlowLevel } from "./combine";
import { checkinTreatmentDay, resolveOccurredOn } from "./dates";
import { checkQuotes, needsFlow, safeEnrich, type Enrich, type EnrichFailure, type EnrichInput } from "./enrich";
import type { CheckinBody } from "./schema";

/**
 * The check-in pipeline in two phases (add-symptom-extraction design,
 * "Two-phase pipeline"). Functions over injected dependencies with no
 * database access of their own, so they are unit-tested with fakes.
 *
 *  - Phase A (no network): redact, local triage, risk, reply. The caller
 *    stores this draft at once, with its RED alert and audit entry, so a
 *    local RED is never delayed by the flow.
 *  - Phase B: the flow call (skipped when there is nothing to read), then the
 *    combined level, which can only be the same or higher than phase A's.
 */

export interface PipelineDeps {
  rules: Rules;
  riskPoints: RiskPoints;
  /** The Langflow step. Rules-only mode passes `noEnrich`. */
  enrich: Enrich;
  /** The patient's stored check-ins, for symptom persistence. */
  loadHistory: (patientId: string) => Promise<HistoryCheckin[]>;
  /** Risk snapshot for the check-in being made (reads the database in production). */
  buildSnapshot: (patientId: string, asOf: string, today: TodayInput) => Promise<RiskSnapshot>;
  /** Citable corpus sections (`corpus/manifest.json` in production). */
  manifest?: SourceManifest;
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
  /** Stored as `symptoms_json`: chips as sent, symptoms found, red-flag codes found (the nurse alert lists them), unknown codes. */
  symptoms: { chips: string[]; symptoms: string[]; redFlags: string[]; unknown: string[] };
  /** The only form of the note that leaves this module. */
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

/** What phase B needs from phase A. Holds the redacted note only. */
export interface PhaseA {
  draft: CheckinDraft;
  local: TriageResult;
  /** Earlier check-ins (latest per day), for the persistence of codes the flow adds. */
  earlier: HistoryCheckin[];
  persistence: Record<string, number>;
  stated: Record<string, number>;
  statedDays: number;
  moodLocal: MoodFlags;
  snapshot: RiskSnapshot;
  contact: { name: string; phone: string };
  callFlow: boolean;
  enrichInput: EnrichInput;
}

/** `checkin.enrich` audit fields. No text. */
export interface EnrichMeta {
  called: boolean;
  flowLevel: Level | null;
  finalLevel: Level;
  fallbackReason: EnrichFailure | null;
}

const unique = (items: string[]) => [...new Set(items)].sort();

interface ReplyArgs {
  level: Level;
  flow: FlowOutput | null;
  fallbackUsed: boolean;
  symptoms: string[];
  unknown: string[];
  durations: Record<string, number>;
  risk: RiskResult;
  stopIntent: boolean;
  doseStatus: CheckinBody["doseStatus"];
  noSymptom: boolean;
  contact: { name: string; phone: string };
}

function replyAndLine(a: ReplyArgs, deps: PipelineDeps): { reply: ComposedReply; nurseLine: string } {
  const forbidden = forbiddenFromLexicon(deps.rules.lexicon);
  const message = a.flow?.family_message.trim() ?? "";
  const nurseLine = chooseNurseLine(
    a.flow?.nurse_line || null,
    buildNurseLine({ symptoms: a.symptoms, unknown: a.unknown, durations: a.durations, reasons: a.risk.reasons }),
    forbidden,
  );
  const reply = composeReply({
    level: a.level,
    flowLevel: a.flow?.level ?? null,
    generated: a.flow && message !== "" ? { text: message, citations: a.flow.citations } : null,
    table: deps.rules.table,
    contact: a.contact,
    fallbackUsed: a.fallbackUsed,
    stopIntent: a.stopIntent,
    doseMissed: a.doseStatus !== "yes",
    noSymptom: a.noSymptom,
    symptoms: a.symptoms,
    manifest: deps.manifest ?? BUILTIN_MANIFEST,
    forbidden,
  });
  return { reply, nurseLine };
}

/** Phase A: local result only, no network. Stored immediately by the caller. */
export async function runPhaseA(input: PipelineInput, deps: PipelineDeps): Promise<PhaseA> {
  const { rules } = deps;
  const { patient, body } = input;

  // Dates.
  const occurredOn = resolveOccurredOn(body.occurredOn, todayJakarta(input.now));
  const day = checkinTreatmentDay(patient.startDate, occurredOn);
  const chips = unique(body.chips);

  // Redact. The raw note is passed to `redactAndTriage` only, which triages
  // it locally (so redaction can never lower the level) and returns the
  // redacted text; nothing below this block sees the raw string.
  const first = redactAndTriage({ chips, rawText: body.text }, rules);
  const textRedacted = first.redactedText;

  // Local triage, with how long each symptom has already lasted.
  const history = await deps.loadHistory(patient.id);
  const earlier = latestPerDay(history.filter((h) => h.occurredOn < occurredOn));
  const persistence: Record<string, number> = {};
  for (const code of first.result.symptoms) persistence[code] = persistenceDays(code, occurredOn, earlier);
  const local: TriageResult = redactAndTriage(
    { chips, rawText: body.text, persistenceDays: persistence },
    rules,
  ).result;

  // Risk.
  const moodLocal = detectMoodFlags(textRedacted, rules);
  const statedDays = parseDurationDays(normalise(textRedacted), rules.durations);
  const stated: Record<string, number> = {};
  if (statedDays > 0) for (const code of local.symptoms) stated[code] = statedDays;
  const snapshot = await deps.buildSnapshot(patient.id, occurredOn, {
    doseStatus: body.doseStatus,
    moodFlags: moodLocal,
    symptomCodes: local.symptoms,
    statedDurationDays: stated,
    level: local.level,
  });
  const risk = scoreRisk(snapshot, deps.riskPoints);

  // Phase A is marked as fallback until phase B has run: if the process dies
  // in between, the row keeps a correct local level tagged "fallback". With no
  // flow call to come (no note, known chips), phase A is already final.
  const knownCodes = new Set(rules.table.symptoms.map((s) => s.code));
  const callFlow = needsFlow(textRedacted, chips, knownCodes);
  const durations: Record<string, number> = {};
  for (const code of local.symptoms) durations[code] = Math.max(persistence[code] ?? 0, stated[code] ?? 0);
  const { reply, nurseLine } = replyAndLine(
    {
      level: local.level,
      flow: null,
      fallbackUsed: callFlow,
      symptoms: local.symptoms,
      unknown: local.unknown,
      durations,
      risk,
      stopIntent: moodLocal.stopIntent,
      doseStatus: body.doseStatus,
      noSymptom: local.level === "GREEN" && local.decidedBy === "no_symptoms",
      contact: input.contact,
    },
    deps,
  );

  return {
    draft: {
      occurredOn,
      treatmentDay: day,
      doseStatus: body.doseStatus,
      symptoms: { chips, symptoms: local.symptoms, redFlags: local.redFlags, unknown: local.unknown },
      textRedacted,
      localLevel: local.level,
      flowLevel: null,
      level: local.level,
      risk,
      nurseLine,
      reply,
      fallbackUsed: callFlow,
      rulesVersion: local.rulesVersion,
    },
    local,
    earlier,
    persistence,
    stated,
    statedDays,
    moodLocal,
    snapshot,
    contact: input.contact,
    callFlow,
    enrichInput: {
      text: textRedacted,
      chips,
      doseStatus: body.doseStatus,
      treatmentDay: day,
      context: {
        persistence_days: persistence,
        consecutive_missed_before: snapshot.consecutiveMissedBefore,
        missed_pickup: snapshot.missedPickup,
        has_pmo: snapshot.hasPmo,
        days_since_last_checkin: snapshot.daysSinceLastCheckin,
      },
      rulesVersion: local.rulesVersion,
    },
  };
}

/**
 * Phase B: the flow call and the combined result. The returned level is never
 * lower than phase A's (`combineFlowLevel` starts from the local level).
 */
export async function runPhaseB(a: PhaseA, deps: PipelineDeps): Promise<{ draft: CheckinDraft; meta: EnrichMeta }> {
  const { rules } = deps;
  const { local, draft: base } = a;
  const knownCodes = new Set(rules.table.symptoms.map((s) => s.code));

  const outcome = a.callFlow ? await safeEnrich(deps.enrich, a.enrichInput) : null;
  const flow = outcome?.ok ? outcome.output : null;
  const checked = flow ? checkQuotes(flow.extracted, base.textRedacted, knownCodes) : null;

  // Level: max(local, flow, floor); YELLOW floor on failure; local when not called.
  const combined = combineFlowLevel(
    local.level,
    flow && checked
      ? {
          level: flow.level,
          extracted: {
            symptoms: checked.symptoms,
            unknown_symptoms: checked.unknown,
            confidence: checked.confidence,
          },
        }
      : null,
    knownCodes,
    a.callFlow,
  );

  // The app's own rules over what extraction found (rules decide, here too).
  let symptoms = local.symptoms;
  let redFlags = local.redFlags;
  let unknown = local.unknown;
  const persistence = { ...a.persistence };
  let level = combined.level;
  if (checked) {
    for (const s of checked.symptoms) {
      persistence[s.code] ??= persistenceDays(s.code, base.occurredOn, a.earlier);
    }
    const again = triage(
      {
        chips: base.symptoms.chips,
        text: base.textRedacted,
        extracted: checked.symptoms,
        unknownSymptoms: checked.unknown,
        persistenceDays: persistence,
      },
      rules,
    );
    level = maxLevel(level, again.level);
    symptoms = unique([...local.symptoms, ...again.symptoms]);
    redFlags = unique([...local.redFlags, ...again.redFlags]);
    unknown = unique([...local.unknown, ...again.unknown]);
  }
  level = maxLevel(level, base.level); // never lower than what phase A stored

  // Risk: same snapshot, OR-ed mood flags, final level, durations the flow added.
  const mood = mergeMoodFlags(a.moodLocal, checked?.moodFlags ?? []);
  const durations: Record<string, number> = {};
  for (const code of symptoms) {
    const extracted = checked?.symptoms.find((s) => s.code === code)?.durationDays ?? 0;
    durations[code] = Math.max(persistence[code] ?? 0, a.stated[code] ?? (a.statedDays > 0 ? a.statedDays : 0), extracted);
  }
  const risk = scoreRisk(
    {
      ...a.snapshot,
      stopIntent: mood.stopIntent,
      stigma: mood.stigma,
      level,
      maxPersistenceDays: Math.max(a.snapshot.maxPersistenceDays, ...Object.values(durations)),
    },
    deps.riskPoints,
  );

  const fallbackUsed = combined.fallback;
  const { reply, nurseLine } = replyAndLine(
    {
      level,
      flow,
      fallbackUsed,
      symptoms,
      unknown,
      durations,
      risk,
      stopIntent: mood.stopIntent,
      doseStatus: base.doseStatus,
      noSymptom: level === "GREEN" && local.decidedBy === "no_symptoms" && symptoms.length === 0,
      contact: a.contact,
    },
    deps,
  );

  return {
    draft: {
      ...base,
      symptoms: { chips: base.symptoms.chips, symptoms, redFlags, unknown },
      flowLevel: flow?.level ?? null,
      level,
      risk,
      nurseLine,
      reply,
      fallbackUsed,
    },
    meta: {
      called: a.callFlow,
      flowLevel: flow?.level ?? null,
      finalLevel: level,
      fallbackReason: outcome && !outcome.ok ? outcome.reason : null,
    },
  };
}

/** Both phases in one call (tests, and anything that does not store in between). */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<CheckinDraft> {
  return (await runPhaseB(await runPhaseA(input, deps), deps)).draft;
}
