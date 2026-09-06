import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve("app/globals.css");
const css = fs.readFileSync(cssPath, "utf8");

const manifestWebPath = path.resolve("public/manifest.webmanifest");
const manifestJsonPath = path.resolve("public/manifest.json");
const layoutPath = path.resolve("app/layout.tsx");

const manifestWeb = JSON.parse(fs.readFileSync(manifestWebPath, "utf8"));
const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));
const layoutContent = fs.readFileSync(layoutPath, "utf8");

test("A. Old primary green/cream palette tokens are not used as primary active colors", () => {
  // Ensure old primary green #17664d and cream #f6f5f0 are not in root tokens
  assert.ok(!css.includes("--paper:#f6f5f0"), "Old cream paper #f6f5f0 must not be root token");
  assert.ok(!css.includes("--accent:#17664d"), "Old green accent #17664d must not be root token");
  assert.ok(!css.includes("--accent-dark:#104a39"), "Old green dark #104a39 must not be root token");
  assert.ok(!css.includes("--ink:#20231f"), "Old ink #20231f must not be root token");
  assert.ok(!css.includes("--muted:#6f746c"), "Old muted #6f746c must not be root token");
  assert.ok(!css.includes("--line:#d7d9d1"), "Old line #d7d9d1 must not be root token");
});

test("B. New primary token equals #3F5FCE (Kobalt Mavisi)", () => {
  assert.ok(css.includes("--primary:#3F5FCE"), "Root must declare --primary:#3F5FCE");
  assert.ok(css.includes("--primary-dark:#2E46A3"), "Root must declare accessible darker shade --primary-dark");
});

test("C. New ink token equals #172033 (Gece Laciverti)", () => {
  assert.ok(css.includes("--ink:#172033"), "Root must declare --ink:#172033");
});

test("D. New background token equals #F6F7FA (Soğuk Beyaz)", () => {
  assert.ok(css.includes("--background:#F6F7FA"), "Root must declare --background:#F6F7FA");
  assert.ok(css.includes("--paper:#F6F7FA"), "Root must declare --paper:#F6F7FA");
});

test("E. New card/surface token equals #FFFFFF", () => {
  assert.ok(css.includes("--surface:#FFFFFF"), "Root must declare --surface:#FFFFFF");
  assert.ok(css.includes("--white:#FFFFFF"), "Root must declare --white:#FFFFFF");
});

test("F. New accent mercan token equals #F06B5B", () => {
  assert.ok(css.includes("--coral:#F06B5B"), "Root must declare --coral:#F06B5B");
});

test("G. New secondary accent token equals #E8B94F (Güneş Sarısı)", () => {
  assert.ok(css.includes("--sun:#E8B94F"), "Root must declare --sun:#E8B94F");
  assert.ok(css.includes("--amber:#E8B94F"), "Root must declare --amber:#E8B94F");
});

test("H. Border token equals #DDE2EA", () => {
  assert.ok(css.includes("--line:#DDE2EA"), "Root must declare --line:#DDE2EA");
});

test("I. Manifest and layout theme-color are synchronized with the new system", () => {
  assert.equal(manifestWeb.theme_color, "#3F5FCE");
  assert.equal(manifestWeb.background_color, "#F6F7FA");
  assert.equal(manifestJson.theme_color, "#3F5FCE");
  assert.equal(manifestJson.background_color, "#F6F7FA");
  assert.ok(layoutContent.includes('themeColor: "#3F5FCE"'), "layout.tsx must configure themeColor: #3F5FCE");
});

test("J. Primary button and active bottom nav use new cobalt palette", () => {
  assert.ok(css.includes(".primary-action{width:100%;min-height:58px;border:0;padding:0 20px;display:flex;justify-content:space-between;align-items:center;color:#fff;background:var(--primary)"));
  assert.ok(css.includes(".primary-action:hover{background:var(--primary-dark)}"));
  assert.ok(css.includes(".bottom-nav .nav-active{color:var(--primary);font-weight:600;box-shadow:inset 0 3px var(--primary)}"));
});

test("K. Quick Check status colors preserve semantic roles and high accessibility contrast", () => {
  // Complete / Tam: accessible green
  assert.ok(css.includes(".status-complete.selected{background:var(--green)}"));
  assert.ok(css.includes("--green:#1B7A5A"));

  // Partial / Eksik: sunshine amber with dark navy ink text for high contrast (WCAG AAA)
  assert.ok(css.includes(".status-partial.selected{background:var(--amber);color:var(--ink)}"));

  // Missing / Yok: semantic red
  assert.ok(css.includes(".status-missing.selected{background:var(--red)}"));
  assert.ok(css.includes("--red:#D93829"));

  // Absent / Gelmedi: slate navy
  assert.ok(css.includes(".status-absent.selected{background:var(--blue)}"));
  assert.ok(css.includes("--blue:#3E5A7A"));
});

test("L. Annual Plan week navigator and detail cards use the new palette tokens", () => {
  // Week navigator container uses clean border and surface
  assert.ok(css.includes(".week-navigator{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin:12px 0 18px;border:1px solid var(--line);border-radius:6px;background:var(--white)}"));
  
  // Week nav button hover uses cobalt tint
  assert.ok(css.includes(".week-nav-button:hover:not(:disabled){background:rgba(63,95,206,.08);color:var(--primary);border-color:rgba(63,95,206,.3)}"));

  // Manual teacher overlay uses coral accent
  assert.ok(css.includes(".week-manual-overlay{padding:12px 14px;border-radius:5px;border-left:3px solid var(--coral);background:rgba(240,107,91,.08);display:grid;gap:4px}"));
  
  // Completed week badge uses semantic green
  assert.ok(css.includes(".week-completed-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;background:rgba(27,122,90,.12);color:var(--green);font-size:11px;font-weight:700}"));

  // Official source links use primary cobalt
  assert.ok(css.includes(".official-source-link{color:var(--primary);font-size:11px;font-weight:600;text-decoration:underline;display:inline-flex;align-items:center;min-height:28px}"));
});
