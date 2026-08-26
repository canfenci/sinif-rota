import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getGreeting, DEFAULT_GREETING, useGreeting } from "../app/lib/greeting.ts";

test("1. Boundary 04:59 returns İyi akşamlar, Öğretmenim", () => {
  const d = new Date("2026-08-26T04:59:00");
  assert.equal(getGreeting(d), "İyi akşamlar, Öğretmenim");
  assert.equal(getGreeting(4), "İyi akşamlar, Öğretmenim");
});

test("2. Boundary 05:00 returns Günaydın, Öğretmenim", () => {
  const d = new Date("2026-08-26T05:00:00");
  assert.equal(getGreeting(d), "Günaydın, Öğretmenim");
  assert.equal(getGreeting(5), "Günaydın, Öğretmenim");
});

test("3. Boundary 11:59 returns Günaydın, Öğretmenim", () => {
  const d = new Date("2026-08-26T11:59:00");
  assert.equal(getGreeting(d), "Günaydın, Öğretmenim");
  assert.equal(getGreeting(11), "Günaydın, Öğretmenim");
});

test("4. Boundary 12:00 returns İyi günler, Öğretmenim", () => {
  const d = new Date("2026-08-26T12:00:00");
  assert.equal(getGreeting(d), "İyi günler, Öğretmenim");
  assert.equal(getGreeting(12), "İyi günler, Öğretmenim");
});

test("5. Boundary 17:59 returns İyi günler, Öğretmenim", () => {
  const d = new Date("2026-08-26T17:59:00");
  assert.equal(getGreeting(d), "İyi günler, Öğretmenim");
  assert.equal(getGreeting(17), "İyi günler, Öğretmenim");
});

test("6. Boundary 18:00 returns İyi akşamlar, Öğretmenim", () => {
  const d = new Date("2026-08-26T18:00:00");
  assert.equal(getGreeting(d), "İyi akşamlar, Öğretmenim");
  assert.equal(getGreeting(18), "İyi akşamlar, Öğretmenim");
});

test("7. Boundary 23:59 returns İyi akşamlar, Öğretmenim", () => {
  const d = new Date("2026-08-26T23:59:00");
  assert.equal(getGreeting(d), "İyi akşamlar, Öğretmenim");
  assert.equal(getGreeting(23), "İyi akşamlar, Öğretmenim");
});

test("8. Boundary 00:00 returns İyi akşamlar, Öğretmenim", () => {
  const d = new Date("2026-08-26T00:00:00");
  assert.equal(getGreeting(d), "İyi akşamlar, Öğretmenim");
  assert.equal(getGreeting(0), "İyi akşamlar, Öğretmenim");
});

test("9. Full 24-hour cycle coverage", () => {
  const expectedGreetings = {
    0: "İyi akşamlar, Öğretmenim",
    1: "İyi akşamlar, Öğretmenim",
    2: "İyi akşamlar, Öğretmenim",
    3: "İyi akşamlar, Öğretmenim",
    4: "İyi akşamlar, Öğretmenim",
    5: "Günaydın, Öğretmenim",
    6: "Günaydın, Öğretmenim",
    7: "Günaydın, Öğretmenim",
    8: "Günaydın, Öğretmenim",
    9: "Günaydın, Öğretmenim",
    10: "Günaydın, Öğretmenim",
    11: "Günaydın, Öğretmenim",
    12: "İyi günler, Öğretmenim",
    13: "İyi günler, Öğretmenim",
    14: "İyi günler, Öğretmenim",
    15: "İyi günler, Öğretmenim",
    16: "İyi günler, Öğretmenim",
    17: "İyi günler, Öğretmenim",
    18: "İyi akşamlar, Öğretmenim",
    19: "İyi akşamlar, Öğretmenim",
    20: "İyi akşamlar, Öğretmenim",
    21: "İyi akşamlar, Öğretmenim",
    22: "İyi akşamlar, Öğretmenim",
    23: "İyi akşamlar, Öğretmenim",
  };

  for (let h = 0; h < 24; h++) {
    assert.equal(getGreeting(h), expectedGreetings[h], `Hour ${h} mismatch`);
  }
});

test("10. Default argument uses current local time and returns valid greeting", () => {
  const greeting = getGreeting();
  assert.ok(
    ["Günaydın, Öğretmenim", "İyi günler, Öğretmenim", "İyi akşamlar, Öğretmenim"].includes(greeting),
    `Unexpected greeting: ${greeting}`
  );
});

test("11. Deterministic initial render contract", () => {
  assert.equal(DEFAULT_GREETING, "Günaydın, Öğretmenim", "Server snapshot must be deterministic fallback");
  assert.equal(typeof useGreeting, "function", "useGreeting hook must be exported");
});

test("12. app/page.tsx uses useGreeting and eliminates suppressHydrationWarning", () => {
  const pagePath = path.resolve("app/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf8");

  assert.ok(
    pageContent.includes('import { useGreeting } from "./lib/greeting";'),
    "app/page.tsx must import useGreeting",
  );
  assert.ok(
    pageContent.includes("const greeting = useGreeting();"),
    "HomeView must consume useGreeting hook",
  );
  assert.ok(
    pageContent.includes('<AppHeader eyebrow={date.toLocaleUpperCase("tr-TR")} title={greeting} />'),
    "HomeView must pass dynamic greeting to AppHeader",
  );
  assert.ok(
    !pageContent.includes("suppressHydrationWarning"),
    "suppressHydrationWarning must not be present in app/page.tsx",
  );
});
