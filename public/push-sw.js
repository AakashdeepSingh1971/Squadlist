// Loaded into the service worker (vite.config.js -> workbox.importScripts).
// Shows Squadlist notifications and opens the room when you tap one.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Squadlist", body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Squadlist", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = wins.find((w) => w.url === url) || wins[0];
    if (same) { await same.focus(); if (same.url !== url) await same.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
