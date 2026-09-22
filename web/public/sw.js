// Minimal, safe service worker for installability + an offline app shell.
// - never touches API/data endpoints (auth stays correct, no stale data)
// - network-first for navigations so a new deploy shows immediately
// - cache-first for hashed static assets (safe: filenames change per build)
const CACHE = "laya-shell-v2";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // leave the API alone
  if (/^\/(admin|auth|v1|status|health)(\/|$)/.test(url.pathname)) return;

  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return resp;
        }),
    ),
  );
});
