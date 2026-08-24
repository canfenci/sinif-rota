import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const { CURRENT_SCHEMA_VERSION, detectSchemaVersion, migrateV0ToV1, migrateData } = await importTypeScript("app/lib/migrations.ts");

const sampleStudentA = { id: "student-1", name: "Ahmet Yılmaz", number: 12, active: true };
const sampleStudentB = { id: "student-2", name: "Ayşe Kaya", number: 15, active: false };
const sampleClass = { id: "class-5a", name: "5-A", students: [sampleStudentA, sampleStudentB], archived: false };
const sampleSession = {
  id: "session-1",
  classId: "class-5a",
  className: "5-A",
  type: "Ödev",
  date: "2026-09-20T09:00:00.000Z",
  statuses: { "student-1": "complete", "student-2": "absent" },
};
const sampleCalendar = {
  schoolYear: "2026-2027",
  startDate: "2026-09-14",
  endDate: "2027-06-25",
  breaks: [
    { id: "break-1", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
    { id: "break-grade8", title: "Sosyal Etkinlik", startDate: "2027-01-18", endDate: "2027-01-22", grades: [5, 6, 7] },
  ],
};
const samplePlanEntry = {
  id: "plan-entry-1",
  classId: "class-5a",
  schoolYear: "2026-2027",
  weekStart: "2026-09-14",
  topic: "Güneş ve Ay Tutulmaları",
  note: "Laboratuvar hazırlığı tamamlandı",
  completed: true,
};
const sampleUnknownField = { settingA: true, theme: "dark", customData: [1, 2, 3] };

function createLegacyV0() {
  return {
    classes: [sampleClass],
    sessions: [sampleSession],
    workCalendar: sampleCalendar,
    annualPlanEntries: [samplePlanEntry],
    customPluginConfig: sampleUnknownField,
  };
}

test("A. missing schemaVersion is detected as legacy v0", () => {
  const legacy = createLegacyV0();
  assert.equal(detectSchemaVersion(legacy), 0);
  assert.equal(detectSchemaVersion({ classes: [] }), 0);
  assert.equal(detectSchemaVersion({ sessions: [] }), 0);
});

test("B. v0 -> v1 successful", () => {
  const legacy = createLegacyV0();
  const result = migrateV0ToV1(legacy);
  assert.equal(result.status, "success");
  assert.equal(result.migratedFrom, 0);
});

test("C. schemaVersion becomes CURRENT_SCHEMA_VERSION (1)", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(CURRENT_SCHEMA_VERSION, 1);
});

test("D. classes preserved during migration", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.equal(result.data.classes.length, 1);
  assert.equal(result.data.classes[0].id, "class-5a");
  assert.equal(result.data.classes[0].name, "5-A");
  assert.equal(result.data.classes[0].archived, false);
});

test("E. students preserved with full roster details", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.classes[0].students, [sampleStudentA, sampleStudentB]);
});

test("F. sessions preserved with check types and student statuses", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.equal(result.data.sessions.length, 1);
  assert.deepEqual(result.data.sessions[0], sampleSession);
});

test("G. workCalendar preserved with breaks and date ranges", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.workCalendar, sampleCalendar);
});

test("H. annualPlanEntries preserved with topics, notes and completion flags", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.annualPlanEntries, [samplePlanEntry]);
});

test("I. unknown root field preserved without dropping custom properties", () => {
  const legacy = createLegacyV0();
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.customPluginConfig, sampleUnknownField);
});

test("J. current v1 passes safely without unnecessary re-migration", () => {
  const legacy = createLegacyV0();
  const firstMigration = migrateData(legacy);
  assert.equal(firstMigration.status, "success");
  const v1Data = firstMigration.data;

  const result = migrateData(v1Data);
  assert.equal(result.status, "success");
  assert.equal(result.migratedFrom, null);
  assert.deepEqual(result.data, v1Data);
});

test("K. schemaVersion 99 returns unsupported future version and does not mutate/downgrade", () => {
  const futureData = {
    schemaVersion: 99,
    classes: [sampleClass],
    sessions: [sampleSession],
    futureField: "secret",
  };
  const snapshot = JSON.stringify(futureData);
  const result = migrateData(futureData);
  assert.equal(result.status, "unsupported_future_version");
  assert.equal(result.schemaVersion, 99);
  assert.equal(JSON.stringify(futureData), snapshot, "input object must not be mutated");
});

test("L. input object is not mutated in-place during migration", () => {
  const legacy = createLegacyV0();
  const originalJson = JSON.stringify(legacy);
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  assert.equal(JSON.stringify(legacy), originalJson, "legacy input must remain completely unmutated");
  assert.equal(legacy.schemaVersion, undefined, "legacy object must not have schemaVersion injected directly");
});

test("M. migration is idempotent: migrateData(v0) -> v1, migrateData(v1) -> identical v1", () => {
  const legacy = createLegacyV0();
  const pass1 = migrateData(legacy);
  assert.equal(pass1.status, "success");
  const pass2 = migrateData(pass1.data);
  assert.equal(pass2.status, "success");
  assert.deepEqual(pass1.data, pass2.data);
});

test("N. malformed structural data does not silently become seedData", () => {
  const malformedClassList = { classes: "not-an-array", sessions: [] };
  const result1 = migrateData(malformedClassList);
  assert.equal(result1.status, "invalid_data");

  const malformedNonObject = "corrupted string";
  const result2 = migrateData(malformedNonObject);
  assert.equal(result2.status, "invalid_data");

  const nullData = null;
  const result3 = migrateData(nullData);
  assert.equal(result3.status, "invalid_data");
});

test("O. missing/invalid critical IDs do NOT generate replacement IDs and return invalid_data", () => {
  const missingClassId = {
    classes: [{ name: "5-A", students: [] }],
    sessions: [],
  };
  const result1 = migrateData(missingClassId);
  assert.equal(result1.status, "invalid_data");

  const missingStudentId = {
    classes: [{ id: "c1", name: "5-A", students: [{ name: "Ali", number: 1 }] }],
    sessions: [],
  };
  const result2 = migrateData(missingStudentId);
  assert.equal(result2.status, "invalid_data");

  const missingSessionId = {
    classes: [sampleClass],
    sessions: [{ classId: "class-5a", className: "5-A", type: "Ödev", date: "2026-09-20", statuses: {} }],
  };
  const result3 = migrateData(missingSessionId);
  assert.equal(result3.status, "invalid_data");
});

test("P. Grade-related stored workCalendar/manual data survives migration", () => {
  const gradeCalendar = {
    schoolYear: "2026-2027",
    startDate: "2026-09-14",
    endDate: "2027-06-25",
    breaks: [
      { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
      { id: "2027-first-social", title: "Sosyal Etkinlik Haftası", startDate: "2027-01-18", endDate: "2027-01-22", grades: [5, 6, 7] },
      { id: "2027-semester-break", title: "Yarıyıl Tatili", startDate: "2027-01-25", endDate: "2027-02-05" },
      { id: "2027-second-break", title: "2. Dönem Ara Tatili", startDate: "2027-03-08", endDate: "2027-03-12" },
      { id: "2027-second-social-2", title: "Sosyal Etkinlik Haftası", startDate: "2027-06-21", endDate: "2027-06-25", grades: [5, 6, 7] },
    ],
  };

  const manualEntries = [
    { id: "p1", classId: "c-5a", schoolYear: "2026-2027", weekStart: "2026-09-14", topic: "Giriş", note: "Özel not 1", completed: true },
    { id: "p2", classId: "c-8a", schoolYear: "2026-2027", weekStart: "2027-01-18", topic: "Basınç ve Gazlar", note: "8. sınıf normal fen haftası", completed: false },
  ];

  const data = {
    classes: [
      { id: "c-5a", name: "5-A", students: [] },
      { id: "c-8a", name: "8-A", students: [] },
    ],
    sessions: [],
    workCalendar: gradeCalendar,
    annualPlanEntries: manualEntries,
  };

  const result = migrateData(data);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.workCalendar, gradeCalendar);
  assert.deepEqual(result.data.annualPlanEntries, manualEntries);
  assert.equal(result.data.classes.length, 2);
});

test("Q. unknown Student field survives migration", () => {
  const customStudent = {
    id: "student-custom",
    name: "Zeynep Demir",
    number: 42,
    active: true,
    futureStudentField: "keep-me-student",
    studentMetadata: { tags: ["leader", "science-club"] },
  };
  const legacy = {
    classes: [{ id: "class-custom", name: "6-A", students: [customStudent] }],
    sessions: [],
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const student = result.data.classes[0].students[0];
  assert.equal(student.futureStudentField, "keep-me-student");
  assert.deepEqual(student.studentMetadata, { tags: ["leader", "science-club"] });
});

test("R. unknown SchoolClass field survives migration", () => {
  const customClass = {
    id: "class-custom-2",
    name: "7-B",
    students: [],
    classFutureField: "keep-me-class",
    roomNumber: "Lab-3",
  };
  const legacy = {
    classes: [customClass],
    sessions: [],
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const schoolClass = result.data.classes[0];
  assert.equal(schoolClass.classFutureField, "keep-me-class");
  assert.equal(schoolClass.roomNumber, "Lab-3");
});

test("S. unknown CheckSession field survives migration", () => {
  const customSession = {
    id: "session-custom",
    classId: "class-custom",
    className: "6-A",
    type: "Materyal",
    date: "2026-10-01T10:00:00.000Z",
    statuses: {},
    sessionFutureField: "keep-me-session",
    sessionNotes: "Derslik kontrolü",
  };
  const legacy = {
    classes: [{ id: "class-custom", name: "6-A", students: [] }],
    sessions: [customSession],
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const session = result.data.sessions[0];
  assert.equal(session.sessionFutureField, "keep-me-session");
  assert.equal(session.sessionNotes, "Derslik kontrolü");
});

test("T. unknown WorkCalendar field survives migration", () => {
  const customCalendar = {
    schoolYear: "2026-2027",
    startDate: "2026-09-14",
    endDate: "2027-06-25",
    breaks: [],
    calendarFutureField: "keep-me-calendar",
    academicTermInfo: { term1Weeks: 17, term2Weeks: 18 },
  };
  const legacy = {
    classes: [],
    sessions: [],
    workCalendar: customCalendar,
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const calendar = result.data.workCalendar;
  assert.equal(calendar.calendarFutureField, "keep-me-calendar");
  assert.deepEqual(calendar.academicTermInfo, { term1Weeks: 17, term2Weeks: 18 });
});

test("U. unknown CalendarBreak field survives migration", () => {
  const customBreak = {
    id: "break-custom",
    title: "Özel Festival Tatili",
    startDate: "2026-10-28",
    endDate: "2026-10-29",
    breakFutureField: "keep-me-break",
    officialHolidayCode: "TR-29-OCT",
  };
  const legacy = {
    classes: [],
    sessions: [],
    workCalendar: {
      schoolYear: "2026-2027",
      startDate: "2026-09-14",
      endDate: "2027-06-25",
      breaks: [customBreak],
    },
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const breakItem = result.data.workCalendar.breaks[0];
  assert.equal(breakItem.breakFutureField, "keep-me-break");
  assert.equal(breakItem.officialHolidayCode, "TR-29-OCT");
});

test("V. unknown AnnualPlanEntry field survives migration", () => {
  const customEntry = {
    id: "entry-custom",
    classId: "class-custom",
    schoolYear: "2026-2027",
    weekStart: "2026-09-14",
    topic: "Mikroskobik Canlılar",
    note: "Lam-lamel seti hazır",
    completed: true,
    annualPlanFutureField: "keep-me-plan",
    pedagogicalRubric: { level: 4, verified: true },
  };
  const legacy = {
    classes: [{ id: "class-custom", name: "5-A", students: [] }],
    sessions: [],
    annualPlanEntries: [customEntry],
  };
  const result = migrateData(legacy);
  assert.equal(result.status, "success");
  const entry = result.data.annualPlanEntries[0];
  assert.equal(entry.annualPlanFutureField, "keep-me-plan");
  assert.deepEqual(entry.pedagogicalRubric, { level: 4, verified: true });
});
