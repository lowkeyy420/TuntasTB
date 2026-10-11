import { copy } from "@/copy/family.id";
import { composeReply } from "@/lib/reply/compose";
import { forbiddenFromLexicon } from "@/lib/reply/forbidden";
import { redactAndTriage } from "@/lib/triage/redactTriage";
import { detectMoodFlags } from "@/lib/risk/mood";
import type { Level, Rules } from "@/lib/triage/types";
import type { CheckinReply } from "@/lib/checkin/reply";
import type { DoseStatus } from "@/lib/checkin/schema";

/**
 * What a reply screen shows, whether it came from the server or was worked
 * out on the device while offline.
 */
export interface DisplayReply {
  level: Level;
  explanation: string;
  action: string;
  sourceLabel: string | null;
  /** Always the last line. */
  contactLine: string;
  warning: string | null;
}

export function displayFromServer(reply: CheckinReply): DisplayReply {
  return {
    level: reply.level,
    explanation: reply.message,
    action: reply.action,
    sourceLabel: reply.citations[0]?.label ?? null,
    contactLine: copy.contact(reply.contact.name, reply.contact.phone),
    warning: reply.warning,
  };
}

export interface ProvisionalInput {
  doseStatus: DoseStatus;
  chips: readonly string[];
  /** The note as typed. It is triaged and redacted here, on the device, and never leaves it. */
  text: string;
}

/**
 * The provisional reply shown while the check-in is queued: the same triage
 * module and rule files as the server, so the level never disagrees on rules.
 * The device cannot see earlier check-ins, so symptom persistence is unknown
 * here; the server's reply replaces this one after sync.
 *
 *  - non-RED: the level's static text plus the standing warning
 *  - RED: go to the Puskesmas or IGD today, the nurse has NOT been told yet,
 *    and the number to call
 */
export function provisionalReply(
  input: ProvisionalInput,
  rules: Rules,
  contact: { name: string; phone: string },
): DisplayReply {
  const { result, redactedText } = redactAndTriage(
    { chips: [...input.chips], rawText: input.text },
    rules,
  );
  const level = result.level;

  if (level === "RED") {
    const t = copy.reply.offline;
    return {
      level,
      explanation: t.redNotice,
      action: t.redAction,
      sourceLabel: null,
      contactLine: t.redCall(contact.phone),
      warning: null,
    };
  }

  const composed = composeReply({
    level,
    table: rules.table,
    contact,
    fallbackUsed: true,
    stopIntent: detectMoodFlags(redactedText, rules).stopIntent,
    doseMissed: input.doseStatus !== "yes",
    noSymptom: level === "GREEN" && result.decidedBy === "no_symptoms",
    forbidden: forbiddenFromLexicon(rules.lexicon),
  });
  return {
    level,
    explanation: composed.explanation,
    action: composed.action,
    sourceLabel: composed.citations[0]?.label ?? null,
    contactLine: composed.contactLine,
    warning: composed.warning,
  };
}
