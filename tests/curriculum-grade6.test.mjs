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
  grade6CurriculumMetadata,
  officialCurriculumRegistry,
  createCurriculumRegistry,
} = await importTypeScript("app/lib/curriculum/index.ts");

// ==========================================
// Tests A through V
// ==========================================

test("A. Grade 6 dataset is non-empty", () => {
  assert.ok(Array.isArray(grade6CurriculumMetadata));
  assert.ok(grade6CurriculumMetadata.length > 0);
});

test("B. exact official outcome count from source is 36", () => {
  assert.equal(grade6CurriculumMetadata.length, 36);
});

test("C. all records grade === 6", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.equal(record.grade, 6);
  }
});

test("D. all records curriculumFamily === maarif", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.equal(record.curriculumFamily, "maarif");
  }
});

test("E. every outcomeCode is unique", () => {
  const codes = grade6CurriculumMetadata.map((r) => r.outcomeCode);
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, 36);
});

test("F. all codes match full official 4-level pattern FB.6.X.Y.Z", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.match(record.outcomeCode, /^FB\.6\.\d+\.\d+\.\d+$/);
  }
});

test("G. truncated 3-level codes are strictly not in registry", () => {
  assert.equal(officialCurriculumRegistry.get("FB.6.1.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.6.1.2"), null);
  assert.equal(officialCurriculumRegistry.get("FB.6.3.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.6.3.2"), null);
  assert.equal(officialCurriculumRegistry.get("FB.6.6.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.6.7.2"), null);
});

test("H. all 7 official units represented", () => {
  const units = new Set(grade6CurriculumMetadata.map((r) => r.unitCode));
  assert.equal(units.size, 7);
  for (let i = 1; i <= 7; i++) {
    assert.ok(units.has(`FB.6.${i}`));
  }
});

test("I. correct per-unit outcome counts (4, 3, 9, 7, 6, 3, 4)", () => {
  const countsByUnit = new Map();
  for (const record of grade6CurriculumMetadata) {
    countsByUnit.set(record.unitCode, (countsByUnit.get(record.unitCode) ?? 0) + 1);
  }
  assert.equal(countsByUnit.get("FB.6.1"), 4);
  assert.equal(countsByUnit.get("FB.6.2"), 3);
  assert.equal(countsByUnit.get("FB.6.3"), 9);
  assert.equal(countsByUnit.get("FB.6.4"), 7);
  assert.equal(countsByUnit.get("FB.6.5"), 6);
  assert.equal(countsByUnit.get("FB.6.6"), 3);
  assert.equal(countsByUnit.get("FB.6.7"), 4);
});

test("J. every unitName non-empty and trimmed", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.ok(typeof record.unitName === "string");
    assert.ok(record.unitName.trim().length > 0);
  }
});

test("K. every outcomeDescription non-empty and trimmed", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.ok(typeof record.outcomeDescription === "string");
    assert.ok(record.outcomeDescription.trim().length > 0);
  }
});

test("L. all source URLs official tymm.meb.gov.tr", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.ok(record.source);
    assert.ok(typeof record.source.url === "string");
    assert.ok(record.source.url.startsWith("https://tymm.meb.gov.tr/"));
  }
});

test("M. every record source documentName exact", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.equal(record.source.documentName, "2024programfen345678Onayli.pdf");
  }
});

test("N. canonical Unit 1 codes exist", () => {
  const codes = ["FB.6.1.1.1", "FB.6.1.1.2", "FB.6.1.2.1", "FB.6.1.2.2"];
  for (const code of codes) {
    const outcome = officialCurriculumRegistry.get(code);
    assert.ok(outcome, `Outcome ${code} must exist`);
    assert.equal(outcome.unitCode, "FB.6.1");
  }
  const u1_1_1 = officialCurriculumRegistry.get("FB.6.1.1.1");
  assert.equal(u1_1_1.outcomeDescription, "Güneş sistemindeki gezegenleri niteliklerine göre sınıflandırabilme");
  assert.equal(u1_1_1.processComponents.length, 4);
});

test("O. canonical Unit 3 code exists: FB.6.3.1.5", () => {
  const outcome = officialCurriculumRegistry.get("FB.6.3.1.5");
  assert.ok(outcome);
  assert.equal(outcome.unitCode, "FB.6.3");
  assert.equal(outcome.outcomeDescription, "İnsanda üremeyi sağlayan yapı ve organlar arasındaki ilişkileri çözümleyebilme");
  assert.equal(outcome.processComponents.length, 2);
});

test("P. canonical Unit 7 code exists: FB.6.7.2.2", () => {
  const outcome = officialCurriculumRegistry.get("FB.6.7.2.2");
  assert.ok(outcome);
  assert.equal(outcome.unitCode, "FB.6.7");
  assert.equal(outcome.outcomeDescription, "Yakın çevresindeki veya ülkemizdeki bir çevre problemine ilişkin çözüm üretebilme");
  assert.equal(outcome.processComponents.length, 5);
});

test("P2. canonical Unit 6 code exists: FB.6.6.2.2", () => {
  const outcome = officialCurriculumRegistry.get("FB.6.6.2.2");
  assert.ok(outcome);
  assert.equal(outcome.unitCode, "FB.6.6");
  assert.equal(outcome.outcomeDescription, "Ayarlanabilir direncin ampulün parlaklığına etkilerine yönelik bilimsel çıkarım yapabilme");
  assert.equal(outcome.processComponents.length, 3);
});

test("Q. unknown lookup returns null", () => {
  assert.equal(officialCurriculumRegistry.get("FB.6.99.99.99"), null);
});

test("R. registry builds without duplicate exception (Grade 6 = 36, Total = 161)", () => {
  const reg = createCurriculumRegistry([...grade6CurriculumMetadata]);
  assert.equal(reg.size, 36);
  assert.equal(officialCurriculumRegistry.size, 28 + 36 + 36 + 61);
});

test("S. officialHours all null if no outcome-specific hours", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.equal(record.officialHours, null);
  }
});

test("T. no TEST codes", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.ok(!record.outcomeCode.includes("TEST"));
  }
});

test("U. no example.test URLs", () => {
  for (const record of grade6CurriculumMetadata) {
    assert.ok(!record.source.url?.includes("example.test"));
  }
});

test("V. registry immutability preserved", () => {
  const retrieved = officialCurriculumRegistry.get("FB.6.1.1.1");
  assert.ok(retrieved);
  retrieved.outcomeDescription = "MUTATED";
  const fresh = officialCurriculumRegistry.get("FB.6.1.1.1");
  assert.notEqual(fresh?.outcomeDescription, "MUTATED");
  assert.equal(fresh?.outcomeDescription, "Güneş sistemindeki gezegenleri niteliklerine göre sınıflandırabilme");
});
