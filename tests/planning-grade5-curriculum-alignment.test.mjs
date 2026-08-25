import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleCache = new Map();

async function importTypeScript(relPath) {
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const filePath = fileUrl.pathname;
  if (moduleCache.has(filePath)) {
    return moduleCache.get(filePath);
  }

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
    const targetRelPath = relPath.startsWith("app/lib/curriculum/")
      ? `app/lib/curriculum/${importPath.replace(/^\.\//, "")}.ts`
      : `app/lib/${importPath.replace(/^\.\//, "")}.ts`;
    await importTypeScript(targetRelPath);
    const targetSource = await readFile(new URL(`../${targetRelPath}`, import.meta.url), "utf8");
    const targetTranspiled = ts.transpileModule(targetSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const targetDataUri = "data:text/javascript;base64," + Buffer.from(targetTranspiled).toString("base64");
    transpiled = transpiled.replace(match[0], `${kind} ${specifiers} from "${targetDataUri}"`);
  }

  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  const mod = await import(dataUri);
  moduleCache.set(filePath, mod);
  return mod;
}

const { officialCurriculumRegistry, grade5CurriculumMetadata } = await importTypeScript("app/lib/curriculum/index.ts");
const planning = await importTypeScript("app/lib/planning.ts");

// ==========================================
// Alignment Tests A through J
// ==========================================

test("A. every Grade 5 planning outcomeCode exists in official Grade 5 registry", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const plannedCodes = plan.weeks
    .flatMap((w) => w.items)
    .map((item) => item.outcomeCode)
    .filter(Boolean);

  for (const code of plannedCodes) {
    const official = officialCurriculumRegistry.get(code);
    assert.ok(official, `Planned outcome code '${code}' must exist in official registry`);
    assert.equal(official.grade, 5);
    assert.equal(official.curriculumFamily, "maarif");
  }
});

test("B. FB.5.6.2.2 does not appear anywhere in Grade 5 planning", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const allPlannedCodes = plan.weeks
    .flatMap((w) => w.items)
    .map((item) => item.outcomeCode);

  assert.ok(!allPlannedCodes.includes("FB.5.6.2.2"), "Fake code FB.5.6.2.2 must not exist in planning");
  assert.ok(!planning.grade5ScienceCurriculum.some((item) => item.code === "FB.5.6.2.2"));
});

test("C. FB.5.6.2.1 may appear in multiple planning blocks (pedagogical multi-segment)", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const matchingItems = plan.weeks
    .flatMap((w) => w.items)
    .filter((item) => item.outcomeCode === "FB.5.6.2.1");

  assert.ok(matchingItems.length >= 2, "FB.5.6.2.1 is planned across multiple pedagogical blocks/weeks");
  const totalHours = matchingItems.reduce((sum, item) => sum + item.hours, 0);
  assert.equal(totalHours, 10);
});

test("D. duplicate planning use of same official outcome is allowed", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  // Both FB.5.3.2.1 (term split) and FB.5.6.2.1 (block split) have multiple entries
  const u3ItemCount = plan.weeks.flatMap((w) => w.items).filter((i) => i.outcomeCode === "FB.5.3.2.1").length;
  const u6ItemCount = plan.weeks.flatMap((w) => w.items).filter((i) => i.outcomeCode === "FB.5.6.2.1").length;

  assert.ok(u3ItemCount >= 2);
  assert.ok(u6ItemCount >= 2);
});

test("E. Grade 5 planning has zero planning-only curriculum codes", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );

  const officialCodes = new Set(grade5CurriculumMetadata.map((r) => r.outcomeCode));

  const planningOnlyCodes = [...uniquePlannedCodes].filter((c) => !officialCodes.has(c));
  assert.deepEqual(planningOnlyCodes, [], "There should be 0 planning-only codes");
});

test("F. all 28 official Grade 5 outcomes are represented in planning", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );

  assert.equal(uniquePlannedCodes.size, 28);
  for (const record of grade5CurriculumMetadata) {
    assert.ok(uniquePlannedCodes.has(record.outcomeCode), `Official code ${record.outcomeCode} must be present in planning`);
  }
});

test("G. Grade 5 total planned hours remains exactly 140", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);
  assert.equal(plan.totalHours, 140);
  assert.equal(plan.firstTermHours, 68);
  assert.equal(plan.secondTermHours, 72);

  const sumOfAllWeekItems = plan.weeks
    .flatMap((w) => w.items)
    .reduce((sum, item) => sum + item.hours, 0);
  assert.equal(sumOfAllWeekItems, 140);
});

test("H. Unit 6 total planned hours unchanged (16 hours)", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const unit6Hours = plan.weeks
    .flatMap((w) => w.items)
    .filter((item) => item.unit === 6)
    .reduce((sum, item) => sum + item.hours, 0);

  assert.equal(unit6Hours, 16);
});

test("I. Grade 5 allocation order unchanged except corrected code identity", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade5SciencePlan(calendar);
  assert.ok(plan);

  const unitSequences = plan.weeks.flatMap((w) => w.items).map((item) => item.unit);
  // starts with 0 (prep), then 1, 2, 3, 4, 5, 6, 7 in order
  const unitTransitions = unitSequences.filter((u, idx) => idx === 0 || u !== unitSequences[idx - 1]);
  assert.deepEqual(unitTransitions, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("J. no Grade 6/7/8 planning behavior changed", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan6 = planning.buildGrade6SciencePlan(calendar);
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const plan8 = planning.buildGrade8SciencePlan(calendar);

  assert.ok(plan6);
  assert.equal(plan6.totalHours, 140);
  assert.ok(plan7);
  assert.equal(plan7.totalHours, 140);
  assert.ok(plan8);
  assert.equal(plan8.totalHours, 140);
});
