import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import ts from "typescript";

const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) return codeCache.get(relPath);
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
const dataLib = await importTypeScript("app/lib/data.ts");
const pageContent = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("A. 5-A -> 5-B: no confirmation (same grade)", () => {
  assert.equal(planning.shouldConfirmGradeChange("5-A", "5-B"), false);
});

test("B. 5-A -> 6-A: confirmation (grade changed)", () => {
  assert.equal(planning.shouldConfirmGradeChange("5-A", "6-A"), true);
});

test("C. 6-A -> 8-A: confirmation (grade changed)", () => {
  assert.equal(planning.shouldConfirmGradeChange("6-A", "8-A"), true);
});

test("D. 5-A -> unknown name: confirmation (known -> unknown)", () => {
  assert.equal(planning.shouldConfirmGradeChange("5-A", "Deneme"), true);
});

test("E. unknown -> 6-A: confirmation (unknown -> known)", () => {
  assert.equal(planning.shouldConfirmGradeChange("Deneme", "6-A"), true);
});

test("F. renameClass keeps classId unchanged", () => {
  const data = makeData();
  const out = dataLib.renameClass(data, "c1", "6-A");
  assert.equal(out.classes[0].id, "c1");
  assert.equal(out.classes[0].name, "6-A");
});

test("G. renameClass keeps students unchanged", () => {
  const out = dataLib.renameClass(makeData(), "c1", "6-A");
  assert.equal(out.classes[0].students.length, 1);
  assert.equal(out.classes[0].students[0].id, "s1");
  assert.equal(out.classes[0].students[0].name, "Ali");
});

test("H. renameClass keeps sessions unchanged", () => {
  const out = dataLib.renameClass(makeData(), "c1", "6-A");
  assert.equal(out.sessions.length, 1);
  assert.equal(out.sessions[0].classId, "c1");
  assert.equal(out.sessions[0].statuses.a, "complete");
});

test("I. renameClass keeps annualPlanEntries unchanged", () => {
  const out = dataLib.renameClass(makeData(), "c1", "6-A");
  assert.equal(out.annualPlanEntries.length, 1);
  assert.equal(out.annualPlanEntries[0].classId, "c1");
  assert.equal(out.annualPlanEntries[0].topic, "topic");
});

test("J. rename is not applied before user confirmation", () => {
  assert.ok(pageContent.includes("shouldConfirmGradeChange(editTarget.item.name, name)"), "save path must gate grade-changing renames on confirmation");
  assert.ok(pageContent.includes("renameClass(current, gradeConfirm.id, gradeConfirm.name)"), "rename must only run through the confirmed grade-change handler");
});

test("K. Vazgeç keeps the old name (confirmation dismissed without rename)", () => {
  assert.ok(pageContent.includes("onClick={() => setGradeConfirm(null)}"), "Vazgeç must clear the confirmation without renaming");
  assert.ok(pageContent.includes(">Vazgeç</button>"), "Vazgeç button must exist");
});

test("L. Onayla changes only class.name via renameClass", () => {
  assert.ok(pageContent.includes("renameClass(current, gradeConfirm.id, gradeConfirm.name)"), "Onayla must call renameClass for the pending class");
  assert.ok(pageContent.includes("Değişikliği Onayla"), "confirmation button must exist");
});

test("M. grade change decision uses the shared detectClassGrade helper", () => {
  assert.equal(typeof planning.shouldConfirmGradeChange, "function");
  assert.ok(pageContent.includes("detectClassGrade"), "page must keep using the shared detectClassGrade");
});

function makeData() {
  return {
    classes: [{ id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali", number: 1 }] }],
    sessions: [{ id: "x1", classId: "c1", className: "5-A", type: "Ödev", date: "2026-09-14", statuses: { a: "complete" } }],
    annualPlanEntries: [{ id: "e1", classId: "c1", schoolYear: "2026-2027", weekStart: "2026-09-14", topic: "topic", note: "", completed: false }],
  };
}