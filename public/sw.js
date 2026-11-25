// Service worker minimal : rend l'appli installable et affiche une page claire hors connexion.
// Aucune donnée du potager n'est mise en cache (elles sont privées et changent en continu).
const CACHE = "potager-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // seules les navigations ont un repli hors connexion
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
