import type { ComposedReply } from "@/lib/reply/compose";
import type { Citation } from "@/lib/reply/sources";
import type { Level, TriageTable } from "@/lib/triage/types";

/**
 * The response body of `POST /api/checkins`. The risk score is deliberately
 * absent: it is nurse-facing.
 */
export interface CheckinReply {
  checkinId: string;
  level: Level;
  /** The explanation (generated and filtered, or the static template). */
  message: string;
  /** Exactly one action, fixed by the level. */
  action: string;
  citations: Citation[];
  contact: { name: string; phone: string };
  fallbackUsed: boolean;
  /** Standing warning, present when the flow was not used. */
  warning: string | null;
}

/** Shapes a composed reply (see `lib/reply`) for the API. The composition itself lives in `lib/reply`. */
export function toReply(
  checkinId: string,
  level: Level,
  composed: ComposedReply,
  contact: { name: string; phone: string },
  fallbackUsed: boolean,
): CheckinReply {
  return {
    checkinId,
    level,
    message: composed.explanation,
    action: composed.action,
    citations: composed.citations,
    contact,
    fallbackUsed,
    warning: composed.warning,
  };
}

/** The columns of a stored check-in that make up its reply. */
export interface StoredReplyColumns {
  id: string;
  triageLevel: string | null;
  familyMessage: string | null;
  replyAction: string | null;
  citationsJson: unknown;
  fallbackUsed: boolean;
}

/** Rebuilds the reply of an already stored check-in, so a repeated request gets the same result. */
export function replyFromStored(
  row: StoredReplyColumns,
  contact: { name: string; phone: string },
  table: Pick<TriageTable, "fallback_warning_id">,
): CheckinReply {
  return {
    checkinId: row.id,
    level: (row.triageLevel ?? "YELLOW") as Level,
    message: row.familyMessage ?? "",
    action: row.replyAction ?? "",
    citations: Array.isArray(row.citationsJson) ? (row.citationsJson as Citation[]) : [],
    contact,
    fallbackUsed: row.fallbackUsed,
    warning: row.fallbackUsed ? table.fallback_warning_id : null,
  };
}
