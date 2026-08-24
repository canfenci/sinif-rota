import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const quickCheck = await importTypeScript("app/lib/quick-check.ts");
const dataLogic = await importTypeScript("app/lib/data.ts");
const statsLogic = await importTypeScript("app/lib/stats.ts");
const statusCycle = ["complete", "partial", "missing", "absent"];
const names = ["Ali Can", "Ali Can Yılmaz", "Mehmet Demir", "Mehmet Demirci", "Muhammed Mustafa Karaoğlanoğlu"];

function students(count, prefix = "a") {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-student-${index + 1}`, number: index + 1, name: `${names[index % names.length]} ${Math.floor(index / names.length) + 1}` }));
}

for (const size of [30, 40, 50]) {
  test(`${size} öğrencilik hızlı girişte her ID doğru tek durumla eşleşir`, () => {
    const roster = students(size);
    let statuses = quickCheck.createInitialCheckStatuses(roster);
    roster.forEach((student, index) => { statuses = quickCheck.updateCheckStatus(statuses, student.id, statusCycle[index % statusCycle.length]); });
    assert.equal(Object.keys(statuses).length, size);
    roster.forEach((student, index) => assert.equal(statuses[student.id], statusCycle[index % statusCycle.length]));
  });
}

test("aynı öğrencinin hızlı durum döngüsünde yalnız son durum kalır", () => {
  const roster = students(50);
  let statuses = quickCheck.createInitialCheckStatuses(roster);
  for (const status of ["complete", "partial", "missing", "absent", "complete"]) statuses = quickCheck.updateCheckStatus(statuses, roster[17].id, status);
  assert.equal(statuses[roster[17].id], "complete");
  assert.equal(Object.keys(statuses).length, 50);
});

test("aynı duruma tekrar basmak sonucu değiştirmez ve duplicate üretmez", () => {
  const roster = students(50);
  let statuses = quickCheck.createInitialCheckStatuses(roster);
  statuses = quickCheck.updateCheckStatus(statuses, roster[4].id, "absent");
  statuses = quickCheck.updateCheckStatus(statuses, roster[4].id, "absent");
  assert.equal(statuses[roster[4].id], "absent");
  assert.equal(Object.keys(statuses).length, 50);
});

test("Gelmedi tek değer olarak saklanır ve başarı paydasına girmez", () => {
  const roster = students(30);
  const statuses = quickCheck.updateCheckStatus(quickCheck.createInitialCheckStatuses(roster), roster[2].id, "absent");
  const schoolClass = { id: "class-a", name: "8-A", students: roster };
  const session = dataLogic.createCheckSession(schoolClass, "Ödev", statuses, "2026-10-01T09:00:00.000Z", () => "session-a");
  const homework = statsLogic.studentStats(roster[2].id, [session]).find((item) => item.type === "Ödev");
  assert.equal(session.statuses[roster[2].id], "absent");
  assert.deepEqual({ absent: homework.absent, considered: homework.considered }, { absent: 1, considered: 0 });
});

test("farklı sınıfların yoğun kontrol oturumları birbirinden ayrılır", () => {
  const classA = { id: "class-a", name: "8-A", students: students(50, "a") };
  const classB = { id: "class-b", name: "8-B", students: students(50, "b") };
  const statusesA = classA.students.reduce((current, student, index) => quickCheck.updateCheckStatus(current, student.id, statusCycle[index % 4]), quickCheck.createInitialCheckStatuses(classA.students));
  const statusesB = classB.students.reduce((current, student, index) => quickCheck.updateCheckStatus(current, student.id, statusCycle[(index + 1) % 4]), quickCheck.createInitialCheckStatuses(classB.students));
  const sessionA = dataLogic.createCheckSession(classA, "Defter", statusesA, "2026-10-01T09:00:00.000Z", () => "session-a");
  const sessionB = dataLogic.createCheckSession(classB, "Defter", statusesB, "2026-10-01T10:00:00.000Z", () => "session-b");
  assert.equal(sessionA.classId, classA.id);
  assert.equal(sessionB.classId, classB.id);
  assert.equal(Object.keys(sessionA.statuses).length, 50);
  assert.equal(Object.keys(sessionB.statuses).length, 50);
  assert.equal(Object.keys(sessionA.statuses).some((id) => id.startsWith("b-")), false);
  assert.equal(Object.keys(sessionB.statuses).some((id) => id.startsWith("a-")), false);
});

test("JSON persistence turu session, ID ve unrelated AppData alanlarını korur", () => {
  const schoolClass = { id: "class-a", name: "8-A", students: students(50) };
  const statuses = schoolClass.students.reduce((current, student, index) => quickCheck.updateCheckStatus(current, student.id, statusCycle[index % 4]), quickCheck.createInitialCheckStatuses(schoolClass.students));
  const session = dataLogic.createCheckSession(schoolClass, "Kitap", statuses, "2026-10-02T09:00:00.000Z", () => "session-a");
  const workCalendar = { schoolYear: "2026-2027", startDate: "2026-09-07", endDate: "2027-06-18", breaks: [] };
  const annualPlanEntries = [{ id: "plan-1", classId: schoolClass.id, schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Konu", note: "Not", completed: false }];
  const restored = JSON.parse(JSON.stringify({ classes: [schoolClass], sessions: [session], workCalendar, annualPlanEntries }));
  assert.equal(restored.sessions.length, 1);
  assert.equal(restored.sessions[0].classId, schoolClass.id);
  assert.deepEqual(restored.sessions[0].statuses, statuses);
  assert.deepEqual(restored.workCalendar, workCalendar);
  assert.deepEqual(restored.annualPlanEntries, annualPlanEntries);
});
