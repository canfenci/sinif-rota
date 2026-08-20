import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const logic = await importTypeScript("app/lib/import-students.ts");

test("başlık satırını ve ayrı ad-soyad sütunlarını algılar", () => {
  const rows = [
    ["2026-2027 Öğrenci Listesi"],
    ["Okul No", "Adı", "Soyadı"],
    [101, "Ayşe", "Yılmaz"],
  ];
  const headerRow = logic.detectHeaderRow(rows);
  const mapping = logic.detectColumns(rows[headerRow]);
  assert.equal(headerRow, 1);
  assert.deepEqual(mapping, { number: 0, name: 1, surname: 2 });
  assert.deepEqual(logic.rowsFromSheet(rows, headerRow, mapping), [{ sourceRow: 3, name: "Ayşe Yılmaz", numberText: "101" }]);
});

test("hatalı, tekrarlanan ve sınıfta mevcut numaraları ayırır", () => {
  const rows = [
    { sourceRow: 2, numberText: "12", name: "Yeni Öğrenci" },
    { sourceRow: 3, numberText: "20", name: "Güncel İsim" },
    { sourceRow: 4, numberText: "12", name: "Tekrar Öğrenci" },
    { sourceRow: 5, numberText: "ABC", name: "Hatalı Numara" },
  ];
  const existing = [{ id: "student-20", number: 20, name: "Eski İsim" }];
  assert.deepEqual(logic.analyzeImportRows(rows, existing, "skip").map((row) => row.status), ["error", "skip", "error", "error"]);
  assert.equal(logic.analyzeImportRows(rows, existing, "update")[1].status, "update");
});

test("geçerli satırları ekler ve seçilen mevcut öğrenciyi günceller", () => {
  const existing = [{ id: "student-20", number: 20, name: "Eski İsim" }];
  const rows = logic.analyzeImportRows([
    { sourceRow: 2, numberText: "10", name: "Yeni Öğrenci" },
    { sourceRow: 3, numberText: "20", name: "Güncel İsim" },
  ], existing, "update");
  const result = logic.mergeImportedStudents(existing, rows, () => "student-10");
  assert.deepEqual(result.students, [
    { id: "student-10", number: 10, name: "Yeni Öğrenci" },
    { id: "student-20", number: 20, name: "Güncel İsim" },
  ]);
  assert.deepEqual({ added: result.added, updated: result.updated, errors: result.errors }, { added: 1, updated: 1, errors: 0 });
});

test("XLSX, XLS ve CSV dosyaları aynı öğrenci tablosuna çevrilir", async () => {
  const { read, utils, write } = await import("xlsx");
  const worksheet = utils.aoa_to_sheet([["Okul Numarası", "Ad Soyad"], [101, "Ayşe Yılmaz"]]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Öğrenciler");
  const files = [
    [write(workbook, { type: "buffer", bookType: "xlsx" }), undefined],
    [write(workbook, { type: "buffer", bookType: "biff8" }), undefined],
    ["Okul Numarası,Ad Soyad\n101,Ayşe Yılmaz", { type: "string" }],
  ];
  for (const [file, options] of files) {
    const parsed = read(file, options);
    const matrix = utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], { header: 1, defval: "", raw: false });
    assert.deepEqual(matrix, [["Okul Numarası", "Ad Soyad"], ["101", "Ayşe Yılmaz"]]);
  }
});
