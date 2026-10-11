import postgres from "postgres";
import { ALERT_CHANNEL, parseAlertEvent } from "./notify";
import { alertRegistry, type AlertRegistry } from "./registry";

/**
 * One dedicated Postgres connection per web process that LISTENs on the alert
 * channel and fans each event out to the registry. `postgres.listen`
 * reconnects and re-subscribes by itself after a dropped connection.
 */
export interface AlertListener {
  stop: () => Promise<void>;
}

export async function startAlertListener(
  databaseUrl: string,
  registry: AlertRegistry = alertRegistry(),
): Promise<AlertListener> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  await sql.listen(ALERT_CHANNEL, (payload) => {
    const event = parseAlertEvent(payload);
    if (event) registry.publish(event);
  });
  return { stop: () => sql.end({ timeout: 1 }) };
}

const KEY = Symbol.for("tuntas.alerts.listener");

/**
 * Starts the process-wide listener once. Concurrent callers share the same
 * start-up promise; a failed start is forgotten so the next stream retries.
 */
export function ensureAlertListener(databaseUrl: string): Promise<AlertListener> {
  const g = globalThis as unknown as Record<symbol, Promise<AlertListener> | undefined>;
  const existing = g[KEY];
  if (existing) return existing;
  const started = startAlertListener(databaseUrl).catch((e: unknown) => {
    g[KEY] = undefined;
    throw e;
  });
  g[KEY] = started;
  return started;
}
