const CACHE_NAME = "breakfast-checkin-v14";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./style.css",
  "./js/app.bundle.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/fontawesome/css/all.min.css",
  "./assets/favicon.svg",
  "./assets/logos/kca.svg",
  "./assets/logos/ktb.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const shouldCache =
          networkResponse &&
          networkResponse.ok &&
          (event.request.url.startsWith(self.location.origin) ||
            event.request.url.startsWith("https://fonts.googleapis.com/") ||
            event.request.url.startsWith("https://fonts.gstatic.com/") ||
            event.request.url.startsWith("https://cdn.tailwindcss.com/"));

        if (shouldCache) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }

        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        })
      )
  );
});
