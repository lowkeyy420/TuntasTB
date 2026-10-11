import type { AlertEvent } from "./notify";
import type { AlertRegistry } from "./registry";
import type { AlertItem } from "./service";

/** A comment line every 20 s keeps proxies from closing an idle connection. */
export const HEARTBEAT_MS = 20_000;

export interface AlertStreamOptions {
  puskesmasId: string;
  registry: AlertRegistry;
  /** Unacknowledged alerts of the Puskesmas, newest first. */
  loadOpen: () => Promise<AlertItem[]>;
  /** One alert by id, scoped to the Puskesmas; null when it does not exist there. */
  loadOne: (alertId: string) => Promise<AlertItem | null>;
  /** The request's signal: when the client goes away the stream releases everything. */
  signal?: AbortSignal;
  heartbeatMs?: number;
}

const encoder = new TextEncoder();

/** One server-sent event. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * The body of `GET /api/nurse/alerts/stream`.
 *
 * It subscribes first, then sends the current unacknowledged alerts
 * (`alerts.snapshot`), then `alert.created` / `alert.acknowledged` for its
 * Puskesmas. The channel carries ids only; every event's payload is read from
 * the database after the notification, and events are sent in arrival order.
 */
export function alertStream(options: AlertStreamOptions): ReadableStream<Uint8Array> {
  const { registry, puskesmasId, signal } = options;
  let release = () => undefined as void;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let ready = false;
      const waiting: AlertEvent[] = [];
      let chain: Promise<void> = Promise.resolve();
      const timer = setInterval(() => send(": ping\n\n"), options.heartbeatMs ?? HEARTBEAT_MS);
      let unsubscribe = () => undefined as void;

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(timer);
        signal?.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // already closed by the consumer
        }
      };
      release = close;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const deliver = (event: AlertEvent) => {
        chain = chain
          .then(async () => {
            const alert = await options.loadOne(event.alertId);
            if (alert) send(sseFrame(event.type, { alert }));
          })
          .catch(() => undefined);
      };

      unsubscribe = registry.subscribe(puskesmasId, (event) => {
        if (ready) deliver(event);
        else waiting.push(event);
      });
      signal?.addEventListener("abort", close, { once: true });
      if (signal?.aborted) return close();

      send("retry: 3000\n\n: connected\n\n");

      try {
        send(sseFrame("alerts.snapshot", { alerts: await options.loadOpen() }));
      } catch {
        return close(); // the client reconnects and tries again
      }
      ready = true;
      for (const event of waiting.splice(0)) deliver(event);
    },
    cancel() {
      release();
    },
  });
}
