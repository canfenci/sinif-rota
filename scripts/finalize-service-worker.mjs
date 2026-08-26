import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BOOT_ENTRY_KEYS = [
  "virtual:vinext-app-browser-entry",
  "app/page.tsx",
  "app/components/ServiceWorkerRegister.tsx",
  "node_modules/vinext/dist/shims/layout-segment-context.js",
];

const STATIC_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon.svg",
];

function toPublicUrl(file) {
  return `/${file.split(path.sep).join("/")}`;
}

async function listFiles(root) {
  try {
    return await readdir(root, { recursive: true });
  } catch {
    return [];
  }
}

export async function collectCorePrecache(clientDir, manifest) {
  const urls = new Set(STATIC_SHELL_URLS);
  const visited = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!entry) throw new Error(`Missing boot entry in Vite manifest: ${key}`);
    visited.add(key);
    if (entry.file) urls.add(toPublicUrl(entry.file));
    for (const css of entry.css ?? []) urls.add(toPublicUrl(css));
    for (const asset of entry.assets ?? []) urls.add(toPublicUrl(asset));
    for (const importedKey of entry.imports ?? []) visit(importedKey);
  }

  for (const key of BOOT_ENTRY_KEYS) visit(key);

  const staticRoot = path.join(clientDir, "_next", "static");
  for (const file of await listFiles(staticRoot)) {
    const normalized = file.split(path.sep).join("/");
    if (normalized.endsWith(".css") || (normalized.endsWith(".js") && !normalized.startsWith("chunks/"))) {
      urls.add(`/_next/static/${normalized}`);
    }
  }

  return ["/", ...[...urls].filter((url) => url !== "/").sort()];
}

export function renderServiceWorker(template, { buildId, corePrecacheUrls }) {
  const cacheName = `sinif-rota-${buildId}`;
  let output = template
    .replace(/^const BUILD_ID = .*?; \/\/ PWA_BUILD_ID$/m, `const BUILD_ID = ${JSON.stringify(buildId)}; // PWA_BUILD_ID`)
    .replace(/^const CACHE_NAME = .*?; \/\/ PWA_CACHE_NAME$/m, `const CACHE_NAME = ${JSON.stringify(cacheName)}; // PWA_CACHE_NAME`);

  if (!output.includes(`const BUILD_ID = ${JSON.stringify(buildId)}; // PWA_BUILD_ID`)) {
    throw new Error("Service Worker build-ID marker is missing or invalid");
  }
  if (!output.includes(`const CACHE_NAME = ${JSON.stringify(cacheName)}; // PWA_CACHE_NAME`)) {
    throw new Error("Service Worker cache-name marker is missing or invalid");
  }

  const startMarker = "  // PWA_CORE_PRECACHE_START";
  const endMarker = "  // PWA_CORE_PRECACHE_END";
  const start = output.indexOf(startMarker);
  const end = output.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) throw new Error("Service Worker precache markers are missing or invalid");

  const renderedUrls = corePrecacheUrls.map((url) => `  ${JSON.stringify(url)},`).join("\n");
  output = `${output.slice(0, start + startMarker.length)}\n${renderedUrls}\n${output.slice(end)}`;
  return { output, cacheName };
}

export async function finalizeServiceWorker({ projectRoot, buildId }) {
  const clientDir = path.join(projectRoot, "dist", "client");
  const manifestPath = path.join(clientDir, ".vite", "manifest.json");
  const templatePath = path.join(projectRoot, "public", "sw.js");
  const outputPath = path.join(clientDir, "sw.js");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const corePrecacheUrls = await collectCorePrecache(clientDir, manifest);

  for (const url of corePrecacheUrls) {
    if (url === "/") continue;
    const target = path.join(clientDir, url.slice(1));
    const targetStat = await stat(target).catch(() => null);
    if (!targetStat?.isFile()) throw new Error(`Core precache asset does not exist: ${url}`);
  }

  const template = await readFile(templatePath, "utf8");
  const rendered = renderServiceWorker(template, { buildId, corePrecacheUrls });
  await writeFile(outputPath, rendered.output, "utf8");
  return { buildId, cacheName: rendered.cacheName, corePrecacheUrls, outputPath };
}
