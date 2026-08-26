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
  grade8CurriculumMetadata,
  officialCurriculumRegistry,
  createCurriculumRegistry,
} = await importTypeScript("app/lib/curriculum/index.ts");

// ==========================================
// Tests A through O for Grade 8 Curriculum (2018)
// ==========================================

test("A. Grade 8 dataset is non-empty", () => {
  assert.ok(Array.isArray(grade8CurriculumMetadata));
  assert.ok(grade8CurriculumMetadata.length > 0);
});

test("B. exact official achievement count from 2018 source is 61", () => {
  assert.equal(grade8CurriculumMetadata.length, 61);
});

test("C. all records grade === 8", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.equal(record.grade, 8);
  }
});

test("D. all records curriculumFamily === fen-2018", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.equal(record.curriculumFamily, "fen-2018");
  }
});

test("E. every outcomeCode is unique", () => {
  const codes = grade8CurriculumMetadata.map((r) => r.outcomeCode);
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, 61);
});

test("F. all codes match canonical 2018 pattern F.8.X.Y.Z", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.match(record.outcomeCode, /^F\.8\.\d+\.\d+\.\d+$/);
  }
});

test("G. no Maarif-style FB.8 codes exist in 2018 dataset", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.ok(!record.outcomeCode.startsWith("FB.8"));
  }
});

test("H. all 7 official 2018 units represented", () => {
  const units = new Set(grade8CurriculumMetadata.map((r) => r.unitCode));
  assert.equal(units.size, 7);
  for (let i = 1; i <= 7; i++) {
    assert.ok(units.has(`F.8.${i}`));
  }
});

test("I. every unitName non-empty and matches official 2018 unit title", () => {
  const unitMap = new Map([
    ["F.8.1", "Mevsimler ve İklim"],
    ["F.8.2", "DNA ve Genetik Kod"],
    ["F.8.3", "Basınç"],
    ["F.8.4", "Madde ve Endüstri"],
    ["F.8.5", "Basit Makineler"],
    ["F.8.6", "Enerji Dönüşümleri ve Çevre Bilimi"],
    ["F.8.7", "Elektrik Yükleri ve Elektrik Enerjisi"],
  ]);

  for (const record of grade8CurriculumMetadata) {
    assert.ok(record.unitName);
    assert.equal(record.unitName, unitMap.get(record.unitCode));
  }
});

test("J. every achievement description is non-empty, trimmed, and source-bound", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.ok(typeof record.outcomeDescription === "string");
    assert.ok(record.outcomeDescription.trim().length > 0);
  }
});

test("K. Maarif-only deep metadata fields are not fabricated for Grade 8", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.ok(!record.processComponents || record.processComponents.length === 0);
    assert.ok(!record.learningEvidence || record.learningEvidence.length === 0);
    assert.ok(!record.skills || record.skills.length === 0);
    assert.ok(!record.values || record.values.length === 0);
    assert.ok(!record.literacySkills || record.literacySkills.length === 0);
  }
});

test("L. every record has valid official 2018 MEB source URL and documentName", () => {
  for (const record of grade8CurriculumMetadata) {
    assert.ok(record.source);
    assert.ok(typeof record.source.url === "string");
    assert.ok(record.source.url.includes("2018"));
    assert.equal(record.source.documentName, "FEN BİLİMLERİ ÖĞRETİM PROGRAMI 2018.pdf");
  }
});

test("M. canonical known 2018 achievement records resolve from registry", () => {
  const f1_1 = officialCurriculumRegistry.get("F.8.1.1.1");
  assert.ok(f1_1);
  assert.equal(f1_1.outcomeCode, "F.8.1.1.1");
  assert.equal(f1_1.unitName, "Mevsimler ve İklim");
  assert.equal(f1_1.outcomeDescription, "Mevsimlerin oluşumuna yönelik tahminlerde bulunur.");

  const f4_1 = officialCurriculumRegistry.get("F.8.4.1.1");
  assert.ok(f4_1);
  assert.equal(f4_1.outcomeCode, "F.8.4.1.1");
  assert.equal(f4_1.unitName, "Madde ve Endüstri");
  assert.equal(f4_1.outcomeDescription, "Periyodik sistemde, grup ve periyotların nasıl oluşturulduğunu açıklar.");
});

test("N. dataset builds registry without duplicate exception", () => {
  const reg = createCurriculumRegistry(grade8CurriculumMetadata);
  assert.equal(reg.size, 61);
});

test("O. total registry count spans all 4 grades (28 + 36 + 36 + 61 = 161)", () => {
  assert.equal(officialCurriculumRegistry.size, 161);
});
