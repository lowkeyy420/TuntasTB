import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db";

/** The Postgres NOTIFY channel that carries alert events between web processes. */
export const ALERT_CHANNEL = "alerts";

export type AlertEventType = "alert.created" | "alert.acknowledged";

/**
 * What travels on the channel: ids only, never patient data. A subscriber
 * reads the alert from the database by id, scoped to its own Puskesmas.
 */
export interface AlertEvent {
  type: AlertEventType;
  alertId: string;
  puskesmasId: string;
}

/**
 * Publishes an alert event with `pg_notify`. Call it INSIDE the transaction
 * that creates or acknowledges the alert: Postgres delivers a notification
 * only when the transaction commits, so a rolled-back alert is never announced.
 */
export async function notifyAlert(tx: Pick<Database, "execute">, event: AlertEvent): Promise<void> {
  await tx.execute(sql`select pg_notify(${ALERT_CHANNEL}, ${JSON.stringify(event)})`);
}

const TYPES: readonly string[] = ["alert.created", "alert.acknowledged"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses a channel payload; null when it is not a well-formed event. */
export function parseAlertEvent(payload: string): AlertEvent | null {
  try {
    const v = JSON.parse(payload) as Partial<AlertEvent> | null;
    if (
      v &&
      typeof v.type === "string" &&
      TYPES.includes(v.type) &&
      typeof v.alertId === "string" &&
      UUID.test(v.alertId) &&
      typeof v.puskesmasId === "string" &&
      UUID.test(v.puskesmasId)
    ) {
      return { type: v.type as AlertEventType, alertId: v.alertId, puskesmasId: v.puskesmasId };
    }
  } catch {
    // fall through
  }
  return null;
}
