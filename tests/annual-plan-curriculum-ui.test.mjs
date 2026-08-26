import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const reactUrl = import.meta.resolve("react");
const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

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
const { officialCurriculumRegistry } = await importTypeScript("app/lib/curriculum/index.ts");
const annualPlanModule = await importTypeScript("app/components/AnnualPlan.tsx");
const { ScienceDetailCards } = annualPlanModule;

const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
const dummyWeek = {
  number: 1,
  startDate: "2026-09-14",
  endDate: "2026-09-18",
  teachingDays: 5,
  breakTitles: [],
};

// ==========================================================
// Tests A through L: Annual Plan UI Curriculum Integration
// ==========================================================

test("A. Grade 5 renders 'Öğrenme Çıktısı' and 'Öğrenme Çıktısı Kodu'", () => {
  const plan5 = planning.buildGrade5SciencePlan(calendar);
  const week2 = plan5.weeks.find((w) => w.weekStart === "2026-09-21"); // FB.5.1.1.1
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week2.items,
      className: "5-A",
      week: dummyWeek,
    })
  );

  assert.match(html, /<dt>Öğrenme Çıktısı Kodu<\/dt>/);
  assert.match(html, /<dt>Öğrenme Çıktısı<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım Kodu<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım<\/dt>/);
});

test("B. Grade 6 renders 'Öğrenme Çıktısı' and 'Öğrenme Çıktısı Kodu'", () => {
  const plan6 = planning.buildGrade6SciencePlan(calendar);
  const week1 = plan6.weeks[0]; // FB.6.1.1.1
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "6-A",
      week: dummyWeek,
    })
  );

  assert.match(html, /<dt>Öğrenme Çıktısı Kodu<\/dt>/);
  assert.match(html, /<dt>Öğrenme Çıktısı<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım Kodu<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım<\/dt>/);
});

test("C. Grade 7 renders 'Öğrenme Çıktısı' and 'Öğrenme Çıktısı Kodu'", () => {
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const week1 = plan7.weeks[0]; // FB.7.1.1.1, FB.7.1.1.2
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "7-A",
      week: dummyWeek,
    })
  );

  assert.match(html, /<dt>Öğrenme Çıktısı Kodu<\/dt>/);
  assert.match(html, /<dt>Öğrenme Çıktısı<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım Kodu<\/dt>/);
  assert.doesNotMatch(html, /<dt>Kazanım<\/dt>/);
});

test("D. Grade 8 renders 'Kazanım' and 'Kazanım Kodu'", () => {
  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const week1 = plan8.weeks[0]; // F.8.1.1.1
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "8-A",
      week: dummyWeek,
    })
  );

  assert.match(html, /<dt>Kazanım Kodu<\/dt>/);
  assert.match(html, /<dt>Kazanım<\/dt>/);
  assert.match(html, /F\.8\.1\.1\.1/);
});

test("E. Grade 8 does NOT render 'Öğrenme Çıktısı' for achievement detail", () => {
  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const week1 = plan8.weeks[0];
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "8-A",
      week: dummyWeek,
    })
  );

  assert.doesNotMatch(html, /<dt>Öğrenme Çıktısı Kodu<\/dt>/);
  assert.doesNotMatch(html, /<dt>Öğrenme Çıktısı<\/dt>/);
  assert.doesNotMatch(html, /aria-label="Haftanın öğrenme çıktıları"/);
  assert.match(html, /aria-label="Haftanın kazanımları"/);
});

test("F. official description appears verbatim", () => {
  const meta7 = officialCurriculumRegistry.get("FB.7.1.1.1");
  const meta8 = officialCurriculumRegistry.get("F.8.1.1.1");

  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const html7 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: plan7.weeks[0].items,
      className: "7-A",
      week: dummyWeek,
    })
  );
  assert.ok(html7.includes(meta7.outcomeDescription));

  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const html8 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: plan8.weeks[0].items,
      className: "8-A",
      week: dummyWeek,
    })
  );
  assert.ok(html8.includes(meta8.outcomeDescription));
});

test("G. Grade 7 processComponents render in source order", () => {
  const meta7 = officialCurriculumRegistry.get("FB.7.1.1.1");
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const html7 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: [plan7.weeks[0].items[0]],
      className: "7-A",
      week: dummyWeek,
    })
  );

  assert.match(html7, /Süreç Bileşenleri/);
  for (const comp of meta7.processComponents) {
    assert.ok(html7.includes(comp), `HTML should contain process component: ${comp}`);
  }
  const idxA = html7.indexOf("a)");
  const idxB = html7.indexOf("b)");
  const idxC = html7.indexOf("c)");
  assert.ok(idxA !== -1 && idxB !== -1 && idxC !== -1);
  assert.ok(idxA < idxB && idxB < idxC, "Process components must preserve order a < b < c");
});

test("H. Grade 8 does not render Maarif processComponents", () => {
  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const html8 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: plan8.weeks[0].items,
      className: "8-A",
      week: dummyWeek,
    })
  );

  assert.doesNotMatch(html8, /Süreç Bileşenleri/);
});

test("I. official source link uses metadata URL", () => {
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const html7 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: plan7.weeks[0].items,
      className: "7-A",
      week: dummyWeek,
    })
  );

  assert.match(html7, /href="https:\/\/tymm\.meb\.gov\.tr\/fen-bilimleri-dersi\/unite\/416"/);
  assert.match(html7, /Resmî Kaynak/);
  assert.match(html7, /target="_blank"/);
  assert.match(html7, /rel="noopener noreferrer"/);

  const plan8 = planning.buildGrade8SciencePlan(calendar);
  const html8 = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: plan8.weeks[0].items,
      className: "8-A",
      week: dummyWeek,
    })
  );
  assert.match(html8, /href="https:\/\/mufredat\.meb\.gov\.tr\/Dosyalar\/201812312311937-FEN%20B%C4%B0L%C4%B0MLER%C4%B0%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI2018\.pdf"/);
});

test("J. missing optional processComponents section is hidden", () => {
  const syntheticItem = {
    unit: 1,
    unitTitle: "Test",
    title: "Test Block",
    outcomeCode: "FB.5.1.1.1",
    hours: 4,
    curriculum: {
      grade: 5,
      curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
      unitId: "FB.5.1",
      unitTitle: "Test",
      code: "FB.5.1.1.1",
      officialDescription: "Açıklama",
      officialSource: "https://example.com",
      processComponents: [],
      contentFramework: [],
      keyConcepts: [],
      learningEvidence: [],
      learningTeachingExperiences: [],
      differentiation: [],
      skills: [],
      values: [],
      literacySkills: [],
    },
    allocation: {
      schoolYear: "2026-2027",
      grade: 5,
      classId: null,
      weekId: "2026-09-14",
      weekStart: "2026-09-14",
      weekEnd: "2026-09-18",
      outcomeCode: "FB.5.1.1.1",
      allocatedHours: 4,
      plannedTotalHours: 4,
      completedBeforeHours: 0,
      completedAfterHours: 4,
      source: "auto",
      teacherNote: null,
      completed: false,
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: [syntheticItem],
      className: "5-A",
      week: dummyWeek,
    })
  );

  assert.doesNotMatch(html, /Süreç Bileşenleri/);
});

test("K. planning hours remain unchanged in detail cards", () => {
  const plan5 = planning.buildGrade5SciencePlan(calendar);
  const week1 = plan5.weeks[0]; // 4 hours lab
  const html = renderToStaticMarkup(
    React.createElement(ScienceDetailCards, {
      items: week1.items,
      className: "5-A",
      week: dummyWeek,
    })
  );

  assert.match(html, /<dt>Bu hafta<\/dt><dd>4 saat<\/dd>/);
  assert.match(html, /<dt>Toplam plan<\/dt><dd>4 saat<\/dd>/);
});

test("L. no AppData/schema change occurred", async () => {
  const typesSource = await readFile(new URL("../app/lib/types.ts", import.meta.url), "utf8");
  const migrationsSource = await readFile(new URL("../app/lib/migrations.ts", import.meta.url), "utf8");

  assert.doesNotMatch(typesSource, /schemaVersion\s*=\s*2/);
  assert.match(migrationsSource, /CURRENT_SCHEMA_VERSION = 1/);
});
