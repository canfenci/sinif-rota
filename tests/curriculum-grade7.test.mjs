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
  grade7CurriculumMetadata,
  officialCurriculumRegistry,
  createCurriculumRegistry,
} = await importTypeScript("app/lib/curriculum/index.ts");

// ==========================================
// Targeted Tests for Grade 7 Curriculum
// ==========================================

test("A. Grade 7 dataset is non-empty", () => {
  assert.ok(Array.isArray(grade7CurriculumMetadata));
  assert.ok(grade7CurriculumMetadata.length > 0);
});

test("B. exact official outcome count from source is 36", () => {
  assert.equal(grade7CurriculumMetadata.length, 36);
});

test("C. all records grade === 7", () => {
  for (const record of grade7CurriculumMetadata) {
    assert.equal(record.grade, 7);
  }
});

test("D. all records curriculumFamily === maarif", () => {
  for (const record of grade7CurriculumMetadata) {
    assert.equal(record.curriculumFamily, "maarif");
  }
});

test("E. every outcomeCode is unique", () => {
  const codes = grade7CurriculumMetadata.map((r) => r.outcomeCode);
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, 36);
});

test("F. all codes match full official 4-level pattern FB.7.X.Y.Z", () => {
  for (const record of grade7CurriculumMetadata) {
    assert.match(record.outcomeCode, /^FB\.7\.\d+\.\d+\.\d+$/);
  }
});

test("G. truncated 3-level codes are strictly not in registry", () => {
  assert.equal(officialCurriculumRegistry.get("FB.7.1.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.7.2.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.7.3.1"), null);
  assert.equal(officialCurriculumRegistry.get("FB.7.5.2"), null);
  assert.equal(officialCurriculumRegistry.get("FB.7.7.1"), null);
});

test("H. all 7 official units represented", () => {
  const units = new Set(grade7CurriculumMetadata.map((r) => r.unitCode));
  assert.equal(units.size, 7);
  for (let i = 1; i <= 7; i++) {
    assert.ok(units.has(`FB.7.${i}`));
  }
});

test("I. every unitName non-empty and matches official title", () => {
  const unitMap = new Map([
    ["FB.7.1", "Uzay Çağı"],
    ["FB.7.2", "Kuvvet ve Enerjiyi Keşfedelim"],
    ["FB.7.3", "Vücudumuzdaki Sistemler"],
    ["FB.7.4", "Işığın Kırılması ve Mercekler"],
    ["FB.7.5", "Maddenin Doğasına Yolculuk"],
    ["FB.7.6", "Elektriklenme"],
    ["FB.7.7", "Sürdürülebilir Yaşam ve Enerji"],
  ]);

  for (const record of grade7CurriculumMetadata) {
    assert.ok(record.unitName);
    assert.equal(record.unitName, unitMap.get(record.unitCode));
  }
});

test("J. every outcomeDescription is non-empty, trimmed, and ends with infinitive (-ebilme/-abilme)", () => {
  for (const record of grade7CurriculumMetadata) {
    assert.ok(typeof record.outcomeDescription === "string");
    assert.ok(record.outcomeDescription.trim().length > 0);
    assert.match(record.outcomeDescription, /(ebilme|abilme)$/);
  }
});

test("K. unit-specific official MEB TYMM source URLs are mapped correctly", () => {
  const unitUrlMap = new Map([
    ["FB.7.1", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/416"],
    ["FB.7.2", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/429"],
    ["FB.7.3", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/430"],
    ["FB.7.4", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/431"],
    ["FB.7.5", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/432"],
    ["FB.7.6", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/433"],
    ["FB.7.7", "https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/434"],
  ]);

  for (const record of grade7CurriculumMetadata) {
    assert.ok(record.source);
    assert.equal(record.source.url, unitUrlMap.get(record.unitCode));
    assert.equal(record.source.documentName, "2024programfen345678Onayli.pdf");
  }
});

test("L. every Grade 7 outcome has non-empty official process components (36/36)", () => {
  for (const record of grade7CurriculumMetadata) {
    assert.ok(Array.isArray(record.processComponents), `processComponents must be array for ${record.outcomeCode}`);
    assert.ok(record.processComponents.length > 0, `processComponents must not be empty for ${record.outcomeCode}`);
    for (const component of record.processComponents) {
      assert.ok(typeof component === "string");
      assert.match(component, /^[a-zçğıöşü]\)\s+.+/i, `Component must start with letter bullet: "${component}"`);
    }
  }
});

test("M. representative Unit 1 (FB.7.1.1.1) exact process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.1.1.1");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Uzay araştırmaları için geliştirilen teknolojileri karşılaştırabilme");
  assert.equal(item.processComponents.length, 3);
  assert.equal(item.processComponents[0], "a) Uzay araştırmaları için geliştirilen teknolojilerin özelliklerini belirler.");
  assert.equal(item.processComponents[1], "b) Uzay araştırmaları için geliştirilen teknolojilerin özelliklerine göre benzerliklerini listeler.");
  assert.equal(item.processComponents[2], "c) Uzay araştırmaları için geliştirilen teknolojilerin özelliklerine göre farklılıklarını listeler.");
});

test("N. representative Unit 1 (FB.7.1.1.3) exact 5 process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.1.1.3");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Uzay araştırmalarının yol açabileceği problemleri çözebilme");
  assert.equal(item.processComponents.length, 5);
  assert.equal(item.processComponents[0], "a) Uzay araştırmalarının yol açabileceği problemleri yapılandırır.");
  assert.equal(item.processComponents[1], "b) Uzay araştırmalarının yol açabileceği problemleri özetler.");
  assert.equal(item.processComponents[2], "c) Uzay araştırmalarının yol açabileceği problemlerin çözümüne yönelik veriye dayalı tahminde bulunur.");
  assert.equal(item.processComponents[3], "ç) Uzay araştırmalarının yol açabileceği problemlerin çözümüne yönelik önermeler üzerinden akıl yürütür.");
  assert.equal(item.processComponents[4], "d) Uzay araştırmalarının yol açabileceği problemlerin çözümüne ilişkin değerlendirmede bulunur.");
});

test("O. representative Unit 3 (FB.7.3.1.2) exact process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.3.1.2");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Sindirim sisteminin sağlığı için yapılması gerekenler konusunda bilgi toplayabilme");
  assert.equal(item.processComponents.length, 4);
  assert.equal(item.processComponents[0], "a) Sindirim sisteminin sağlığı ile ilgili bilgiye ulaşmak için kullanacağı araçları belirler.");
  assert.equal(item.processComponents[1], "b) Belirlediği araçları kullanarak sindirim sisteminin sağlığı hakkında bilgiler bulur.");
  assert.equal(item.processComponents[2], "c) Sindirim sisteminin sağlığı hakkında bulduğu bilgileri doğrular.");
  assert.equal(item.processComponents[3], "ç) Sindirim sisteminin sağlığı hakkında bulduğu bilgileri kaydeder.");
});

test("P. representative Unit 4 (FB.7.4.1.1) exact process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.4.1.1");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Ortam değiştiren ışığın izlediği yolu gözlemleyerek kırılma olayına yönelik bilimsel çıkarım yapabilme");
  assert.equal(item.processComponents.length, 3);
  assert.equal(item.processComponents[0], "a) Işık ışınlarının kırılmasına yönelik nitelikleri tanımlar.");
  assert.equal(item.processComponents[1], "b) Farklı yoğunluklara sahip ortamlarda ışığın kırılmasına yönelik verileri toplayarak kaydeder.");
  assert.equal(item.processComponents[2], "c) Az yoğun ortamda ve çok yoğun ortamda ışığın izlediği yolları yorumlar ve değerlendirir.");
});

test("Q. representative Unit 5 (FB.7.5.1.2) exact 5 process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.5.1.2");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Geçmişten günümüze atom kavramı ile ilgili bilimsel bilgilerin değişebileceğini sorgulayabilme");
  assert.equal(item.processComponents.length, 5);
  assert.equal(item.processComponents[0], "a) Geçmişten günümüze atomun sürecini açıklar.");
  assert.equal(item.processComponents[1], "b) Geçmişten günümüze atom ile ilgili sorular sorar.");
  assert.equal(item.processComponents[2], "c) Geçmişten günümüze atom ile ilgili bilgi toplar.");
  assert.equal(item.processComponents[3], "ç) Toplanan bilgilerin doğruluğunu değerlendirir.");
  assert.equal(item.processComponents[4], "d) Toplanan bilgiler üzerinde çıkarım yapar.");
});

test("R. representative Unit 7 (FB.7.7.2.1) exact 6 process components match source", () => {
  const item = officialCurriculumRegistry.get("FB.7.7.2.1");
  assert.ok(item);
  assert.equal(item.outcomeDescription, "Kaynakların tasarruflu kullanımının önemini sorgulayabilme");
  assert.equal(item.processComponents.length, 6);
  assert.equal(item.processComponents[0], "a) Kaynakların tasarruflu kullanımı ile ilgili problemi tanımlar.");
  assert.equal(item.processComponents[1], "b) Kaynakların tasarruflu kullanımına yönelik çözüm bulmak için model geliştirir.");
  assert.equal(item.processComponents[2], "c) Kaynakların tasarruflu kullanımına yönelik planladığı araştırmayı gerçekleştirir.");
  assert.equal(item.processComponents[3], "ç) Kaynakların tasarruflu kullanımına yönelik analiz ettiği verileri yorumlar.");
  assert.equal(item.processComponents[4], "d) Kaynakların tasarruflu kullanımına yönelik kanıta dayalı çözüm üretir.");
  assert.equal(item.processComponents[5], "e) Kaynakların tasarruflu kullanımına yönelik bilgileri değerlendirir ve paylaşır.");
});

test("S. dataset builds registry without duplicate exception", () => {
  const reg = createCurriculumRegistry(grade7CurriculumMetadata);
  assert.equal(reg.size, 36);
});

test("T. mutation of retrieved record does not mutate registry", () => {
  const retrieved = officialCurriculumRegistry.get("FB.7.1.1.1");
  assert.ok(retrieved);
  retrieved.outcomeDescription = "MUTATED";
  const fresh = officialCurriculumRegistry.get("FB.7.1.1.1");
  assert.equal(fresh?.outcomeDescription, "Uzay araştırmaları için geliştirilen teknolojileri karşılaştırabilme");
});
