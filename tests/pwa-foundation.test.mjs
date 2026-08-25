import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("A. Web App Manifest exists, parses as valid JSON, and has standalone config", () => {
  const manifestPath = path.resolve("public/manifest.webmanifest");
  assert.ok(fs.existsSync(manifestPath), "manifest.webmanifest must exist in public/");
  
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  
  assert.equal(manifest.name, "Sınıf Rota");
  assert.equal(manifest.short_name, "Sınıf Rota");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.background_color, "#f6f5f0");
  assert.equal(manifest.theme_color, "#17664d");
  assert.equal(manifest.lang, "tr");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "Manifest must have at least 3 icons");
});

test("B. All manifest icon assets exist on disk and have valid sizes", () => {
  const manifestPath = path.resolve("public/manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  
  for (const icon of manifest.icons) {
    const iconPath = path.resolve("public", icon.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(iconPath), `Icon file ${icon.src} must exist at ${iconPath}`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 100, `Icon file ${icon.src} must not be empty`);
  }
  
  const appleIconPath = path.resolve("public/apple-touch-icon.png");
  assert.ok(fs.existsSync(appleIconPath), "apple-touch-icon.png must exist");
  assert.ok(fs.statSync(appleIconPath).size > 100, "apple-touch-icon.png must not be empty");
});

test("C. Service Worker file exists and contains valid JS with expected caching logic", () => {
  const swPath = path.resolve("public/sw.js");
  assert.ok(fs.existsSync(swPath), "public/sw.js must exist");
  
  const swCode = fs.readFileSync(swPath, "utf8");
  assert.ok(swCode.includes("sinif-rota-v1"), "Must contain versioned cache name");
  assert.ok(swCode.includes("addEventListener(\"install\""), "Must have install listener");
  assert.ok(swCode.includes("addEventListener(\"activate\""), "Must have activate listener");
  assert.ok(swCode.includes("addEventListener(\"fetch\""), "Must have fetch listener");
  assert.ok(swCode.includes("addEventListener(\"message\""), "Must have message listener for warm-cache");
  assert.ok(swCode.includes("WARM_CACHE"), "Must support WARM_CACHE message");
  assert.ok(swCode.includes("caches.delete"), "Must clean up obsolete caches on activate");
});

test("D. BUILD_INFO and vite.config.ts have no hardcoded historical commit fallback", () => {
  const buildInfoPath = path.resolve("app/lib/build-info.ts");
  assert.ok(fs.existsSync(buildInfoPath), "build-info.ts must exist");

  const buildInfoContent = fs.readFileSync(buildInfoPath, "utf8");
  assert.ok(!buildInfoContent.includes("7de495e"), "build-info.ts must not contain hardcoded 7de495e");
  assert.ok(buildInfoContent.includes('"unknown"'), "build-info.ts must contain unknown fallback");

  const viteConfigPath = path.resolve("vite.config.ts");
  const viteConfigContent = fs.readFileSync(viteConfigPath, "utf8");
  assert.ok(!viteConfigContent.includes("7de495e"), "vite.config.ts must not contain hardcoded 7de495e");
  assert.ok(viteConfigContent.includes('"unknown"'), "vite.config.ts must contain unknown fallback");
});

