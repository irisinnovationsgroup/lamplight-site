const CACHE = "lamplight-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Stale-while-revalidate. The reading opens instantly from cache even with no signal,
// and the next open shows whatever the morning job published.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fresh = fetch(request).then(response => {
          if (response && response.status === 200) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fresh;
      })));
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
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type: "window"}).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    if (clients.openWindow) return clients.openWindow("./");
  }));
});
