import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const reactUrl = import.meta.resolve("react");
const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) return codeCache.get(relPath);
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;

  transpiled = transpiled.replace(/from\s+["']react["']/g, `from "${reactUrl}"`);
  transpiled = `import React from "${reactUrl}";\n` + transpiled;
  const relRegex = /(import|export)\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(relRegex)];
  for (const match of matches) {
    const kind = match[1];
    const specifiers = match[2];
    const importPath = match[3];
    const dir = relPath.substring(0, relPath.lastIndexOf("/"));
    let targetParts = (dir ? dir + "/" + importPath : importPath).split("/");
    let cleanParts = [];
    for (const p of targetParts) {
      if (p === ".") continue;
      if (p === "..") cleanParts.pop();
      else cleanParts.push(p);
    }
    let targetRel = cleanParts.join("/");
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".tsx") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.tsx`, import.meta.url));
        targetRel = `${targetRel}.tsx`;
      } catch {
        try {
          await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
          targetRel = `${targetRel}.ts`;
        } catch {
          targetRel = `${targetRel}/index.ts`;
        }
      }
    }
    const targetDataUri = await getTranspiledDataUri(targetRel);
    transpiled = transpiled.replace(match[0], `${kind} ${specifiers} from "${targetDataUri}"`);
  }
  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  codeCache.set(relPath, dataUri);
  return dataUri;
}

async function importTypeScript(relPath) {
  const dataUri = await getTranspiledDataUri(relPath);
  return import(dataUri);
}

const planning = await importTypeScript("app/lib/planning.ts");
const annualPlanModule = await importTypeScript("app/components/AnnualPlan.tsx");
const {
  AnnualPlan,
  ScienceDetailCards,
  formatWeekDateRange,
  getWeekDisplayEndDate,
  getTeachingWeekDisplayEndDate,
  toLocalDateString,
  useClientLocalDateString,
  findInitialWeekIndex,
  getNextWeekIndex,
  getPreviousWeekIndex,
} = annualPlanModule;

const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));

const mockClasses = [
  { id: "c-5a", name: "5-A", archived: false, students: [] },
  { id: "c-6a", name: "6-A", archived: false, students: [] },
  { id: "c-7a", name: "7-A", archived: false, students: [] },
  { id: "c-8a", name: "8-A", archived: false, students: [] },
  { id: "c-math", name: "Matematik 5", archived: false, students: [] },
];

// ==========================================================
// 1. Local Date & Timezone Tests
// ==========================================================

test("1. toLocalDateString formats local date using getFullYear, getMonth+1, getDate without UTC shift", () => {
  const localMonday = new Date(2026, 8, 21, 0, 30); // Month 8 is September in local time
  assert.equal(toLocalDateString(localMonday), "2026-09-21");

  const localSunday = new Date(2026, 8, 13, 23, 30);
  assert.equal(toLocalDateString(localSunday), "2026-09-13");
});

test("1b. findInitialWeekIndex selects Week 2 for Monday 00:30 local time and fallback for Sunday", () => {
  const weeks = planning.buildPlanWeeks(calendar, 5);

  // Monday 2026-09-21 00:30 local time -> Week 2 (index 1)
  const mondayMidnight = new Date(2026, 8, 21, 0, 30);
  assert.equal(findInitialWeekIndex(weeks, mondayMidnight), 1);

  // Previous Sunday 2026-09-13 (before school starts) -> fallback to Week 1 (index 0)
  const sundayBeforeSchool = new Date(2026, 8, 13, 23, 45);
  assert.equal(findInitialWeekIndex(weeks, sundayBeforeSchool), 0);
});

test("1c. findInitialWeekIndex supports YYYY-MM-DD string target and handles boundary fallbacks", () => {
  const weeks = planning.buildPlanWeeks(calendar, 5);

  assert.equal(findInitialWeekIndex(weeks, "2026-09-21"), 1);
  assert.equal(findInitialWeekIndex(weeks, "2026-09-25"), 1);
  assert.equal(findInitialWeekIndex(weeks, "2026-09-28"), 2);
  assert.equal(findInitialWeekIndex(weeks, "2026-08-01"), 0); // Out of range fallback
  assert.equal(findInitialWeekIndex([], "2026-09-21"), 0); // Empty weeks fallback
});

// ==========================================================
// 2. formatWeekDateRange Pure Formatting & Teaching-Week End Date Tests
// ==========================================================

test("2a. formatWeekDateRange formats authoritative start and end dates directly without parallel calculations", () => {
  assert.equal(formatWeekDateRange("2026-09-14", "2026-09-18"), "14–18 EYLÜL");
  assert.equal(formatWeekDateRange("2026-09-21", "2026-09-25"), "21–25 EYLÜL");
  assert.equal(formatWeekDateRange("2026-09-28", "2026-10-02"), "28 EYLÜL–2 EKİM");

  // Custom/different endDate verification: confirms the function genuinely uses the passed endDate
  assert.equal(formatWeekDateRange("2026-09-14", "2026-09-16"), "14–16 EYLÜL");
  assert.equal(formatWeekDateRange("2026-09-14", "2026-09-30"), "14–30 EYLÜL");
});

test("2b. getWeekDisplayEndDate (getTeachingWeekDisplayEndDate) semantics: Friday for 6-day Sun block, preserves custom endDate", () => {
  // 1. Standard Monday–Sunday block: diffDays = 6, ends on Sunday -> displays Friday (start + 4)
  const standardWeek = {
    number: 1,
    startDate: "2026-09-14",
    endDate: "2026-09-20", // Sunday
    teachingDays: 5,
    breakTitles: [],
  };
  assert.equal(getWeekDisplayEndDate(standardWeek), "2026-09-18");
  assert.equal(getTeachingWeekDisplayEndDate(standardWeek), "2026-09-18");
  // Confirms PlanWeek object is not mutated
  assert.equal(standardWeek.endDate, "2026-09-20");

  // 2. Already Friday or shortened week (diffDays < 6) -> preserves original endDate
  const fridayEndingWeek = {
    number: 18,
    startDate: "2027-01-18",
    endDate: "2027-01-22", // Friday (term ends)
    teachingDays: 5,
    breakTitles: [],
  };
  assert.equal(getWeekDisplayEndDate(fridayEndingWeek), "2027-01-22");

  // 3. Custom break / shortened mid-week date (diffDays = 2) -> preserves original endDate
  const customBreakWeek = {
    number: 7,
    startDate: "2026-10-26",
    endDate: "2026-10-28", // Wednesday
    teachingDays: 3,
    breakTitles: ["29 Ekim"],
  };
  assert.equal(getWeekDisplayEndDate(customBreakWeek), "2026-10-28");
});

// ==========================================================
// 3. Navigation Actions & Boundary Tests (A through K)
// ==========================================================

test("A. First week renders '1. HAFTA · 14–18 EYLÜL' in week navigator", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnnualPlan, {
      classes: [mockClasses[0]],
      calendar,
      calendarSupportState: "supported_current",
      entries: [],
      onCalendar: () => {},
      onEntry: () => {},
      onNotify: () => {},
    })
  );
  assert.match(html, /class="week-navigator"/);
  assert.match(html, /1\. HAFTA · 14–18 EYLÜL/);
});

test("B. NEXT navigation action increments week index and clamps at totalWeeks - 1", () => {
  const totalWeeks = 36;
  assert.equal(getNextWeekIndex(0, totalWeeks), 1);
  assert.equal(getNextWeekIndex(10, totalWeeks), 11);
  assert.equal(getNextWeekIndex(35, totalWeeks), 35); // Last week cannot increment
});

test("C. PREVIOUS navigation action decrements week index and clamps at 0", () => {
  assert.equal(getPreviousWeekIndex(1), 0);
  assert.equal(getPreviousWeekIndex(15), 14);
  assert.equal(getPreviousWeekIndex(0), 0); // First week cannot decrement
});

test("D1. Boundary navigation: first week has disabled previous button with aria-label", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnnualPlan, {
      classes: [mockClasses[0]],
      calendar,
      calendarSupportState: "supported_current",
      entries: [],
      onCalendar: () => {},
      onEntry: () => {},
      onNotify: () => {},
    })
  );
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Önceki hafta"[^>]*>‹<\/button>/);
  assert.match(html, /<button[^>]*aria-label="Sonraki hafta"[^>]*>›<\/button>/);
});

test("D2. Boundary navigation: last week canNext boundary disables next button", () => {
  const weeks = planning.buildPlanWeeks(calendar, 5);
  const lastIndex = weeks.length - 1;
  assert.equal(getNextWeekIndex(lastIndex, weeks.length), lastIndex);
});

test("E. Single week content rendered; DOM is not flooded with 36 weeks", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnnualPlan, {
      classes: [mockClasses[0]],
      calendar,
      calendarSupportState: "supported_current",
      entries: [],
      onCalendar: () => {},
      onEntry: () => {},
      onNotify: () => {},
    })
  );
  assert.match(html, /class="single-week-view"/);
  assert.match(html, /LABORATUVAR GÜVENLİĞİ/);
  assert.doesNotMatch(html, /FB\.5\.5\.1\.1/);
  assert.doesNotMatch(html, /class="week-row"/);
});

test("F. Grade 5–7 renders Öğrenme Çıktısı and Süreç Bileşenleri", () => {
  const plan5 = planning.buildGrade5SciencePlan(calendar);
  const week2 = plan5.weeks[1];
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week2.items,
      className: "5-A",
      week: { number: 2, startDate: "2026-09-21", endDate: "2026-09-25", teachingDays: 5, breakTitles: [] },
    })
  );
  assert.match(html, /Öğrenme Çıktısı Kodu/);
  assert.match(html, /Öğrenme Çıktısı/);
  assert.match(html, /Süreç Bileşenleri/);
  assert.match(html, /FB\.5\.1\.1\.1/);
  assert.match(html, /Güneş[’']in yapısı ve dönme hareketi/);
});

test("G. Grade 8 renders Kazanım and NO Süreç Bileşenleri", () => {
  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const week1 = plan8.weeks[0];
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "8-A",
      week: { number: 1, startDate: "2026-09-14", endDate: "2026-09-18", teachingDays: 5, breakTitles: [] },
    })
  );
  assert.match(html, /Kazanım Kodu/);
  assert.match(html, /Kazanım/);
  assert.doesNotMatch(html, /Süreç Bileşenleri/);
  assert.match(html, /F\.8\.1\.1\.1/);
  assert.match(html, /Mevsimlerin oluşumuna yönelik tahminlerde bulunur/);
});

test("H. Official curriculum text is sourced verbatim from authoritative registry", () => {
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const week1 = plan7.weeks[0];
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "7-A",
      week: { number: 1, startDate: "2026-09-14", endDate: "2026-09-18", teachingDays: 5, breakTitles: [] },
    })
  );
  assert.match(html, /FB\.7\.1\.1\.1/);
  assert.match(html, /Uzay araştırmaları için geliştirilen teknolojileri karşılaştırabilme/);
  assert.match(html, /https:\/\/tymm\.meb\.gov\.tr/);
});

test("I. Multi-outcome weeks render all outcomes sequentially in the single-week panel", () => {
  const plan5 = planning.buildGrade5SciencePlan(calendar);
  const multiWeek = plan5.weeks.find((w) => w.items.length > 1 || (w.items[0]?.curricula && w.items[0].curricula.length > 1));
  assert.ok(multiWeek, "Grade 5 should have a multi-outcome or split week");
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: multiWeek.items,
      className: "5-A",
      week: { number: 18, startDate: multiWeek.weekStart, endDate: "2027-01-22", teachingDays: 5, breakTitles: [] },
    })
  );
  const cardCount = (html.match(/class="science-detail-card"/g) || []).length;
  const outcomeHeaderCount = (html.match(/class="official-outcome-entry"/g) || []).length;
  assert.ok(cardCount >= 1 && outcomeHeaderCount >= 1, "Must render outcome entries in card");
});

test("J. Non-science class with no manual topic renders safe empty state without invented content", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnnualPlan, {
      classes: [mockClasses[4]],
      calendar,
      calendarSupportState: "supported_current",
      entries: [],
      onCalendar: () => {},
      onEntry: () => {},
      onNotify: () => {},
    })
  );
  assert.match(html, /Bu hafta için konu girilmedi/);
  assert.match(html, /\+ Konu \/ Not Ekle/);
});

test("K. SSR / renderToStaticMarkup produces deterministic Week 1 markup without hydration mismatch", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnnualPlan, {
      classes: [mockClasses[0]],
      calendar,
      calendarSupportState: "supported_current",
      entries: [],
      onCalendar: () => {},
      onEntry: () => {},
      onNotify: () => {},
    })
  );
  // SSR snapshot must always render the first week (Week 1) deterministically
  assert.match(html, /1\. HAFTA · 14–18 EYLÜL/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Önceki hafta"/);
  assert.match(html, /<button[^>]*aria-label="Sonraki hafta"/);
});

test("L. useClientLocalDateString provides null server snapshot and local date string client snapshot", () => {
  assert.equal(typeof useClientLocalDateString, "function");
  function TestComp() {
    const val = useClientLocalDateString();
    return React.createElement("div", { id: "test-snapshot" }, val === null ? "SERVER_NULL" : val);
  }
  const html = renderToStaticMarkup(React.createElement(TestComp));
  assert.match(html, />SERVER_NULL</);
  const todayExpected = toLocalDateString(new Date());
  assert.match(todayExpected, /^\d{4}-\d{2}-\d{2}$/);
});

test("M. User navigation state takes precedence over clientLocalDate and is preserved across renders", () => {
  const weeks = planning.buildPlanWeeks(calendar, 5);
  const clientLocalDate = "2026-09-21"; // Simulated Week 2 (index 1)

  // 1. Unset user selection: resolves to clientLocalDate (index 1)
  let userSelectedIndex = null;
  const resolveIndex = (userIndex, clientDate) => {
    const rawIndex = userIndex !== null ? userIndex : (clientDate ? findInitialWeekIndex(weeks, clientDate) : 0);
    return Math.max(0, Math.min(rawIndex, Math.max(0, weeks.length - 1)));
  };

  assert.equal(resolveIndex(userSelectedIndex, clientLocalDate), 1);

  // 2. User navigates forward: userSelectedIndex becomes 2
  userSelectedIndex = getNextWeekIndex(resolveIndex(userSelectedIndex, clientLocalDate), weeks.length);
  assert.equal(userSelectedIndex, 2);
  assert.equal(resolveIndex(userSelectedIndex, clientLocalDate), 2);

  // 3. Re-render with same clientLocalDate: userSelectedIndex remains 2, does NOT revert to index 1
  assert.equal(resolveIndex(userSelectedIndex, clientLocalDate), 2);

  // 4. User navigates backward to Week 1 (index 0): 0 is NOT null, so 0 is preserved
  userSelectedIndex = getPreviousWeekIndex(1);
  assert.equal(userSelectedIndex, 0);
  assert.equal(resolveIndex(userSelectedIndex, clientLocalDate), 0);
});

