"use client";

import { useEffect } from "react";

/** Build files this page has loaded so far, for the worker to keep. */
function loadedAssets(): string[] {
  return performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((name) => new URL(name).pathname.startsWith("/_next/static/"));
}

/**
 * Registers the family area's service worker (production builds only: in
 * development, cached build files would go stale on every edit). Once it is
 * active the page hands it its own address and the build files it loaded, so
 * the link opens without signal after one online visit. Also asks for a
 * Background Sync wake-up where the browser supports it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;

    const remember = async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      if (cancelled) return;
      registration.active?.postMessage({
        type: "remember",
        page: location.pathname,
        assets: loadedAssets(),
      });
      const sync = (registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }).sync;
      await sync?.register("flush-outbox").catch(() => undefined);
    };

    // Wait for the page's own files (including fonts) to finish loading first.
    const start = () => void remember().catch(() => undefined);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, []);
  return null;
}
