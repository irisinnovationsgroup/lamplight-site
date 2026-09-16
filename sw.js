// Cache name carries the build stamp, so every deploy retires the previous cache.
const BUILD = "20260916-005617";
const CACHE = "lamplight-" + BUILD;
const ASSETS = ["./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type: "window"}))
      .then(list => list.forEach(c => c.postMessage({type: "updated", build: BUILD}))));
});

// NETWORK FIRST for the page and its data. The previous version answered
// `cached || fresh`, which pinned every returning reader one build behind - they kept
// getting yesterday's index.html while the network copy only refreshed the cache for
// next time. For a product whose entire point is TODAY's reading, stale-first is the
// wrong default. Cache is the offline fallback, not the primary source.
const NETWORK_FIRST = /\/$|\.html$|\.json$/;

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || NETWORK_FIRST.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(
          hit => hit || caches.match("./index.html"))));
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response && response.status === 200) {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return response;
    })));
});

// A real push, from the machine that built the reading: the half of the reminder
// that works when Lamplight is closed.
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "Lamplight", {
    body: data.body || "Today's reading is ready.",
    icon: "./icon.svg", badge: "./icon.svg", tag: "lamplight-daily",
    data: {url: data.url || "./"},
  }));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "notify") {
    self.registration.showNotification("Lamplight", {
      body: event.data.body || "Today's reading is ready.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: "lamplight-daily",
      requireInteraction: false,
    });
  }
  if (event.data && event.data.type === "skipWaiting") self.skipWaiting();
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type: "window"}).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    const target = (event.notification.data && event.notification.data.url) || "./";
    if (clients.openWindow) return clients.openWindow(target);
  }));
});
