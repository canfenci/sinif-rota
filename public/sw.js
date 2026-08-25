// Sınıf Rota Service Worker (v1)
const CACHE_NAME = "sinif-rota-v1";
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[SW] Pre-cache non-fatal warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("sinif-rota-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WARM_CACHE" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return Promise.all(
          event.data.urls.map((url) => {
            return fetch(url)
              .then((response) => {
                if (response && response.status === 200) {
                  return cache.put(url, response);
                }
              })
              .catch((err) => {
                console.warn("[SW] Warm-cache fetch skipped:", url, err);
              });
          })
        );
      })
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";

  if (!isSameOrigin && !isGoogleFont) return;

  // 1. Navigation request (HTML document) -> Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match("/");
          if (cachedResponse) return cachedResponse;
          return new Response("Çevrimdışı Mod - Sınıf Rota", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        })
    );
    return;
  }

  // 2. Static assets (JS, CSS, images, fonts) -> Network-first with cache update, cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response("Ağ hatası - Çevrimdışı", { status: 503, statusText: "Offline" });
      })
  );
});
