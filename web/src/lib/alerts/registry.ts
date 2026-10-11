import type { AlertEvent } from "./notify";

export type AlertSubscriber = (event: AlertEvent) => void;

/**
 * In-memory fan-out of alert events to the open streams of ONE web process,
 * keyed by Puskesmas: a console only ever hears about its own Puskesmas.
 */
export class AlertRegistry {
  private readonly byPuskesmas = new Map<string, Set<AlertSubscriber>>();

  /** Registers a subscriber; the returned function unsubscribes it. */
  subscribe(puskesmasId: string, subscriber: AlertSubscriber): () => void {
    let set = this.byPuskesmas.get(puskesmasId);
    if (!set) {
      set = new Set();
      this.byPuskesmas.set(puskesmasId, set);
    }
    set.add(subscriber);
    return () => {
      const current = this.byPuskesmas.get(puskesmasId);
      current?.delete(subscriber);
      if (current?.size === 0) this.byPuskesmas.delete(puskesmasId);
    };
  }

  /** Delivers to the subscribers of the event's Puskesmas only. Returns how many were reached. */
  publish(event: AlertEvent): number {
    const set = this.byPuskesmas.get(event.puskesmasId);
    if (!set) return 0;
    let reached = 0;
    for (const subscriber of [...set]) {
      try {
        subscriber(event);
        reached++;
      } catch {
        // One broken stream must not stop the others.
      }
    }
    return reached;
  }

  /** Number of subscribers for a Puskesmas (tests, diagnostics). */
  size(puskesmasId: string): number {
    return this.byPuskesmas.get(puskesmasId)?.size ?? 0;
  }
}

const KEY = Symbol.for("tuntas.alerts.registry");

/** The process-wide registry (kept on `globalThis` so dev-mode module reloads share it). */
export function alertRegistry(): AlertRegistry {
  const g = globalThis as unknown as Record<symbol, AlertRegistry | undefined>;
  return (g[KEY] ??= new AlertRegistry());
}
