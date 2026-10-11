import { copy } from "@/copy/nurse.id";
import type { RiskReason } from "@/lib/risk/types";
import { checkNurseLine } from "./filter";
import type { ForbiddenOutput } from "./forbidden";

export const MAX_NURSE_LINE = 120;

export interface NurseLineInput {
  /** Known symptom codes found in the check-in. */
  symptoms: readonly string[];
  /** Unknown codes or unmatched text; one generic part is added when no known symptom exists. */
  unknown: readonly string[];
  /** Days each symptom has lasted (history or stated in the note). */
  durations: Readonly<Record<string, number>>;
  /** Risk reasons, most important first (the scorer emits them in a fixed order). */
  reasons: readonly RiskReason[];
}

function symptomPart(code: string, days: number): string {
  const name = copy.nurseLine.symptoms[code] ?? code.replace(/_/g, " ");
  return days >= 2 ? `${name} ${copy.nurseLine.days(days)}` : name;
}

function reasonPart(reason: RiskReason): string | null {
  const template = copy.nurseLine.factors[reason.factor];
  if (!template) return null;
  const n = /\d+/.exec(reason.text)?.[0] ?? "";
  return template.replace("{n}", n);
}

/**
 * Deterministic one-line reason: the symptom with its duration first
 * ("mual 7 hari"), then the most important risk reasons in short form,
 * joined with " + " and kept within 120 characters. Parts that do not fit
 * are dropped whole, never cut in the middle.
 */
export function buildNurseLine(input: NurseLineInput): string {
  const parts: string[] = input.symptoms.map((code) => symptomPart(code, input.durations[code] ?? 0));
  if (parts.length === 0 && input.unknown.length > 0) parts.push(copy.nurseLine.otherSymptom);
  for (const reason of input.reasons) {
    const part = reasonPart(reason);
    if (part) parts.push(part);
  }

  let line = "";
  for (const part of parts) {
    const next = line === "" ? part : `${line}${copy.nurseLine.separator}${part}`;
    if (next.length > MAX_NURSE_LINE) {
      if (line === "") line = part.slice(0, MAX_NURSE_LINE);
      break;
    }
    line = next;
  }
  return line;
}

/**
 * The generated nurse line is used only when it is non-empty, within 120
 * characters and free of dosing and diagnosis wording; otherwise the
 * deterministic line is stored.
 */
export function chooseNurseLine(
  generated: string | null | undefined,
  deterministic: string,
  forbidden: ForbiddenOutput,
): string {
  const line = generated?.trim() ?? "";
  if (line === "" || line.length > MAX_NURSE_LINE) return deterministic;
  return checkNurseLine(line, forbidden).ok ? line : deterministic;
}
