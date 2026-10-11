"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertItem } from "./types";

/** While the live connection is down, poll this often. 3 s plus the request stays under the 5 s promise. */
export const FALLBACK_POLL_MS = 3_000;
/** While the live connection is up, still poll this often as a safety net. */
export const SAFETY_POLL_MS = 30_000;
/** Consecutive connection errors before the fast fallback poll starts. */
export const ERRORS_BEFORE_POLLING = 2;
/** Wait before opening a new connection after the browser gave up on the old one. */
export const RECONNECT_MS = 3_000;

export type FeedMode = "connecting" | "live" | "polling";

export interface AlertFeedOptions {
  /** Called once for each alert that appears after the first load (sound, notification). */
  onCreated?: (alert: AlertItem) => void;
  /** Called when the server says the session is over. */
  onUnauthorized?: () => void;
}

export interface AlertFeed {
  /** Open alerts first (newest first), then acknowledged ones (newest acknowledgement first). */
  alerts: AlertItem[];
  openCount: number;
  /** The first load finished (successfully or not). */
  loaded: boolean;
  /** The first load failed and nothing is known yet. */
  error: boolean;
  mode: FeedMode;
  acknowledge: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const order = (items: Iterable<AlertItem>): AlertItem[] => {
  const all = [...items];
  const open = all.filter((a) => !a.acknowledged).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const log = all
    .filter((a) => a.acknowledged)
    .sort((a, b) => ((a.acknowledgedAt ?? "") < (b.acknowledgedAt ?? "") ? 1 : -1));
  return [...open, ...log];
};

/**
 * The nurse console's live view of RED alerts.
 *
 * Server-sent events (`/api/nurse/alerts/stream`) deliver new and acknowledged
 * alerts. If the connection errors twice in a row, or `EventSource` does not
 * exist, the hook polls `/api/nurse/alerts` every 3 seconds instead; while the
 * stream is up it still polls every 30 seconds as a safety net. Polls ask for
 * `poll=1` so the timer is not written to the audit log.
 */
export function useAlertFeed(options: AlertFeedOptions = {}): AlertFeed {
  const [items, setItems] = useState<ReadonlyMap<string, AlertItem>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<FeedMode>("connecting");

  const known = useRef(new Map<string, AlertItem>());
  const ready = useRef(false);
  const callbacks = useRef(options);
  callbacks.current = options;

  const commit = useCallback(() => setItems(new Map(known.current)), []);

  const upsert = useCallback(
    (alert: AlertItem) => {
      const isNew = !known.current.has(alert.id);
      known.current.set(alert.id, alert);
      commit();
      if (isNew && ready.current && !alert.acknowledged) callbacks.current.onCreated?.(alert);
    },
    [commit],
  );

  const fetchAll = useCallback(
    async (quiet: boolean): Promise<void> => {
      try {
        const res = await fetch(`/api/nurse/alerts?status=all${quiet ? "&poll=1" : ""}`, { cache: "no-store" });
        if (res.status === 401) {
          callbacks.current.onUnauthorized?.();
          return;
        }
        if (!res.ok) throw new Error("load");
        const body = (await res.json()) as { alerts: AlertItem[] };
        const next = new Map<string, AlertItem>();
        for (const a of body.alerts) {
          if (ready.current && !known.current.has(a.id) && !a.acknowledged) callbacks.current.onCreated?.(a);
          next.set(a.id, a);
        }
        known.current = next;
        commit();
        setError(false);
      } catch {
        if (!ready.current) setError(true);
      } finally {
        ready.current = true;
        setLoaded(true);
      }
    },
    [commit],
  );

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let fastTimer: ReturnType<typeof setInterval> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let errors = 0;

    const startFast = () => {
      if (!fastTimer) fastTimer = setInterval(() => void fetchAll(true), FALLBACK_POLL_MS);
    };
    const stopFast = () => {
      if (fastTimer) clearInterval(fastTimer);
      fastTimer = undefined;
    };

    const onAlert = (e: Event) => {
      const data = JSON.parse((e as MessageEvent<string>).data) as { alert?: AlertItem };
      if (data.alert) upsert(data.alert);
    };

    const connect = () => {
      if (disposed) return;
      const es = new EventSource("/api/nurse/alerts/stream");
      source = es;
      es.onopen = () => {
        errors = 0;
        stopFast();
        setMode("live");
      };
      es.addEventListener("alerts.snapshot", (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as { alerts: AlertItem[] };
        const open = new Set(data.alerts.map((a) => a.id));
        const stale = [...known.current.values()].some((a) => !a.acknowledged && !open.has(a.id));
        for (const a of data.alerts) upsert(a);
        // An alert we show as open is gone from the server's open list: it was taken while we were away.
        if (stale) void fetchAll(true);
      });
      es.addEventListener("alert.created", onAlert);
      es.addEventListener("alert.acknowledged", onAlert);
      es.onerror = () => {
        errors += 1;
        if (errors >= ERRORS_BEFORE_POLLING) {
          setMode("polling");
          startFast();
        }
        // The browser retries by itself, unless it gave up (for example after a 503).
        if (es.readyState === 2) {
          es.close();
          if (!disposed) reconnect = setTimeout(connect, RECONNECT_MS);
        }
      };
    };

    void fetchAll(false);
    const safety = setInterval(() => void fetchAll(true), SAFETY_POLL_MS);

    if (typeof EventSource === "undefined") {
      setMode("polling");
      startFast();
    } else {
      connect();
    }

    return () => {
      disposed = true;
      clearInterval(safety);
      stopFast();
      if (reconnect) clearTimeout(reconnect);
      source?.close();
    };
  }, [fetchAll, upsert]);

  const acknowledge = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/nurse/alerts/${id}/ack`, { method: "POST" });
        if (res.status === 401) {
          callbacks.current.onUnauthorized?.();
          return false;
        }
        if (!res.ok) return false;
        const body = (await res.json()) as { alert: AlertItem };
        upsert(body.alert);
        return true;
      } catch {
        return false;
      }
    },
    [upsert],
  );

  const alerts = order(items.values());
  return {
    alerts,
    openCount: alerts.filter((a) => !a.acknowledged).length,
    loaded,
    error: error && items.size === 0,
    mode,
    acknowledge,
    refresh: () => fetchAll(false),
  };
}
