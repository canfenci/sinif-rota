import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("A. .app-shell references env(safe-area-inset-top) with calc()", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes(".app-shell{padding-top:calc(24px + env(safe-area-inset-top))"),
    ".app-shell must include padding-top with calc(24px + env(safe-area-inset-top))",
  );
  assert.ok(
    css.includes(".app-shell{padding-top:calc(36px + env(safe-area-inset-top))"),
    ".app-shell must include responsive padding-top with calc(36px + env(safe-area-inset-top)) on min-width:700px",
  );
});

test("B. .quick-top references env(safe-area-inset-top) in sticky margin and padding rules", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes(".quick-top{margin-top:calc(-24px - env(safe-area-inset-top));padding-top:calc(18px + env(safe-area-inset-top))"),
    ".quick-top must include margin-top and padding-top adapting to env(safe-area-inset-top)",
  );
  assert.ok(
    css.includes(".quick-top{margin-top:calc(-36px - env(safe-area-inset-top));padding-top:calc(22px + env(safe-area-inset-top))"),
    ".quick-top must include responsive margin-top and padding-top adapting to env(safe-area-inset-top) on min-width:700px",
  );
});

test("C. .save-warning-banner references env(safe-area-inset-top) in sticky top rules", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes("margin:calc(-24px - env(safe-area-inset-top)) -20px 16px;padding:calc(12px + env(safe-area-inset-top)) 18px 12px"),
    ".save-warning-banner must include margin and padding adapting to env(safe-area-inset-top)",
  );
  assert.ok(
    css.includes(".save-warning-banner{margin-top:calc(-36px - env(safe-area-inset-top));margin-left:-36px;margin-right:-36px;padding:calc(14px + env(safe-area-inset-top)) 28px 14px}"),
    ".save-warning-banner must include responsive margin-top and padding adapting to env(safe-area-inset-top) on min-width:700px",
  );
});

test("D. Existing env(safe-area-inset-bottom) protections remain intact across all selectors", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(css.includes(".bottom-nav{height:calc(68px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}"));
  assert.ok(css.includes(".bulk-dock{bottom:calc(68px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".save-dock{padding-bottom:calc(10px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".toast{bottom:calc(86px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".app-shell{padding-top:calc(24px + env(safe-area-inset-top));padding-bottom:calc(96px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".sheet{max-height:calc(100dvh - 12px);overflow-y:auto;overscroll-behavior:contain;padding-bottom:calc(28px + env(safe-area-inset-bottom))}"));
});

test("E. app/layout.tsx retains viewportFit: 'cover'", () => {
  const layoutPath = path.resolve("app/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf8");

  assert.ok(
    layoutContent.includes('viewportFit: "cover"'),
    "app/layout.tsx must retain viewportFit: 'cover'",
  );
});

test("F. No arbitrary device-specific hardcoded notch pixel constants are introduced", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(!css.includes("47px +"), "Must not contain hardcoded 47px notch height");
  assert.ok(!css.includes("54px +"), "Must not contain hardcoded 54px notch height");
  assert.ok(!css.includes("59px +"), "Must not contain hardcoded 59px notch height");
});

test("G. Mobile .page-header uses sticky positioning", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes(".page-header{position:sticky;top:0;z-index:10"),
    "Mobile .page-header must be sticky at top:0 with z-index:10",
  );
});

test("H. Mobile .page-header incorporates env(safe-area-inset-top) into margin and padding", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes("margin-top:calc(-24px - env(safe-area-inset-top));margin-left:-20px;margin-right:-20px;padding-top:calc(24px + env(safe-area-inset-top));padding-left:20px;padding-right:20px;background:var(--paper)"),
    "Mobile .page-header must adapt margin-top and padding-top to env(safe-area-inset-top) with var(--paper) background",
  );
  assert.ok(
    css.includes("@media(max-width:380px){.page-header{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}"),
    "Mobile .page-header must support <=380px narrow horizontal margins and paddings",
  );
});

test("I. Desktop >=700px does not unintentionally inherit mobile sticky behavior", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes("@media(min-width:700px){.page-header{position:static;margin:0;padding:0;background:transparent}"),
    "Desktop .page-header must remain static with transparent background on >=700px",
  );
});

test("J. Existing .quick-top safe-area behavior remains unchanged", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    css.includes(".quick-top{margin-top:calc(-24px - env(safe-area-inset-top));padding-top:calc(18px + env(safe-area-inset-top))}"),
    "Mobile .quick-top must remain unchanged",
  );
  assert.ok(
    css.includes(".quick-top{margin-top:calc(-36px - env(safe-area-inset-top));padding-top:calc(22px + env(safe-area-inset-top))}"),
    "Desktop .quick-top must remain unchanged",
  );
});

test("K. Existing bottom safe-area protections remain unchanged", () => {
  const cssPath = path.resolve("app/globals.css");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(css.includes(".bottom-nav{height:calc(68px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}"));
  assert.ok(css.includes(".save-dock{padding-bottom:calc(10px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".bulk-dock{bottom:calc(68px + env(safe-area-inset-bottom))}"));
  assert.ok(css.includes(".toast{bottom:calc(86px + env(safe-area-inset-bottom))}"));
});
