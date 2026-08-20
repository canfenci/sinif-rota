import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const logic = await importTypeScript("app/lib/data.ts");
const source = { id: "a", name: "5-A", students: [{ id: "s1", number: 1, name: "Ayşe" }, { id: "s2", number: 2, name: "Mehmet" }] };
const target = { id: "b", name: "5-B", students: [{ id: "b1", number: 2, name: "Başka Öğrenci" }] };
const session = { id: "x", classId: "a", className: "5-A", type: "Ödev", date: "2026-08-20T09:00:00.000Z", statuses: { s1: "complete", s2: "missing" } };
const data = { classes: [source, target], sessions: [session] };

test("taşıma numara çakışmasını atlar ve geçmiş kontrolü korur", () => {
  const result = logic.applyBulkStudentAction(data, "a", ["s1", "s2"], "move", "b", () => "new");
  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.data.classes[0].students.map((student) => student.id), ["s2"]);
  assert.deepEqual(result.data.classes[1].students.map((student) => student.id), ["s1", "b1"]);
  assert.deepEqual(result.data.sessions[0].statuses, session.statuses);
});

test("kopyalama hedef sınıfta yeni kimlik oluşturur", () => {
  const result = logic.applyBulkStudentAction(data, "a", ["s1"], "copy", "b", () => "copy-s1");
  assert.equal(result.data.classes[0].students.length, 2);
  assert.deepEqual(result.data.classes[1].students[0], { id: "copy-s1", number: 1, name: "Ayşe" });
});

test("pasif öğrenci aktif sayılmaz ve yeniden etkinleştirilebilir", () => {
  const passive = logic.applyBulkStudentAction(data, "a", ["s1"], "deactivate", undefined, () => "unused");
  assert.equal(logic.activeStudentCount(passive.data.classes[0]), 1);
  const active = logic.applyBulkStudentAction(passive.data, "a", ["s1"], "activate", undefined, () => "unused");
  assert.equal(logic.activeStudentCount(active.data.classes[0]), 2);
});

test("toplu silme ilişkili öğrenci durumlarını da temizler", () => {
  const result = logic.applyBulkStudentAction(data, "a", ["s1", "s2"], "delete", undefined, () => "unused");
  assert.equal(result.data.classes[0].students.length, 0);
  assert.deepEqual(result.data.sessions[0].statuses, {});
});

test("sınıf çoğaltma benzersiz sınıf ve öğrenci kimlikleri üretir", () => {
  let index = 0;
  const result = logic.duplicateClass(data, "a", () => `id-${++index}`);
  const copy = result.data.classes.at(-1);
  assert.equal(copy.name, "5-A Kopya");
  assert.notEqual(copy.id, source.id);
  assert.deepEqual(copy.students.map((student) => student.id), ["id-2", "id-3"]);
});
