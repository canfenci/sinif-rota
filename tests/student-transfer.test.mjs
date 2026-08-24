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
const statsLogic = await importTypeScript("app/lib/stats.ts");

const student = { id: "student-1", number: 7, name: "Deniz Yılmaz" };
const classA = { id: "class-a", name: "8-A", students: [student] };
const classB = { id: "class-b", name: "8-B", students: [] };
const classC = { id: "class-c", name: "8-C", students: [] };
const sessionA = {
  id: "session-a",
  classId: classA.id,
  className: classA.name,
  type: "Ödev",
  date: "2026-09-07T09:00:00.000Z",
  statuses: { [student.id]: "complete" },
};
const workCalendar = { schoolYear: "2026-2027", startDate: "2026-09-07", endDate: "2027-06-18", breaks: [] };
const annualPlanEntries = [{ id: "plan-a", classId: classA.id, schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Konu", note: "", completed: false }];
const futureField = { preserved: true };
const initialData = { classes: [classA, classB, classC], sessions: [sessionA], workCalendar, annualPlanEntries, futureField };

function move(data, sourceClassId, targetClassId) {
  return dataLogic.applyBulkStudentAction(data, sourceClassId, [student.id], "move", targetClassId, () => "unused").data;
}

test("taşınan öğrenci yalnızca hedef sınıf listesinde kalır", () => {
  const moved = move(initialData, classA.id, classB.id);
  assert.deepEqual(moved.classes.find((item) => item.id === classA.id).students, []);
  assert.deepEqual(moved.classes.find((item) => item.id === classB.id).students, [student]);
  assert.strictEqual(moved.workCalendar, workCalendar);
  assert.strictEqual(moved.annualPlanEntries, annualPlanEntries);
  assert.strictEqual(moved.futureField, futureField);
});

test("taşıma eski oturumun sınıfını ve öğrenci durumunu değiştirmez", () => {
  const moved = move(initialData, classA.id, classB.id);
  assert.deepEqual(moved.sessions, [sessionA]);
  assert.equal(moved.sessions[0].classId, classA.id);
  assert.equal(moved.sessions[0].statuses[student.id], "complete");
  assert.equal(moved.classes.flatMap((item) => item.students).filter((item) => item.id === student.id).length, 1);
});

test("taşıma sonrasındaki yeni kontrol hedef sınıfa yazılır", () => {
  const moved = move(initialData, classA.id, classB.id);
  const target = moved.classes.find((item) => item.id === classB.id);
  const sessionB = dataLogic.createCheckSession(target, "Ödev", { [student.id]: "missing" }, "2026-09-14T09:00:00.000Z", () => "session-b");
  assert.equal(sessionB.classId, classB.id);
  assert.equal(sessionB.className, classB.name);
  assert.equal(moved.sessions[0].classId, classA.id);
});

test("öğrenci geçmişi eski ve yeni sınıftaki kontrolleri birlikte gösterir", () => {
  const moved = move(initialData, classA.id, classB.id);
  const target = moved.classes.find((item) => item.id === classB.id);
  const sessionB = dataLogic.createCheckSession(target, "Ödev", { [student.id]: "missing" }, "2026-09-14T09:00:00.000Z", () => "session-b");
  const history = statsLogic.studentHistorySessions(student.id, [...moved.sessions, sessionB]);
  const homework = statsLogic.studentStats(student.id, history).find((item) => item.type === "Ödev");
  assert.deepEqual(history.map((session) => session.id), ["session-a", "session-b"]);
  assert.deepEqual({ complete: homework.complete, missing: homework.missing, considered: homework.considered, rate: homework.rate }, { complete: 1, missing: 1, considered: 2, rate: 50 });
});

test("sınıf geçmişleri yalnızca o sınıfta gerçekleşen kontrolleri içerir", () => {
  const sessionB = dataLogic.createCheckSession(classB, "Defter", { [student.id]: "partial" }, "2026-09-14T09:00:00.000Z", () => "session-b");
  const sessions = [sessionA, sessionB];
  assert.deepEqual(statsLogic.classHistorySessions(classA.id, sessions), [sessionA]);
  assert.deepEqual(statsLogic.classHistorySessions(classB.id, sessions), [sessionB]);
});

test("A-B-C şeklindeki tekrarlı taşımalar kimliği ve tüm geçmişi korur", () => {
  const movedToB = move(initialData, classA.id, classB.id);
  const currentB = movedToB.classes.find((item) => item.id === classB.id);
  const sessionB = dataLogic.createCheckSession(currentB, "Kitap", { [student.id]: "complete" }, "2026-09-14T09:00:00.000Z", () => "session-b");
  const withSessionB = { ...movedToB, sessions: [...movedToB.sessions, sessionB] };
  const movedToC = move(withSessionB, classB.id, classC.id);
  const currentStudent = movedToC.classes.find((item) => item.id === classC.id).students[0];
  const sessionC = dataLogic.createCheckSession(classC, "Defter", { [student.id]: "partial" }, "2026-09-21T09:00:00.000Z", () => "session-c");
  const allSessions = [...movedToC.sessions, sessionC];
  assert.equal(currentStudent.id, student.id);
  assert.deepEqual(movedToC.classes.filter((item) => item.students.some((person) => person.id === student.id)).map((item) => item.id), [classC.id]);
  assert.deepEqual(statsLogic.studentHistorySessions(student.id, allSessions).map((session) => session.classId), [classA.id, classB.id, classC.id]);
  assert.deepEqual(statsLogic.classHistorySessions(classA.id, allSessions).map((session) => session.id), ["session-a"]);
  assert.deepEqual(statsLogic.classHistorySessions(classB.id, allSessions).map((session) => session.id), ["session-b"]);
  assert.deepEqual(statsLogic.classHistorySessions(classC.id, allSessions).map((session) => session.id), ["session-c"]);
  assert.strictEqual(movedToC.workCalendar, workCalendar);
  assert.strictEqual(movedToC.annualPlanEntries, annualPlanEntries);
});
