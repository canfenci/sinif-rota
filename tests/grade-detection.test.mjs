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
const pageContent = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("A. Home page and planning use the same grade detection helper (detectClassGrade)", () => {
  assert.ok(pageContent.includes("detectClassGrade(item.name)"), "Home class-card must use detectClassGrade(item.name)");
  assert.ok(!pageContent.includes("item.name.match(/[5-8]/)"), "Home must not use the loose /[5-8]/ regex");
  assert.equal(typeof planning.detectClassGrade, "function", "planning must export detectClassGrade");
});

test("B. 5-A detects grade 5", () => {
  assert.equal(planning.detectClassGrade("5-A"), 5);
  assert.equal(planning.detectClassGrade("5 A"), 5);
  assert.equal(planning.detectClassGrade("5/A"), 5);
});

test("C. 6-A detects grade 6", () => {
  assert.equal(planning.detectClassGrade("6-A"), 6);
});

test("D. 7-A detects grade 7", () => {
  assert.equal(planning.detectClassGrade("7-A"), 7);
});

test("E. 8-A detects grade 8", () => {
  assert.equal(planning.detectClassGrade("8-A"), 8);
});

test("F. 'Sınıf 10' detects no grade", () => {
  assert.equal(planning.detectClassGrade("Sınıf 10"), null);
  assert.equal(planning.detectClassGrade("Sınıf 10 - Grup 5"), null);
});

test("G. 'Grup 5' detects no grade", () => {
  assert.equal(planning.detectClassGrade("Grup 5"), null);
});

test("H. '15-A' detects no grade", () => {
  assert.equal(planning.detectClassGrade("15-A"), null);
  assert.equal(planning.detectClassGrade("105"), null);
  assert.equal(planning.detectClassGrade("2026-5"), null);
  assert.equal(planning.detectClassGrade("5abc"), null);
});

test("I. Grade color tokens are unchanged", () => {
  assert.ok(css.includes("--grade-5:#279B98"));
  assert.ok(css.includes("--grade-6:#E8B94F"));
  assert.ok(css.includes("--grade-7:#4F8B63"));
  assert.ok(css.includes("--grade-8:#F06B5B"));
});

test("J. Home class-card click behavior is preserved", () => {
  assert.ok(pageContent.includes("onClick={() => onClass(item.id)}"), "Class-card click must call onClass(item.id)");
});

test("K. Annual Plan grade routing uses the same detection (buildSciencePlanForClass present, driven by detectClassGrade)", () => {
  assert.equal(typeof planning.buildSciencePlanForClass, "function");
  assert.equal(planning.detectClassGrade("5-A"), 5);
  assert.equal(planning.detectClassGrade("15-A"), null);
  assert.equal(planning.detectClassGrade("Grup 5"), null);
});

test("L. Quick Check status colors are unchanged", () => {
  assert.ok(css.includes(".status-complete.selected{background:var(--green)}"));
  assert.ok(css.includes(".status-partial.selected{background:var(--amber);color:var(--ink)}"));
  assert.ok(css.includes(".status-missing.selected{background:var(--red)}"));
  assert.ok(css.includes(".status-absent.selected{background:var(--blue)}"));
});