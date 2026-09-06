import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const registerPath = path.resolve("app/components/ServiceWorkerRegister.tsx");
const swPath = path.resolve("public/sw.js");
const cssPath = path.resolve("app/globals.css");
const register = fs.readFileSync(registerPath, "utf8");
const swCode = fs.readFileSync(swPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

test("A. registration.waiting produces the update-ready state", () => {
  assert.ok(register.includes("registration.waiting"), "must check registration.waiting");
  assert.ok(register.includes("notifyUpdateReady()"), "waiting worker must trigger notifyUpdateReady");
});

test("B. updatefound + installed + existing controller triggers the banner", () => {
  assert.ok(register.includes("registration.onupdatefound"), "must listen to updatefound");
  assert.ok(register.includes("registration.installing"), "must observe the installing worker");
  assert.ok(register.includes('installingWorker.state === "installed"'), "must react to installed state");
  assert.ok(register.includes("navigator.serviceWorker.controller"), "must require an existing controller to detect an update");
});

test("C. First install (no controller) must not show the banner", () => {
  assert.ok(
    register.includes('installingWorker.state === "installed" && navigator.serviceWorker.controller'),
    "banner trigger must be gated on an existing controller",
  );
});

test("D. skipWaiting is still absent (no forced takeover)", () => {
  assert.ok(!register.includes("skipWaiting"), "register must not call skipWaiting");
  assert.ok(!swCode.includes("skipWaiting"), "service worker must not force skipWaiting");
});

test("E. SW cache/build logic markers are unchanged", () => {
  assert.ok(swCode.includes('const BUILD_ID = "development"; // PWA_BUILD_ID'), "BUILD_ID marker unchanged");
  assert.ok(swCode.includes('const CACHE_NAME = `sinif-rota-${BUILD_ID}`; // PWA_CACHE_NAME'), "CACHE_NAME marker unchanged");
  assert.ok(register.includes('.register("/sw.js", { updateViaCache: "none" })'), "registration URL stable");
});

test("F. Banner is dismissible via an explicit action", () => {
  assert.ok(register.includes("setUpdateAvailable(false)"), "dismiss must clear the visible state");
  assert.ok(register.includes("Tamam"), "dismiss button label must exist");
});

test("G. Banner does not reopen repeatedly in the same session", () => {
  assert.ok(register.includes("updateShownRef"), "a one-shot guard ref must exist");
  assert.ok(register.includes("if (updateShownRef.current) return;"), "guard must short-circuit repeat triggers");
});

test("H. Banner respects safe-area and sits above the bottom nav", () => {
  assert.ok(css.includes(".update-banner{position:fixed"), "banner must be fixed");
  assert.ok(css.includes("z-index:55"), "banner must layer above bottom nav (z-20) and below toast (z-60)");
  assert.ok(css.includes("bottom:calc(env(safe-area-inset-bottom,0px) + 90px)"), "banner must clear the bottom nav via safe-area offset");
  assert.ok(css.includes(".update-banner-dismiss{flex:0 0 auto;min-height:44px"), "dismiss button must have a >=44px touch target");
});

test("I. banner uses the Sınıf Rota color system (no gradient/neon/glass)", () => {
  const bannerBlock = css.slice(css.indexOf(".update-banner{"), css.indexOf(".update-banner-dismiss:hover") + 1);
  assert.ok(bannerBlock.includes("var(--surface)"), "surface token");
  assert.ok(bannerBlock.includes("var(--ink)"), "ink token");
  assert.ok(bannerBlock.includes("var(--primary)"), "primary token");
  assert.ok(bannerBlock.includes("var(--line)"), "line token");
  assert.ok(!/gradient/i.test(bannerBlock), "no gradients");
});

test("J. Build traceability is preserved", () => {
  assert.ok(!register.includes("7de495e"), "no hardcoded historical commit");
  assert.ok(swCode.includes("PWA_BUILD_ID"), "build-ID finalization marker present");
  assert.ok(swCode.includes("PWA_CACHE_NAME"), "cache-name finalization marker present");
});