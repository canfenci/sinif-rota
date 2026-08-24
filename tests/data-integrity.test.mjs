import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const dataLogic = await importTypeScript("app/lib/data.ts");
const importLogic = await importTypeScript("app/lib/import-students.ts");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const studentImportSource = await readFile(new URL("../app/components/StudentImport.tsx", import.meta.url), "utf8");

const studentA = { id: "student-a", number: 1, name: "Ayşe Yılmaz" };
const studentB = { id: "student-b", number: 2, name: "Berk Kaya" };
const studentC = { id: "student-c", number: 3, name: "Cem Akın" };
const otherStudent = { id: "student-other", number: 20, name: "Deniz Arı" };
const classA = { id: "class-a", name: "8-A", students: [studentA, studentB, studentC] };
const classB = { id: "class-b", name: "8-B", students: [otherStudent] };
const sessionA = { id: "session-a", classId: classA.id, className: classA.name, type: "Ödev", date: "2026-09-07T09:00:00.000Z", statuses: { [studentA.id]: "complete", [studentB.id]: "missing", [studentC.id]: "partial" } };
const sessionB = { id: "session-b", classId: classB.id, className: classB.name, type: "Defter", date: "2026-09-08T09:00:00.000Z", statuses: { [otherStudent.id]: "complete" } };
const workCalendar = { schoolYear: "2026-2027", startDate: "2026-09-07", endDate: "2027-06-18", breaks: [] };
const planA = { id: "plan-a", classId: classA.id, schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Doğal sayılar", note: "", completed: false };
const planB = { id: "plan-b", classId: classB.id, schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Kesirler", note: "", completed: false };
const futureField = { enabled: true, revision: 3 };

function createData() {
  return { classes: [classA, classB], sessions: [sessionA, sessionB], workCalendar, annualPlanEntries: [planA, planB], futureField };
}

function assertUniqueIds(data) {
  const classIds = data.classes.map((item) => item.id);
  const studentIds = data.classes.flatMap((item) => item.students.map((student) => student.id));
  assert.equal(new Set(classIds).size, classIds.length, "class IDs must be unique");
  assert.equal(new Set(studentIds).size, studentIds.length, "current roster student IDs must be unique");
}

function assertCurrentClassReferences(data) {
  const classIds = new Set(data.classes.map((item) => item.id));
  data.sessions.forEach((session) => assert.equal(classIds.has(session.classId), true, `session ${session.id} has a missing class`));
  (data.annualPlanEntries ?? []).forEach((entry) => assert.equal(classIds.has(entry.classId), true, `annual plan ${entry.id} has a missing class`));
}

function archiveClassLikeUi(data, classId, archived) {
  return { ...data, classes: data.classes.map((item) => item.id === classId ? { ...item, archived } : item) };
}

test("toplu silme yalnız seçilen öğrencileri ve ilgili durumları temizler", () => {
  const initial = createData();
  const result = dataLogic.applyBulkStudentAction(initial, classA.id, [studentA.id, studentB.id], "delete", undefined, () => "unused");
  assert.deepEqual(result.data.classes[0].students, [studentC]);
  assert.deepEqual(result.data.sessions[0].statuses, { [studentC.id]: "partial" });
  assert.strictEqual(result.data.classes[1], classB);
  assert.strictEqual(result.data.sessions[1], sessionB);
  assert.strictEqual(result.data.workCalendar, workCalendar);
  assert.deepEqual(result.data.annualPlanEntries, [planA, planB]);
  assert.strictEqual(result.data.futureField, futureField);
});

test("boş toplu seçim AppData üzerinde değişiklik yapmaz", () => {
  const initial = createData();
  const result = dataLogic.applyBulkStudentAction(initial, classA.id, [], "delete", undefined, () => "unused");
  assert.strictEqual(result.data, initial);
  assert.deepEqual({ processed: result.processed, skipped: result.skipped }, { processed: 0, skipped: 0 });
});

test("sınıf silme yalnız hedef sınıfın roster, session ve yıllık plan ilişkilerini cascade temizler", () => {
  const result = dataLogic.removeClass(createData(), classA.id);
  assert.deepEqual(result.classes, [classB]);
  assert.deepEqual(result.sessions, [sessionB]);
  assert.deepEqual(result.annualPlanEntries, [planB]);
  assert.strictEqual(result.workCalendar, workCalendar);
  assert.strictEqual(result.futureField, futureField);
  assertCurrentClassReferences(result);
});

test("sınıf arşivleme ve geri açma yalnız archived alanını değiştirir", () => {
  const initial = createData();
  const archived = archiveClassLikeUi(initial, classA.id, true);
  const restored = archiveClassLikeUi(archived, classA.id, false);
  assert.equal(archived.classes[0].archived, true);
  assert.strictEqual(archived.classes[0].students, classA.students);
  assert.strictEqual(archived.classes[1], classB);
  assert.strictEqual(archived.sessions, initial.sessions);
  assert.strictEqual(archived.workCalendar, workCalendar);
  assert.strictEqual(archived.annualPlanEntries, initial.annualPlanEntries);
  assert.strictEqual(archived.futureField, futureField);
  assert.equal(restored.classes[0].archived, false);
  assert.match(pageSource, /classes: current\.classes\.map\(\(item\) => item\.id === targetId \? \{ \.\.\.item, archived \} : item\)/);
});

test("pasif ve tekrar aktif öğrenci kimliğini, geçmişi ve diğer AppData alanlarını korur", () => {
  const initial = createData();
  const passive = dataLogic.applyBulkStudentAction(initial, classA.id, [studentA.id], "deactivate", undefined, () => "unused").data;
  const active = dataLogic.applyBulkStudentAction(passive, classA.id, [studentA.id], "activate", undefined, () => "unused").data;
  assert.deepEqual(passive.classes[0].students.find((item) => item.id === studentA.id), { ...studentA, active: false });
  assert.deepEqual(active.classes[0].students.find((item) => item.id === studentA.id), { ...studentA, active: true });
  assert.strictEqual(passive.classes[0].students[1], studentB);
  assert.strictEqual(passive.sessions, initial.sessions);
  assert.strictEqual(passive.workCalendar, workCalendar);
  assert.strictEqual(passive.annualPlanEntries, initial.annualPlanEntries);
  assert.strictEqual(passive.futureField, futureField);
});

test("öğrenci kopyalama yeni kimlik üretir ve geçmişi kopyaya bağlamaz", () => {
  const initial = createData();
  const result = dataLogic.applyBulkStudentAction(initial, classA.id, [studentA.id], "copy", classB.id, () => "student-copy").data;
  const copied = result.classes[1].students.find((item) => item.id === "student-copy");
  assert.deepEqual(copied, { ...studentA, id: "student-copy" });
  assert.strictEqual(result.classes[0], classA);
  assert.equal(result.sessions.some((session) => "student-copy" in session.statuses), false);
  assert.strictEqual(result.workCalendar, workCalendar);
  assert.strictEqual(result.annualPlanEntries, initial.annualPlanEntries);
  assert.strictEqual(result.futureField, futureField);
  assertUniqueIds(result);
});

test("sınıf çoğaltma yeni kimlikler üretir; geçmiş ve yıllık planı clone etmez", () => {
  const ids = ["class-copy", "student-copy-a", "student-copy-b", "student-copy-c"];
  const initial = createData();
  const result = dataLogic.duplicateClass(initial, classA.id, () => ids.shift()).data;
  const copy = result.classes.at(-1);
  assert.equal(copy.id, "class-copy");
  assert.deepEqual(copy.students.map((item) => item.id), ["student-copy-a", "student-copy-b", "student-copy-c"]);
  assert.strictEqual(result.classes[0], classA);
  assert.strictEqual(result.sessions, initial.sessions);
  assert.strictEqual(result.annualPlanEntries, initial.annualPlanEntries);
  assert.equal(result.sessions.some((session) => session.classId === copy.id), false);
  assert.equal(result.annualPlanEntries.some((entry) => entry.classId === copy.id), false);
  assert.strictEqual(result.workCalendar, workCalendar);
  assert.strictEqual(result.futureField, futureField);
  assertUniqueIds(result);
  assertCurrentClassReferences(result);
});

test("import hedef sınıfı birleştirirken AppData ve sınıf izolasyonunu korur", () => {
  const initial = createData();
  const rows = importLogic.analyzeImportRows([
    { sourceRow: 2, numberText: "4", name: "Ece Işık" },
    { sourceRow: 3, numberText: "2", name: "Berk Yeni" },
  ], classA.students, "update");
  const merged = importLogic.mergeImportedStudents(classA.students, rows, () => "student-imported");
  const result = { ...initial, classes: initial.classes.map((item) => item.id === classA.id ? { ...item, students: merged.students } : item) };
  assert.deepEqual({ added: merged.added, updated: merged.updated }, { added: 1, updated: 1 });
  assert.deepEqual(result.classes[0].students.find((item) => item.id === studentB.id), { ...studentB, name: "Berk Yeni" });
  assert.deepEqual(result.classes[0].students.find((item) => item.id === "student-imported"), { id: "student-imported", number: 4, name: "Ece Işık" });
  assert.strictEqual(result.classes[1], classB);
  assert.strictEqual(result.sessions, initial.sessions);
  assert.strictEqual(result.workCalendar, workCalendar);
  assert.strictEqual(result.annualPlanEntries, initial.annualPlanEntries);
  assert.strictEqual(result.futureField, futureField);
  assertUniqueIds(result);
  assert.match(pageSource, /classes: current\.classes\.map\(\(item\) => item\.id === schoolClass\.id \? \{ \.\.\.item, students \} : item\)/);
});

test("öğrenci numarası aynı sınıfta engellenir, farklı sınıflarda bağımsız değerlendirilir", () => {
  const duplicateInA = importLogic.analyzeImportRows([{ sourceRow: 2, numberText: "1", name: "Yeni Ad" }], classA.students, "skip");
  const sameNumberInB = importLogic.analyzeImportRows([{ sourceRow: 2, numberText: "1", name: "Farklı Öğrenci" }], classB.students, "skip");
  assert.equal(duplicateInA[0].status, "skip");
  assert.equal(sameNumberInB[0].status, "add");
  assert.equal(dataLogic.studentNumberExists(classA.students, 1), true);
  assert.equal(dataLogic.studentNumberExists(classB.students, 1), false);
});

test("undo destekli mutasyonlar tam AppData snapshot'ını geri yükleyecek şekilde bağlanır", () => {
  const before = createData();
  const changed = dataLogic.applyBulkStudentAction(before, classA.id, [studentA.id], "deactivate", undefined, () => "unused").data;
  assert.notDeepEqual(changed, before);
  const undoSnapshot = before;
  assert.deepEqual(undoSnapshot, createData());
  assert.match(pageSource, /const before = data;[\s\S]*applyBulkStudentAction\(data,[\s\S]*showToast\([^;]*, before\);/);
  assert.match(pageSource, /function undoLast\(\) \{[\s\S]*setData\(undoSnapshot\);/);
  assert.match(pageSource, /showToast\("Sınıf ve öğrenci listesi çoğaltıldı", before\)/);
  assert.match(pageSource, /showToast\(archived \? "Sınıf arşivlendi" : "Sınıf yeniden etkinleştirildi", before\)/);
});

test("öğrenci ekleme, kopyalama, sınıf çoğaltma ve import benzersiz kimlik üreticisine bağlıdır", () => {
  assert.match(pageSource, /students: \(editedId \?/);
  assert.match(pageSource, /\[\.\.\.item\.students, \{ id: crypto\.randomUUID\(\), name, number \}\]/);
  assert.match(pageSource, /applyBulkStudentAction\(data,[\s\S]*\(\) => crypto\.randomUUID\(\)\)/);
  assert.match(pageSource, /duplicateClass\(data, editTarget\.item\.id, \(\) => crypto\.randomUUID\(\)\)/);
  assert.match(studentImportSource, /mergeImportedStudents\(schoolClass\.students, analyzed, \(\) => crypto\.randomUUID\(\)\)/);
});
