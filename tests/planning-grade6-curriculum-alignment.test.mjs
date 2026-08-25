import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleCache = new Map();
const dataUriMap = new Map();

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
    const baseDir = relPath.substring(0, relPath.lastIndexOf("/"));
    const targetRelPath = importPath.startsWith("./")
      ? `${baseDir}/${importPath.slice(2)}.ts`
      : importPath.startsWith("../")
        ? `${baseDir.substring(0, baseDir.lastIndexOf("/"))}/${importPath.slice(3)}.ts`
        : `app/lib/${importPath}.ts`;
    await importTypeScript(targetRelPath);
    const targetUrl = new URL(`../${targetRelPath}`, import.meta.url).pathname;
    const targetDataUri = dataUriMap.get(targetUrl);
    transpiled = transpiled.replace(match[0], `${kind} ${specifiers} from "${targetDataUri}"`);
  }

  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  dataUriMap.set(filePath, dataUri);
  const mod = await import(dataUri);
  moduleCache.set(filePath, mod);
  return mod;
}

const { officialCurriculumRegistry, grade6CurriculumMetadata } = await importTypeScript("app/lib/curriculum/index.ts");
const planning = await importTypeScript("app/lib/planning.ts");

// ==========================================
// Alignment Tests A through L
// ==========================================

test("A. every Grade 6 planning outcomeCode exists in official Grade 6 registry", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const plannedCodes = plan.weeks
    .flatMap((w) => w.items)
    .map((item) => item.outcomeCode)
    .filter(Boolean);

  for (const code of plannedCodes) {
    const official = officialCurriculumRegistry.get(code);
    assert.ok(official, `Planned outcome code '${code}' must exist in official registry`);
    assert.equal(official.grade, 6);
    assert.equal(official.curriculumFamily, "maarif");
  }
});

test("B. official Grade 6 codes all represented in planning", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );

  assert.equal(uniquePlannedCodes.size, 36);
  for (const record of grade6CurriculumMetadata) {
    assert.ok(uniquePlannedCodes.has(record.outcomeCode), `Official code ${record.outcomeCode} must be present in planning`);
  }
});

test("C. planning-only Grade 6 codes === []", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );
  const officialCodes = new Set(grade6CurriculumMetadata.map((r) => r.outcomeCode));

  const planningOnly = [...uniquePlannedCodes].filter((c) => !officialCodes.has(c));
  assert.deepEqual(planningOnly, []);
});

test("D. official-only Grade 6 codes === []", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );
  const officialCodes = new Set(grade6CurriculumMetadata.map((r) => r.outcomeCode));

  const officialOnly = [...officialCodes].filter((c) => !uniquePlannedCodes.has(c));
  assert.deepEqual(officialOnly, []);
});

test("E. unique planning official codes === 36", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const uniquePlannedCodes = new Set(
    plan.weeks.flatMap((w) => w.items).map((i) => i.outcomeCode).filter(Boolean)
  );
  assert.equal(uniquePlannedCodes.size, 36);
});

test("F. duplicate use of FB.6.4.3.3 is allowed (term transition split)", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const itemsForFB6433 = plan.weeks
    .flatMap((w) => w.items)
    .filter((item) => item.outcomeCode === "FB.6.4.3.3");

  assert.ok(itemsForFB6433.length >= 2);
});

test("G. FB.6.4.3.3 total planning hours remain 4", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const total = plan.weeks
    .flatMap((w) => w.items)
    .filter((item) => item.outcomeCode === "FB.6.4.3.3")
    .reduce((sum, item) => sum + item.hours, 0);

  assert.equal(total, 4);
});

test("H. Grade 6 total planned hours === 140", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);
  assert.equal(plan.totalHours, 140);
});

test("I. first term === 68 hours", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);
  assert.equal(plan.firstTermHours, 68);
});

test("J. second term === 72 hours", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);
  assert.equal(plan.secondTermHours, 72);
});

test("K. unit totals remain: 12, 14, 24, 22, 32, 18, 18", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = planning.buildGrade6SciencePlan(calendar);
  assert.ok(plan);

  const hoursByUnit = new Map();
  for (const week of plan.weeks) {
    for (const item of week.items) {
      hoursByUnit.set(item.unit, (hoursByUnit.get(item.unit) ?? 0) + item.hours);
    }
  }

  assert.equal(hoursByUnit.get(1), 12);
  assert.equal(hoursByUnit.get(2), 14);
  assert.equal(hoursByUnit.get(3), 24);
  assert.equal(hoursByUnit.get(4), 22);
  assert.equal(hoursByUnit.get(5), 32);
  assert.equal(hoursByUnit.get(6), 18);
  assert.equal(hoursByUnit.get(7), 18);
});

test("L. no Grade 5/7/8 behavior changed", () => {
  const calendar = planning.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan5 = planning.buildGrade5SciencePlan(calendar);
  const plan7 = planning.buildGrade7SciencePlan(calendar);
  const plan8 = planning.buildGrade8SciencePlan(calendar);

  assert.ok(plan5);
  assert.equal(plan5.totalHours, 140);
  assert.ok(plan7);
  assert.equal(plan7.totalHours, 140);
  assert.ok(plan8);
  assert.equal(plan8.totalHours, 140);
});
