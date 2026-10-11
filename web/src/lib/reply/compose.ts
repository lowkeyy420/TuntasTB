import { copy } from "@/copy/family.id";
import type { Level, TriageTable } from "@/lib/triage/types";
import { DEFAULT_FORBIDDEN, type ForbiddenOutput } from "./forbidden";
import { checkGenerated, type RejectReason } from "./filter";
import { BUILTIN_MANIFEST, defaultCitation, type Citation, type SourceManifest } from "./sources";

/** What the flow produced for the explanation (S03/S06). Absent in rules-only mode. */
export interface GeneratedExplanation {
  text: string | null | undefined;
  citations: readonly Citation[];
}

export interface ComposeInput {
  /** Final triage level (never lowered by anything in this module). */
  level: Level;
  /** Level the generated text was written for; compared with `level` by the filter. */
  flowLevel?: Level | null;
  generated?: GeneratedExplanation | null;
  table: Pick<TriageTable, "levels" | "fallback_warning_id">;
  contact: { name: string; phone: string };
  /** True whenever no flow result was used; adds the standing warning. */
  fallbackUsed: boolean;
  /** The check-in said something like "sudah sembuh" or "mau berhenti". */
  stopIntent?: boolean;
  /** Dose status was "no" or "partial". */
  doseMissed?: boolean;
  /** No known or unknown symptom at all. */
  noSymptom?: boolean;
  manifest?: SourceManifest;
  forbidden?: ForbiddenOutput;
}

export type ReplaceReason = RejectReason | "no_generated";

export interface ComposedReply {
  /** The explanation: generated when it passed the filter, else the static text. */
  explanation: string;
  /** Exactly one action, fixed by the level (never from the model). */
  action: string;
  /** The single citation shown as "Sumber: ...". */
  citations: Citation[];
  /** "Puskesmas <name>, telepon <number>." Always the last line. */
  contactLine: string;
  /** Standing warning, shown when the flow was not used. */
  warning: string | null;
  /** True when the static template (not a generated explanation) is shown. */
  templateUsed: boolean;
  /** Why a generated explanation was not shown; null when it was shown. */
  replaceReason: ReplaceReason | null;
}

/** The fixed action for a level, with the stop-intent variant for YELLOW. */
export function actionFor(
  level: Level,
  table: Pick<TriageTable, "levels">,
  stopIntent: boolean,
): string {
  if (level === "YELLOW" && stopIntent) return copy.reply.variants.stopIntentAction;
  return table.levels[level].action_id;
}

/** The static explanation for a level, with the two GREEN variants for a check-in with no symptom. */
export function templateFor(
  level: Level,
  table: Pick<TriageTable, "levels">,
  opts: { noSymptom?: boolean; doseMissed?: boolean },
): string {
  if (level === "GREEN" && opts.noSymptom) {
    return opts.doseMissed ? copy.reply.variants.doseMissed : copy.reply.variants.noSymptom;
  }
  return table.levels[level].message_id;
}

/**
 * Builds the family reply:
 *
 *   <explanation>   generated and filtered, or the level's static template
 *   <action>        always from the table (or its stop-intent variant)
 *   Sumber: <label> one citation
 *   <contact>       last
 *
 * The action is never taken from model output, which is how "one action" and
 * "matches the level" hold by construction.
 */
export function composeReply(input: ComposeInput): ComposedReply {
  const manifest = input.manifest ?? BUILTIN_MANIFEST;
  const forbidden = input.forbidden ?? DEFAULT_FORBIDDEN;
  const action = actionFor(input.level, input.table, input.stopIntent ?? false);

  let templateUsed = true;
  let replaceReason: ReplaceReason | null = "no_generated";
  let explanation = templateFor(input.level, input.table, input);
  let citations: Citation[] = [defaultCitation(input.level, manifest)];

  if (input.generated) {
    const verdict = checkGenerated(input.generated.text, {
      level: input.level,
      flowLevel: input.flowLevel,
      citations: input.generated.citations,
      manifest,
      forbidden,
      action,
    });
    if (verdict.ok) {
      templateUsed = false;
      replaceReason = null;
      explanation = (input.generated.text as string).trim();
      const [cited] = input.generated.citations;
      citations = [{ id: cited.id, label: manifest[cited.id].label }];
    } else {
      replaceReason = verdict.reason;
    }
  }

  return {
    explanation,
    action,
    citations,
    contactLine: copy.contact(input.contact.name, input.contact.phone),
    warning: input.fallbackUsed ? input.table.fallback_warning_id : null,
    templateUsed,
    replaceReason,
  };
}
