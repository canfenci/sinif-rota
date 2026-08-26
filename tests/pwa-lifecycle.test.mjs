import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { resolveBuildId } from "../scripts/build-id.mjs";
import { renderServiceWorker } from "../scripts/finalize-service-worker.mjs";

const projectRoot = path.resolve(".");
const sourceSwPath = path.join(projectRoot, "public", "sw.js");
const generatedSwPath = path.join(projectRoot, "dist", "client", "sw.js");
const registerPath = path.join(projectRoot, "app", "components", "ServiceWorkerRegister.tsx");
const expectedBuildId = resolveBuildId();
const expectedCacheName = `sinif-rota-${expectedBuildId}`;

function readGeneratedSw() {
  assert.ok(fs.existsSync(generatedSwPath), "production build must generate dist/client/sw.js");
  return fs.readFileSync(generatedSwPath, "utf8");
}

function extractPrecacheUrls(swCode) {
  const match = swCode.match(/const CORE_PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(match, "generated SW must contain CORE_PRECACHE_URLS");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function createHarness(swCode, { fetchImpl, initialCaches = {} } = {}) {
  const listeners = new Map();
  const stores = new Map(
    Object.entries(initialCaches).map(([name, entries]) => [name, new Map(Object.entries(entries))]),
  );
  const deleted = [];
  let claimed = 0;
  let addAllImpl = async (cache, urls) => {
    for (const url of urls) cache.set(url, new Response(`cached:${url}`, { status: 200 }));
  };

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: (urls) => addAllImpl(store, urls),
        async put(request, response) {
          const key = typeof request === "string" ? request : request.url;
          store.set(key, response);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      deleted.push(name);
      return stores.delete(name);
    },
    async match(request) {
      const key = typeof request === "string" ? request : request.url;
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key).clone();
        try {
          const pathname = new URL(key).pathname;
          if (store.has(pathname)) return store.get(pathname).clone();
        } catch {
          // Relative cache keys do not require URL normalization.
        }
      }
      return undefined;
    },
  };

  const context = {
    URL,
    Response,
    Promise,
    console,
    caches,
    fetch: fetchImpl ?? (async () => new Response("network", { status: 200 })),
    self: {
      location: { origin: "https://sinif-rota.test" },
      clients: { async claim() { claimed += 1; } },
      addEventListener(type, listener) { listeners.set(type, listener); },
    },
  };
  vm.runInNewContext(swCode, context, { filename: "sw.js" });

  return {
    listeners,
    stores,
    deleted,
    get claimed() { return claimed; },
    failAddAll(error) { addAllImpl = async () => { throw error; }; },
  };
}

function dispatch(listener, fields = {}) {
  const waits = [];
  let responsePromise;
  listener({
    ...fields,
    waitUntil(promise) { waits.push(Promise.resolve(promise)); },
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
  });
  return {
    waits,
    response: () => responsePromise,
    settled: () => Promise.all(waits),
  };
}

test("generated SW uses the exact build ID and cache name; changing ID changes the cache", () => {
  const generated = readGeneratedSw();
  assert.ok(generated.includes(`const BUILD_ID = "${expectedBuildId}";`));
  assert.ok(generated.includes(`const CACHE_NAME = "${expectedCacheName}";`));

  const template = fs.readFileSync(sourceSwPath, "utf8");
  const first = renderServiceWorker(template, { buildId: "build-a", corePrecacheUrls: ["/"] });
  const second = renderServiceWorker(template, { buildId: "build-b", corePrecacheUrls: ["/"] });
  assert.equal(first.cacheName, "sinif-rota-build-a");
  assert.equal(second.cacheName, "sinif-rota-build-b");
  assert.notEqual(first.cacheName, second.cacheName);
});

test("generated core precache contains existing boot JS/CSS and excludes lazy XLSX chunks", () => {
  const urls = extractPrecacheUrls(readGeneratedSw());
  const bootPatterns = [
    /\/framework-[^/]+\.js$/,
    /\/rolldown-runtime-[^/]+\.js$/,
    /\/page-[^/]+\.js$/,
    /\/ServiceWorkerRegister-[^/]+\.js$/,
    /\/layout-segment-context-[^/]+\.js$/,
    /\/index-[^/]+\.js$/,
    /\/_next\/static\/css\/[^/]+\.css$/,
  ];

  for (const pattern of bootPatterns) {
    assert.ok(urls.some((url) => pattern.test(url)), `core precache must include ${pattern}`);
  }
  assert.ok(!urls.some((url) => /(?:xlsx|cpexcel)/i.test(url)), "lazy spreadsheet chunks must not be core precache");

  for (const url of urls.filter((url) => url !== "/")) {
    assert.ok(fs.statSync(path.join(projectRoot, "dist", "client", url.slice(1))).isFile(), `${url} must exist in build output`);
  }
});

test("core addAll rejection fails install and skipWaiting is not forced", async () => {
  const swCode = readGeneratedSw();
  assert.ok(!swCode.includes("skipWaiting"), "updates must not force mid-session takeover");
  const harness = createHarness(swCode);
  const failure = new Error("core fetch failed");
  harness.failAddAll(failure);
  const event = dispatch(harness.listeners.get("install"));
  await assert.rejects(event.settled(), /core fetch failed/);
});

test("activation removes only old Sınıf Rota caches and preserves current/unrelated caches", async () => {
  const harness = createHarness(readGeneratedSw(), {
    initialCaches: {
      "sinif-rota-old": {},
      [expectedCacheName]: {},
      "other-app-cache": {},
    },
  });
  const event = dispatch(harness.listeners.get("activate"));
  await event.settled();
  assert.deepEqual(harness.deleted, ["sinif-rota-old"]);
  assert.ok(harness.stores.has(expectedCacheName));
  assert.ok(harness.stores.has("other-app-cache"));
  assert.equal(harness.claimed, 1);
});

test("navigation is network-first, falls back on network failure, and does not cache HTTP 5xx", async () => {
  const cachedShell = new Response("known shell", { status: 200, headers: { "Content-Type": "text/html" } });
  const failedNetwork = createHarness(readGeneratedSw(), {
    initialCaches: { [expectedCacheName]: { "/": cachedShell } },
    fetchImpl: async () => { throw new Error("offline"); },
  });
  const offlineEvent = dispatch(failedNetwork.listeners.get("fetch"), {
    request: { method: "GET", mode: "navigate", url: "https://sinif-rota.test/" },
  });
  assert.equal(await (await offlineEvent.response()).text(), "known shell");
  await offlineEvent.settled();

  const serverError = createHarness(readGeneratedSw(), {
    initialCaches: { [expectedCacheName]: { "/": new Response("known shell", { status: 200 }) } },
    fetchImpl: async () => new Response("server error", { status: 503 }),
  });
  const errorEvent = dispatch(serverError.listeners.get("fetch"), {
    request: { method: "GET", mode: "navigate", url: "https://sinif-rota.test/" },
  });
  assert.equal(await (await errorEvent.response()).text(), "known shell");
  await errorEvent.settled();
  assert.equal(await (await serverError.stores.get(expectedCacheName).get("/").text()), "known shell");
});

test("valid root HTML refreshes the shell through fetch-event waitUntil", async () => {
  const harness = createHarness(readGeneratedSw(), {
    fetchImpl: async () => new Response("new shell", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  const event = dispatch(harness.listeners.get("fetch"), {
    request: { method: "GET", mode: "navigate", url: "https://sinif-rota.test/" },
  });
  assert.equal(event.waits.length, 1, "runtime cache write lifecycle must use waitUntil");
  assert.equal(await (await event.response()).text(), "new shell");
  await event.settled();
  assert.equal(await harness.stores.get(expectedCacheName).get("/").text(), "new shell");
});

test("hashed static assets are cache-first and cached copies survive network failure/404", async () => {
  let networkCalls = 0;
  const assetUrl = "https://sinif-rota.test/_next/static/chunks/page-hash.js";
  const harness = createHarness(readGeneratedSw(), {
    initialCaches: { [expectedCacheName]: { [assetUrl]: new Response("cached asset", { status: 200 }) } },
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response("missing", { status: 404 });
    },
  });
  const event = dispatch(harness.listeners.get("fetch"), {
    request: { method: "GET", mode: "cors", url: assetUrl },
  });
  assert.equal(await (await event.response()).text(), "cached asset");
  await event.settled();
  assert.equal(networkCalls, 0, "cache hit must not depend on a network response");
});

test("WARM_CACHE is optional, non-fatal, waitUntil-bound, and limited to immutable build assets", async () => {
  const fetched = [];
  const harness = createHarness(readGeneratedSw(), {
    initialCaches: { [expectedCacheName]: { "/": new Response("core shell", { status: 200 }) } },
    fetchImpl: async (url) => {
      fetched.push(url);
      throw new Error("optional warm failure");
    },
  });
  const event = dispatch(harness.listeners.get("message"), {
    data: { type: "WARM_CACHE", urls: ["/_next/static/chunks/optional.js", "/api/data"] },
  });
  assert.equal(event.waits.length, 1);
  await event.settled();
  assert.deepEqual(fetched, ["/_next/static/chunks/optional.js"]);
  assert.equal(await harness.stores.get(expectedCacheName).get("/").text(), "core shell");
});

test("arbitrary same-origin GET requests are not intercepted or cached", () => {
  const harness = createHarness(readGeneratedSw());
  const event = dispatch(harness.listeners.get("fetch"), {
    request: { method: "GET", mode: "cors", url: "https://sinif-rota.test/api/data" },
  });
  assert.equal(event.response(), undefined);
  assert.equal(event.waits.length, 0);
});

test("registration URL is stable, bypasses HTTP cache checks, and SW does not touch app persistence", () => {
  const registration = fs.readFileSync(registerPath, "utf8");
  const swCode = fs.readFileSync(sourceSwPath, "utf8");
  assert.ok(registration.includes('.register("/sw.js", { updateViaCache: "none" })'));
  assert.ok(!swCode.includes("localStorage"));
  assert.ok(!swCode.includes("AppData"));
  assert.ok(!swCode.includes("schemaVersion"));
});
