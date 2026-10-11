import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { puskesmas } from "@/lib/db/schema";
import type { FamilyPatient } from "@/lib/family-token";
import { todayJakarta } from "@/lib/time";
import { buildRiskSnapshot } from "@/lib/risk/snapshotDb";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { defaultManifest } from "@/lib/reply/manifestFile";
import type { SourceManifest } from "@/lib/reply/sources";
import { defaultRules } from "@/lib/triage/loadFiles";
import type { Rules } from "@/lib/triage/types";
import type { RiskPoints } from "@/lib/risk/types";
import { noEnrich, type Enrich } from "./enrich";
import { runPhaseA, runPhaseB, type PipelineDeps } from "./pipeline";
import { replyFromStored, toReply, type CheckinReply } from "./reply";
import type { CheckinBody } from "./schema";
import {
  applyEnrichment,
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
  manifest?: SourceManifest;
}

let riskPointsCache: RiskPoints | undefined;

/**
 * Rules-only dependencies (`noEnrich`). The API route uses `liveServiceDeps()`
 * from `./live`, which adds the Langflow step when a key is configured.
 */
export function defaultServiceDeps(): ServiceDeps {
  riskPointsCache ??= loadRiskPointsFromDir();
  return { rules: defaultRules(), riskPoints: riskPointsCache, enrich: noEnrich, manifest: defaultManifest() };
}

export type SubmitResult = { kind: "ok"; reply: CheckinReply } | { kind: "limit" };

/**
 * The check-in for an authenticated, consented patient: idempotency, daily
 * limit, then
 *   phase A: local triage, stored at once with its RED alert and audit entry;
 *   phase B: the flow, then an update that can only raise the level.
 * The reply is sent after phase B, so the family sees one final reply.
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

  // A repeated request returns the stored result and stores nothing.
  const stored = await findByClientId(db, patient.id, body.clientId);
  if (stored) return { kind: "ok", reply: replyFromStored(stored, contact, deps.rules.table) };
  if ((await countReceivedOn(db, patient.id, receivedOn)) >= DAILY_LIMIT) return { kind: "limit" };

  const pipelineDeps: PipelineDeps = {
    rules: deps.rules,
    riskPoints: deps.riskPoints,
    enrich: deps.enrich,
    manifest: deps.manifest,
    loadHistory: (patientId) => loadHistory(db, patientId),
    buildSnapshot: (patientId, asOf, today) => buildRiskSnapshot(db, patientId, asOf, today, deps.rules),
  };

  // Phase A: no network before the row (and a RED alert) exists.
  const a = await runPhaseA(
    { patient: { id: patient.id, startDate: patient.startDate }, contact, body, now },
    pipelineDeps,
  );
  let saved;
  try {
    saved = await saveCheckin(db, {
      patientId: patient.id,
      puskesmasId: patient.puskesmasId,
      clientId: body.clientId,
      draft: a.draft,
      receivedAt: now,
      receivedOn,
    });
  } catch (e) {
    if (e instanceof DailyLimitError) return { kind: "limit" };
    throw e;
  }
  if (saved.kind === "existing") {
    return { kind: "ok", reply: replyFromStored(saved.row, contact, deps.rules.table) };
  }

  // Phase B (only when there is something for the flow to read; otherwise
  // phase A was already final).
  if (!a.callFlow) {
    return { kind: "ok", reply: toReply(saved.row.id, a.draft.level, a.draft.reply, contact, a.draft.fallbackUsed) };
  }
  const b = await runPhaseB(a, pipelineDeps);
  try {
    await applyEnrichment(db, {
      checkinId: saved.row.id,
      patientId: patient.id,
      puskesmasId: patient.puskesmasId,
      draft: b.draft,
      meta: b.meta,
    });
  } catch {
    // The row keeps its phase A values (correct local level, marked fallback).
    return { kind: "ok", reply: toReply(saved.row.id, a.draft.level, a.draft.reply, contact, true) };
  }
  return {
    kind: "ok",
    reply: toReply(saved.row.id, b.draft.level, b.draft.reply, contact, b.draft.fallbackUsed),
  };
}
