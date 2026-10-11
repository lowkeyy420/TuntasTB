import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { puskesmas } from "@/lib/db/schema";
import type { FamilyPatient } from "@/lib/family-token";
import { todayJakarta } from "@/lib/time";
import { buildRiskSnapshot } from "@/lib/risk/snapshotDb";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Rules } from "@/lib/triage/types";
import type { RiskPoints } from "@/lib/risk/types";
import { noEnrich, type Enrich } from "./enrich";
import { runPipeline, type PipelineDeps } from "./pipeline";
import { replyFromStored, toReply, type CheckinReply } from "./reply";
import type { CheckinBody } from "./schema";
import {
  countReceivedOn,
  DAILY_LIMIT,
  DailyLimitError,
  findByClientId,
  loadHistory,
  saveCheckin,
} from "./store";

export interface ServiceDeps {
  rules: Rules;
  riskPoints: RiskPoints;
  enrich: Enrich;
}

let riskPointsCache: RiskPoints | undefined;

/** Rules-only mode: local triage + risk + static reply. `enrich` is the seam for the flow. */
export function defaultServiceDeps(): ServiceDeps {
  riskPointsCache ??= loadRiskPointsFromDir();
  return { rules: defaultRules(), riskPoints: riskPointsCache, enrich: noEnrich };
}

export type SubmitResult = { kind: "ok"; reply: CheckinReply } | { kind: "limit" };

/**
 * Steps 3 to 10 of the pipeline for an authenticated, consented patient:
 * idempotency, daily limit, redact/triage/risk/reply, then one transaction.
 */
export async function submitCheckin(
  db: Database,
  patient: FamilyPatient,
  body: CheckinBody,
  deps: ServiceDeps = defaultServiceDeps(),
  now: Date = new Date(),
): Promise<SubmitResult> {
  const [pk] = await db
    .select({ name: puskesmas.name, phone: puskesmas.phone })
    .from(puskesmas)
    .where(eq(puskesmas.id, patient.puskesmasId));
  const contact = { name: pk?.name ?? "", phone: pk?.phone ?? "" };
  const receivedOn = todayJakarta(now);

  // 3. A repeated request returns the stored result and stores nothing.
  const stored = await findByClientId(db, patient.id, body.clientId);
  if (stored) return { kind: "ok", reply: replyFromStored(stored, contact, deps.rules.table) };
  if ((await countReceivedOn(db, patient.id, receivedOn)) >= DAILY_LIMIT) return { kind: "limit" };

  const pipelineDeps: PipelineDeps = {
    rules: deps.rules,
    riskPoints: deps.riskPoints,
    enrich: deps.enrich,
    loadHistory: (patientId) => loadHistory(db, patientId),
    buildSnapshot: (patientId, asOf, today) => buildRiskSnapshot(db, patientId, asOf, today, deps.rules),
  };
  const draft = await runPipeline(
    { patient: { id: patient.id, startDate: patient.startDate }, contact, body, now },
    pipelineDeps,
  );

  try {
    const saved = await saveCheckin(db, {
      patientId: patient.id,
      puskesmasId: patient.puskesmasId,
      clientId: body.clientId,
      draft,
      receivedAt: now,
      receivedOn,
    });
    if (saved.kind === "existing") {
      return { kind: "ok", reply: replyFromStored(saved.row, contact, deps.rules.table) };
    }
    return {
      kind: "ok",
      reply: toReply(saved.row.id, draft.level, draft.reply, contact, draft.fallbackUsed),
    };
  } catch (e) {
    if (e instanceof DailyLimitError) return { kind: "limit" };
    throw e;
  }
}
