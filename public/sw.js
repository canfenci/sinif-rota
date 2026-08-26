// Sınıf Rota Service Worker
const BUILD_ID = "development"; // PWA_BUILD_ID
const CACHE_NAME = `sinif-rota-${BUILD_ID}`; // PWA_CACHE_NAME
const CACHE_PREFIX = "sinif-rota-";
const ROOT_SHELL_URL = "/";
const CORE_PRECACHE_URLS = [
  // PWA_CORE_PRECACHE_START
  "/",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon.svg",
  // PWA_CORE_PRECACHE_END
];

function offlineResponse() {
  return new Response("Çevrimdışı Mod - Sınıf Rota", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function isValidShellResponse(request, response) {
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && url.pathname === ROOT_SHELL_URL
    && response.status === 200
    && !response.redirected
    && (response.headers.get("Content-Type") || "").includes("text/html");
}

function isImmutableBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

function isCoreStaticAsset(url) {
  return url.origin === self.location.origin
    && url.pathname !== ROOT_SHELL_URL
    && CORE_PRECACHE_URLS.includes(url.pathname);
}

function cachePut(request, response) {
  return caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch((error) => {
      console.warn("[SW] Runtime cache write skipped:", error);
    });
}

function respondWithLifecycle(event, lifecycle) {
  event.respondWith(lifecycle.then(({ response }) => response));
  event.waitUntil(lifecycle.then(({ cacheWrite }) => cacheWrite));
}

async function navigationLifecycle(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.status >= 500) {
      const cachedShell = await caches.match(ROOT_SHELL_URL);
      return { response: cachedShell || networkResponse, cacheWrite: Promise.resolve() };
    }

    const cacheWrite = isValidShellResponse(request, networkResponse)
      ? cachePut(ROOT_SHELL_URL, networkResponse.clone())
      : Promise.resolve();
    return { response: networkResponse, cacheWrite };
  } catch {
    const cachedShell = await caches.match(ROOT_SHELL_URL);
    return { response: cachedShell || offlineResponse(), cacheWrite: Promise.resolve() };
  }
}

async function cacheFirstLifecycle(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return { response: cachedResponse, cacheWrite: Promise.resolve() };

  try {
    const networkResponse = await fetch(request);
    const cacheWrite = networkResponse.status === 200 && !networkResponse.redirected
      ? cachePut(request, networkResponse.clone())
      : Promise.resolve();
    return { response: networkResponse, cacheWrite };
  } catch {
    return {
      response: new Response("Ağ hatası - Çevrimdışı", { status: 503, statusText: "Offline" }),
      cacheWrite: Promise.resolve(),
    };
  }
}

self.addEventListener("install", (event) => {
  // Do not catch this promise: a partial core cache must fail installation.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "WARM_CACHE" || !Array.isArray(event.data.urls)) return;

  const warmUrls = event.data.urls.filter((value) => {
    try {
      return isImmutableBuildAsset(new URL(value, self.location.origin));
    } catch {
      return false;
    }
  });

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
      warmUrls.map(async (url) => {
        const response = await fetch(url);
        if (response.status === 200 && !response.redirected) await cache.put(url, response);
      }),
    )),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    respondWithLifecycle(event, navigationLifecycle(request));
    return;
  }

  const url = new URL(request.url);
  if (isImmutableBuildAsset(url) || isCoreStaticAsset(url)) {
    respondWithLifecycle(event, cacheFirstLifecycle(request));
  }
});
