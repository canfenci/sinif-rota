import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

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
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
        targetRel = `${targetRel}.ts`;
      } catch {
        targetRel = `${targetRel}/index.ts`;
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

const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));

// ==========================================================
// Tests A through J: Planning-Curriculum Integration
// ==========================================================

test("A. Grade 5 planning output includes exact registry description and source URL", () => {
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);
  const itemsWithOutcome = plan.weeks.flatMap((w) => w.items).filter((it) => it.outcomeCode);
  assert.equal(itemsWithOutcome.length > 0, true);

  for (const item of itemsWithOutcome) {
    const meta = officialCurriculumRegistry.get(item.outcomeCode);
    assert.ok(meta, `Outcome ${item.outcomeCode} should exist in registry`);
    assert.ok(item.curriculum, `Item ${item.outcomeCode} must have curriculum attached`);
    assert.equal(item.curriculum.officialDescription, meta.outcomeDescription);
    assert.equal(item.curriculum.officialSource, meta.source.url);
    assert.equal(item.curriculum.grade, 5);
    assert.equal(item.curriculum.curriculumVersion, "Türkiye Yüzyılı Maarif Modeli");
  }
});

test("B. Grade 6 planning output includes exact registry description and source URL", () => {
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);
  const itemsWithOutcome = plan.weeks.flatMap((w) => w.items).filter((it) => it.outcomeCode);
  assert.equal(itemsWithOutcome.length > 0, true);

  for (const item of itemsWithOutcome) {
    const meta = officialCurriculumRegistry.get(item.outcomeCode);
    assert.ok(meta, `Outcome ${item.outcomeCode} should exist in registry`);
    assert.ok(item.curriculum, `Item ${item.outcomeCode} must have curriculum attached`);
    assert.equal(item.curriculum.officialDescription, meta.outcomeDescription);
    assert.equal(item.curriculum.officialSource, meta.source.url);
    assert.equal(item.curriculum.grade, 6);
    assert.equal(item.curriculum.curriculumVersion, "Türkiye Yüzyılı Maarif Modeli");
  }
});

test("C. Grade 7 planning output includes exact registry description and source URL", () => {
  const plan = planning.buildGrade7SciencePlan(calendar);
  assert.ok(plan);
  const itemsWithOutcome = plan.weeks.flatMap((w) => w.items).filter((it) => it.outcomeCode);
  assert.equal(itemsWithOutcome.length > 0, true);

  for (const item of itemsWithOutcome) {
    const meta = officialCurriculumRegistry.get(item.outcomeCode);
    assert.ok(meta, `Outcome ${item.outcomeCode} should exist in registry`);
    assert.ok(item.curriculum, `Item ${item.outcomeCode} must have curriculum attached`);
    assert.equal(item.curriculum.officialDescription, meta.outcomeDescription);
    assert.equal(item.curriculum.officialSource, meta.source.url);
    assert.equal(item.curriculum.grade, 7);
    assert.equal(item.curriculum.curriculumVersion, "Türkiye Yüzyılı Maarif Modeli");
  }
});

test("D. Grade 8 planning output includes exact official achievement description", () => {
  const plan = planning.buildGrade8SciencePlan(calendar);
  assert.ok(plan);
  const itemsWithOutcomes = plan.weeks.flatMap((w) => w.items).filter((it) => it.outcomeCodes && it.outcomeCodes.length > 0);
  assert.equal(itemsWithOutcomes.length > 0, true);

  for (const item of itemsWithOutcomes) {
    assert.ok(item.curricula, `Item ${item.title} must have curricula array`);
    for (const curriculum of item.curricula) {
      const meta = officialCurriculumRegistry.get(curriculum.code);
      assert.ok(meta, `Achievement ${curriculum.code} should exist in registry`);
      assert.equal(curriculum.officialDescription, meta.outcomeDescription);
      assert.equal(curriculum.officialSource, meta.source.url);
      assert.equal(curriculum.grade, 8);
      assert.equal(curriculum.curriculumVersion, "2018 Fen Bilimleri Dersi Öğretim Programı");
    }
  }
});

test("E. Grade 7 processComponents available through planning output", () => {
  const plan = planning.buildGrade7SciencePlan(calendar);
  const item = plan.weeks.flatMap((w) => w.items).find((it) => it.outcomeCode === "FB.7.1.1.1");
  assert.ok(item);
  assert.ok(item.curriculum);
  assert.equal(item.curriculum.processComponents.length, 3);
  assert.equal(item.curriculum.processComponents[0], "a) Uzay araştırmaları için geliştirilen teknolojilerin özelliklerini belirler.");
});

test("F. unknown planning code fails safely / resolves null without fallback text", () => {
  const outcome = planning.createPlanningCurriculumOutcome(5, 1, "FB.5.99.99.99");
  assert.equal(outcome.officialDescription, null);
  assert.equal(outcome.officialSource, null);
  assert.equal(outcome.processComponents.length, 0);
});

test("G. all planning codes for Grades 5–8 exist in registry (161 unique codes)", () => {
  const g5Codes = planning.grade5ScienceCurriculum.map((c) => c.code);
  const g6Codes = planning.grade6ScienceCurriculum.map((c) => c.code);
  const g7Codes = planning.grade7ScienceCurriculum.map((c) => c.code);
  const g8Codes = planning.grade8ScienceCurriculum.map((c) => c.code);

  assert.equal(g5Codes.length, 28);
  assert.equal(g6Codes.length, 36);
  assert.equal(g7Codes.length, 36);
  assert.equal(g8Codes.length, 61);

  const allCodes = [...g5Codes, ...g6Codes, ...g7Codes, ...g8Codes];
  assert.equal(new Set(allCodes).size, 161);

  for (const code of allCodes) {
    const meta = officialCurriculumRegistry.get(code);
    assert.ok(meta, `Planning code '${code}' must exist in official registry`);
    assert.ok(typeof meta.outcomeDescription === "string" && meta.outcomeDescription.length > 0);
  }
});

test("H. existing hour totals unchanged across all grades", () => {
  const p5 = planning.buildGrade5SciencePlan(calendar);
  const p6 = planning.buildGrade6SciencePlan(calendar);
  const p7 = planning.buildGrade7SciencePlan(calendar);
  const p8 = planning.buildGrade8SciencePlan(calendar);

  assert.equal(p5.totalHours, 140);
  assert.equal(p6.totalHours, 140);
  assert.equal(p7.totalHours, 140);
  assert.equal(p8.totalHours, 140);
});

test("I. existing unit/week allocation regression tests remain unchanged", () => {
  const p5 = planning.buildGrade5SciencePlan(calendar);
  assert.equal(p5.weeks.length, 35);
  assert.equal(p5.firstTermHours, 68);
  assert.equal(p5.secondTermHours, 72);

  const p6 = planning.buildGrade6SciencePlan(calendar);
  assert.equal(p6.weeks.length, 35);
  assert.equal(p6.firstTermHours, 68);
  assert.equal(p6.secondTermHours, 72);

  const p7 = planning.buildGrade7SciencePlan(calendar);
  assert.equal(p7.weeks.length, 35);
  assert.equal(p7.firstTermHours, 68);
  assert.equal(p7.secondTermHours, 72);

  const p8 = planning.buildGrade8SciencePlan(calendar);
  assert.equal(p8.weeks.length, 35);
  assert.equal(p8.firstTermHours, 72);
  assert.equal(p8.secondTermHours, 68);
});

test("J. manual plan overrides preserved", () => {
  const data = {
    classes: [{ id: "5-a", name: "5-A" }],
    sessions: [],
    workCalendar: calendar,
    annualPlanEntries: [
      { id: "manual-1", classId: "5-a", schoolYear: "2026-2027", weekStart: "2026-09-21", topic: "Özel Plan", note: "Not", completed: true }
    ],
  };
  const updated = planning.updateAnnualPlanEntry(data, "5-a", calendar, "2026-09-21", { topic: "Güncel Özel Plan", note: "Güncel Not", completed: true }, () => "unused");
  assert.equal(updated.annualPlanEntries.length, 1);
  assert.equal(updated.annualPlanEntries[0].topic, "Güncel Özel Plan");
});
