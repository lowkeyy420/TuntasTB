/*
 * Service worker for the family area (/f/<token>).
 *
 * It makes a link that was opened online before open again with no signal:
 *  - the page itself (/f/<token>) is fetched network-first and kept; offline
 *    it is served from that copy. Only the SAME link's copy is ever served: a
 *    page carries its own link token, so another link's page must never
 *    stand in for it.
 *  - hashed build files (/_next/static/*) and the icon are cache-first.
 *  - nothing else is touched: API calls always go to the network, and the
 *    check-in outbox lives in IndexedDB (see src/lib/offline), not here.
 *
 * It never shows notifications.
 */
const VERSION = "tuntas-family-v1";
const PRECACHE = ["/icon.svg", "/manifest.webmanifest"];
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isFamilyPage(url) {
  return url.pathname === "/f" || url.pathname.startsWith("/f/");
}

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
}

function keep(request, response) {
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function familyPage(request) {
  try {
    return keep(request, await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS));
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    return new Response("Tidak ada sinyal. Buka tautan ini lagi saat ada sinyal.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function staticFile(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return keep(request, await fetch(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && isFamilyPage(url)) {
    event.respondWith(familyPage(request));
  } else if (isStatic(url)) {
    event.respondWith(staticFile(request));
  }
});

// The very first visit is not served through this worker (it was not installed yet), so the
// page tells the worker what it loaded: its own address and its build files. The worker
// keeps them, which is what lets the link open offline after a SINGLE online visit.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "remember") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      const page = new URL(data.page, self.location.origin);
      if (page.origin === self.location.origin && isFamilyPage(page)) {
        await cache.add(new Request(page.href, { cache: "reload" })).catch(() => undefined);
      }
      const assets = Array.isArray(data.assets) ? data.assets : [];
      await Promise.all(
        assets.map(async (href) => {
          const url = new URL(href, self.location.origin);
          if (url.origin === self.location.origin && isStatic(url) && !(await cache.match(url.href))) {
            await cache.add(url.href).catch(() => undefined);
          }
        }),
      );
    })(),
  );
});

// Background Sync, where the browser has it: wake any open page so it flushes the outbox.
// Pages also flush on load, on "online" and when they become visible again.
self.addEventListener("sync", (event) => {
  if (event.tag !== "flush-outbox") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "flush-outbox" }))),
  );
});
