/* Light Dey? service worker.
 *
 * What it does:
 *  - Pages: network first (so people always get the newest version when online), but if the network is slow
 *    or gone it shows the last copy of that page from this phone. If a page was never saved, it shows the
 *    home page, or the "No network" page.
 *  - App files (scripts, fonts, icons): saved the first time they are used, then served instantly. They have
 *    unique names per version, so this is safe and saves mobile data.
 *  - It never saves or touches anything from /api/, Supabase or Cloudflare: reports and live data always go to
 *    the real network (the app itself keeps a queue of reports made offline).
 *
 * Change VERSION to throw away old caches after a big change.
 */
const VERSION = "v1";
const PAGES = `ld-pages-${VERSION}`;
const ASSETS = `ld-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_ASSETS = 150;
const SLOW_NETWORK_MS = 5000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PAGES);
    try { await cache.add(new Request(OFFLINE_URL, { cache: "reload" })); } catch { /* installs anyway */ }
    // The bulb pictures (both styles, every state), so the home screen looks right offline whatever the status
    try { const assets = await caches.open(ASSETS); await Promise.all(["on", "weak", "off"].flatMap((s) => [`/bulb-${s}.webp?v=1`, s === "off" ? "/bulb-glass-off.webp?v=1" : `/bulb-lit-${s}.webp?v=1`]).map((u) => assets.add(new Request(u)).catch(() => {}))); } catch { /* installs anyway */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("ld-") && key !== PAGES && key !== ASSETS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Supabase, Cloudflare, fonts CDNs: not ours
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || /\.(?:png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(assetCacheFirst(req));
    return;
  }
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function page(req) {
  const cache = await caches.open(PAGES);
  const saved = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  });
  try {
    // If we have a saved copy, do not make people wait long on a bad network
    if (saved) {
      return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, SLOW_NETWORK_MS))]);
    }
    return await network;
  } catch {
    network.catch(() => {});                                          // let a slow fetch finish quietly and refresh the copy
    return saved
      || (await cache.match("/", { ignoreSearch: true }))
      || (await cache.match(OFFLINE_URL))
      || Response.error();
  }
}

async function assetCacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    cache.put(req, res.clone());
    trim(cache, MAX_ASSETS);
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

// Keep the cache from growing forever: drop the oldest entries beyond the limit
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// ---- Push alerts ("Light don come") ----
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* plain text or empty */ }
  event.waitUntil(self.registration.showNotification(d.title || "Light Dey?", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || "light-dey",
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { try { await c.navigate(url); } catch { /* cross-origin or closed */ } return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
