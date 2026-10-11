"use client";

import { useEffect } from "react";
import { flush } from "./sync";

/**
 * Sends queued check-ins when the screen opens, when the connection returns
 * and when the page becomes visible again. Background Sync (a message from
 * the service worker) is one more trigger where the browser has it, never
 * the only one.
 */
export function useOutboxFlush(): void {
  useEffect(() => {
    const run = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "flush-outbox") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
}
