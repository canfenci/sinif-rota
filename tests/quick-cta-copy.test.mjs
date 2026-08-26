import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("1. HomeView renders Hızlı Kontrol CTA title", () => {
  const pagePath = path.resolve("app/page.tsx");
  const content = fs.readFileSync(pagePath, "utf8");

  assert.ok(
    content.includes("<h2>Sınıf kontrolüne<br />hemen başlayın.</h2>"),
    "HomeView must render CTA heading",
  );
});

test("2. HomeView renders new descriptive subtitle for Hızlı Kontrol", () => {
  const pagePath = path.resolve("app/page.tsx");
  const content = fs.readFileSync(pagePath, "utf8");

  assert.ok(
    content.includes('<p className="hero-desc">Ödev, defter, kitap veya materyal kontrolü yap.</p>'),
    "HomeView must render description paragraph under h2",
  );
});

test("3. Hızlı Kontrol CTA button action and label are preserved", () => {
  const pagePath = path.resolve("app/page.tsx");
  const content = fs.readFileSync(pagePath, "utf8");

  assert.ok(
    content.includes('<button className="primary-action" onClick={onQuick}>Hızlı Kontrol <span>→</span></button>'),
    "HomeView must preserve primary-action button with onQuick handler",
  );
});

test("4. app/globals.css includes .hero-desc styles", () => {
  const cssPath = path.resolve("app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    cssContent.includes(".hero-desc"),
    "globals.css must include .hero-desc class",
  );
});
