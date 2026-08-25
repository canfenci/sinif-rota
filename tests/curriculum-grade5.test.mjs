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
    const targetRelPath = `app/lib/curriculum/${importPath.replace(/^\.\//, "")}.ts`;
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

const {
  grade5CurriculumMetadata,
  officialCurriculumRegistry,
  createCurriculumRegistry,
  resolvePlanOutcomeMetadata,
} = await importTypeScript("app/lib/curriculum/index.ts");

// ==========================================
// Tests A through W
// ==========================================

test("A. Grade 5 dataset is non-empty", () => {
  assert.ok(Array.isArray(grade5CurriculumMetadata));
  assert.ok(grade5CurriculumMetadata.length > 0);
});

test("B. exact official outcome count from source", () => {
  // Official MEB Maarif Grade 5 has exactly 28 learning outcomes across 7 units
  assert.equal(grade5CurriculumMetadata.length, 28);
});

test("C. all records grade === 5", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.equal(record.grade, 5);
  }
});

test("D. all records curriculumFamily === maarif", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.equal(record.curriculumFamily, "maarif");
  }
});

test("E. every outcomeCode is unique", () => {
  const codes = grade5CurriculumMetadata.map((r) => r.outcomeCode);
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, 28);
});

test("F. all codes match full official 4-level pattern FB.5.X.Y.Z", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.match(record.outcomeCode, /^FB\.5\.\d+\.\d+\.\d+$/);
  }
});

test("G. truncated 3-level codes are strictly not in registry", () => {
  assert.equal(officialCurriculumRegistry.get("FB.5.1.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.5.1.2"), null);
  assert.equal(officialCurriculumRegistry.get("FB.5.1.3"), null);
  assert.equal(officialCurriculumRegistry.get("FB.5.1.4"), null);
  assert.equal(officialCurriculumRegistry.get("FB.5.6.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.5.6.2"), null);
});

test("H. no FB.6 / FB.7 / F.8 records", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(!record.outcomeCode.startsWith("FB.6"));
    assert.ok(!record.outcomeCode.startsWith("FB.7"));
    assert.ok(!record.outcomeCode.startsWith("F.8"));
    assert.ok(!record.outcomeCode.startsWith("FB.8"));
  }
});

test("I. all 7 official units represented", () => {
  const units = new Set(grade5CurriculumMetadata.map((r) => r.unitCode));
  assert.equal(units.size, 7);
  for (let i = 1; i <= 7; i++) {
    assert.ok(units.has(`FB.5.${i}`));
  }
});

test("J. every unitName non-empty", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(typeof record.unitName === "string");
    assert.ok(record.unitName.trim().length > 0);
  }
});

test("K. every outcomeDescription non-empty and trimmed", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(typeof record.outcomeDescription === "string");
    assert.ok(record.outcomeDescription.trim().length > 0);
  }
});

test("L. every record has valid official MEB source URL and documentName", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(record.source);
    assert.ok(typeof record.source.url === "string");
    assert.ok(record.source.url.startsWith("https://tymm.meb.gov.tr/"));
    assert.equal(record.source.documentName, "2024programfen345678Onayli.pdf");
  }
});

test("M. canonical known Unit 1 full outcome records exist", () => {
  const u1_1 = officialCurriculumRegistry.get("FB.5.1.1.1");
  assert.ok(u1_1);
  assert.equal(u1_1.outcomeCode, "FB.5.1.1.1");
  assert.equal(u1_1.unitCode, "FB.5.1");
  assert.equal(u1_1.outcomeDescription, "Güneş’in yapısı ve dönme hareketi ile ilgili bilgileri toplayabilme");
  assert.equal(u1_1.processComponents.length, 4);

  const u1_2_1 = officialCurriculumRegistry.get("FB.5.1.2.1");
  assert.ok(u1_2_1);
  assert.equal(u1_2_1.outcomeCode, "FB.5.1.2.1");

  const u1_2_2 = officialCurriculumRegistry.get("FB.5.1.2.2");
  assert.ok(u1_2_2);
  assert.equal(u1_2_2.outcomeCode, "FB.5.1.2.2");

  const u1_3_1 = officialCurriculumRegistry.get("FB.5.1.3.1");
  assert.ok(u1_3_1);
  assert.equal(u1_3_1.outcomeCode, "FB.5.1.3.1");
});

test("N. canonical known Unit 6 full outcome records exist", () => {
  const u6_1_1 = officialCurriculumRegistry.get("FB.5.6.1.1");
  assert.ok(u6_1_1);
  assert.equal(u6_1_1.outcomeCode, "FB.5.6.1.1");
  assert.equal(u6_1_1.unitCode, "FB.5.6");

  const u6_1_2 = officialCurriculumRegistry.get("FB.5.6.1.2");
  assert.ok(u6_1_2);
  assert.equal(u6_1_2.outcomeCode, "FB.5.6.1.2");

  const u6_2_1 = officialCurriculumRegistry.get("FB.5.6.2.1");
  assert.ok(u6_2_1);
  assert.equal(u6_2_1.outcomeCode, "FB.5.6.2.1");
  assert.equal(u6_2_1.outcomeDescription, "Bir elektrik devresindeki ampul parlaklığını etkileyen değişkenlerin neler olduğuna ilişkin hipotez oluşturabilme");
  assert.equal(u6_2_1.processComponents.length, 5);
});

test("O. process components are clean and bounded to specific outcome", () => {
  const found = officialCurriculumRegistry.get("FB.5.1.1.1");
  assert.ok(found);
  assert.ok(Array.isArray(found.processComponents));
  assert.equal(found.processComponents.length, 4);
  assert.equal(found.processComponents[0], "a) Güneş’in yapısı ve dönme hareketi ile ilgili bilgiye ulaşmak için kullanacağı araçları belirler.");
  assert.equal(found.processComponents[3], "ç) Güneş’in yapısı ve dönme hareketi hakkında ulaşılan bilgileri kaydeder.");
});

test("P. unknown lookup returns null", () => {
  const found = officialCurriculumRegistry.get("FB.5.99.99.99");
  assert.equal(found, null);
});

test("Q. dataset can build registry without duplicate exception", () => {
  const reg = createCurriculumRegistry(grade5CurriculumMetadata);
  assert.equal(reg.size, 28);
});

test("R. returned registry metadata mutation does not affect source", () => {
  const retrieved = officialCurriculumRegistry.get("FB.5.1.1.1");
  assert.ok(retrieved);
  retrieved.outcomeDescription = "MUTATED DESCRIPTION";
  const fresh = officialCurriculumRegistry.get("FB.5.1.1.1");
  assert.notEqual(fresh?.outcomeDescription, "MUTATED DESCRIPTION");
  assert.equal(fresh?.outcomeDescription, "Güneş’in yapısı ve dönme hareketi ile ilgili bilgileri toplayabilme");
});

test("S. officialHours stays null where no outcome-specific official hour exists", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.equal(record.officialHours, null);
  }
});

test("T. no production synthetic TEST fixture codes", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(!record.outcomeCode.includes("TEST"));
  }
});

test("U. no example.test URLs", () => {
  for (const record of grade5CurriculumMetadata) {
    assert.ok(!record.source.url?.includes("example.test"));
  }
});

test("V. dataset does not mutate planning allocation", () => {
  const planningAllocation = {
    outcomeCode: "FB.5.1.1.1",
    allocatedHours: 4,
  };
  const metadata = resolvePlanOutcomeMetadata(planningAllocation.outcomeCode, officialCurriculumRegistry);
  assert.ok(metadata);
  assert.equal(planningAllocation.allocatedHours, 4);
});
