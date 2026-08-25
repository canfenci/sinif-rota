import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function transpileToDataUrl(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

const academicYearUrl = await transpileToDataUrl("app/lib/academic-year.ts");
const academicYear = await import(academicYearUrl);
const dateUtilsUrl = await transpileToDataUrl("app/lib/planning/date-utils.ts");

const allocationSource = await readFile(new URL("../app/lib/planning/allocation.ts", import.meta.url), "utf8");
let allocationOutput = ts.transpileModule(allocationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
allocationOutput = allocationOutput.replace('from "../academic-year"', `from "${academicYearUrl}"`);
const allocationUrl = `data:text/javascript;base64,${Buffer.from(allocationOutput).toString("base64")}`;

const entryUrl = await transpileToDataUrl("app/lib/planning/entry.ts");

const planningSource = await readFile(new URL("../app/lib/planning.ts", import.meta.url), "utf8");
let planningOutput = ts.transpileModule(planningSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
planningOutput = planningOutput.replace('from "./academic-year"', `from "${academicYearUrl}"`);
planningOutput = planningOutput.replace('from "./planning/date-utils"', `from "${dateUtilsUrl}"`);
planningOutput = planningOutput.replace('from "./planning/allocation"', `from "${allocationUrl}"`);
planningOutput = planningOutput.replace('from "./planning/entry"', `from "${entryUrl}"`);
const planning = await import(`data:text/javascript;base64,${Buffer.from(planningOutput).toString("base64")}`);

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const annualPlanSource = await readFile(new URL("../app/components/AnnualPlan.tsx", import.meta.url), "utf8");

const utcDate = (date) => new Date(`${date}T00:00:00.000Z`);

// ==========================================
// SCENARIO A — Verified current year (2026-08-25)
// ==========================================
test("SCENARIO A: verified current year 2026-08-25 initializes official 2026-2027 calendar and active planning", () => {
  const clock = utcDate("2026-08-25");
  const yearId = academicYear.resolveAcademicYearId(clock);
  assert.equal(yearId, "2026-2027");

  const resolution = academicYear.resolveDefaultWorkCalendar(clock);
  assert.equal(resolution.status, "supported");
  assert.equal(resolution.schoolYear, "2026-2027");
  assert.ok(resolution.calendar);
  assert.equal(resolution.calendar.schoolYear, "2026-2027");
  assert.equal(resolution.calendar.startDate, "2026-09-14");
  assert.equal(resolution.calendar.endDate, "2027-06-25");
  assert.equal(resolution.calendar.breaks.length, 5);

  const supportState = academicYear.getCalendarSupportState(resolution.calendar, clock);
  assert.equal(supportState, "supported_current");

  // Automatic Grade 5-8 plans are available
  const plan5 = planning.buildGrade5SciencePlan(resolution.calendar);
  const plan6 = planning.buildGrade6SciencePlan(resolution.calendar);
  const plan7 = planning.buildGrade7SciencePlan(resolution.calendar);
  const plan8 = planning.buildGrade8SciencePlan(resolution.calendar);

  assert.ok(plan5);
  assert.equal(plan5.totalHours, 140);
  assert.ok(plan6);
  assert.equal(plan6.totalHours, 140);
  assert.ok(plan7);
  assert.equal(plan7.totalHours, 140);
  assert.ok(plan8);
  assert.equal(plan8.totalHours, 140);

  // UI structure for supported_current
  assert.match(pageSource, /calendarSupportState !== "unsupported_year" && workCalendar && <AnnualPlan/);
});

// ==========================================
// SCENARIO B — Unsupported next year, fresh install (2027-09-15)
// ==========================================
test("SCENARIO B: unsupported next year 2027-09-15 produces no fabricated calendar, no fallback, and shows explicit unsupported state", () => {
  const clock = utcDate("2027-09-15");
  const yearId = academicYear.resolveAcademicYearId(clock);
  assert.equal(yearId, "2027-2028");

  // Fresh install resolution returns null calendar
  const resolution = academicYear.resolveDefaultWorkCalendar(clock);
  assert.equal(resolution.status, "unsupported_year");
  assert.equal(resolution.schoolYear, "2027-2028");
  assert.equal(resolution.calendar, null);

  // No official calendar exists for 2027-2028
  assert.equal(academicYear.getOfficialWorkCalendar("2027-2028"), null);
  assert.equal(planning.createDefaultWorkCalendar(clock), null);

  // Fresh-install fallback is null, triggering unsupported_year in page.tsx
  const freshData = { classes: [], sessions: [] };
  const resolvedWorkCalendar = freshData.workCalendar ?? resolution.calendar;
  assert.equal(resolvedWorkCalendar, null);

  const supportState = resolvedWorkCalendar ? academicYear.getCalendarSupportState(resolvedWorkCalendar, clock) : "unsupported_year";
  assert.equal(supportState, "unsupported_year");

  // UI renders explicit unsupported message
  assert.match(pageSource, /calendarSupportState === "unsupported_year" && <section className="unsupported-year-state"/);
  assert.match(pageSource, /Eğitim Öğretim Yılı Henüz Yapılandırılmadı/);
  assert.match(pageSource, /Bu eğitim yılı için resmî MEB çalışma takvimi ve ders planı şablonu henüz sisteme eklenmemiştir\./);
});

// ==========================================
// SCENARIO C — Unsupported later year (2028-08-25 / 2028-09-01)
// ==========================================
test("SCENARIO C: unsupported later year 2028-08-25 fails closed without fabrication", () => {
  for (const dateStr of ["2028-08-25", "2028-09-01"]) {
    const clock = utcDate(dateStr);
    const yearId = academicYear.resolveAcademicYearId(clock);
    assert.equal(yearId, "2028-2029");

    const resolution = academicYear.resolveDefaultWorkCalendar(clock);
    assert.deepEqual(resolution, {
      status: "unsupported_year",
      schoolYear: "2028-2029",
      calendar: null,
    });

    assert.equal(academicYear.getOfficialWorkCalendar("2028-2029"), null);
    assert.equal(planning.createDefaultWorkCalendar(clock), null);
  }
});

// ==========================================
// SCENARIO D — Persisted historical year survives future clock (2028-09-01)
// ==========================================
test("SCENARIO D: persisted 2026-2027 calendar survives in 2028 as read-only historical mode", () => {
  const clock = utcDate("2028-09-01");

  const persistedCalendar = {
    schoolYear: "2026-2027",
    startDate: "2026-09-14",
    endDate: "2027-06-25",
    breaks: [
      { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
    ],
  };

  const persistedEntries = [
    { id: "entry-1", classId: "class-1", schoolYear: "2026-2027", weekStart: "2026-09-14", topic: "Güneş Sistemi", note: "Önemli not", completed: true },
  ];

  const persistedAppData = {
    classes: [{ id: "class-1", name: "5-A", students: [] }],
    sessions: [],
    workCalendar: persistedCalendar,
    annualPlanEntries: persistedEntries,
  };

  // App loads persisted calendar instead of defaultResolution.calendar
  const defaultResolution = academicYear.resolveDefaultWorkCalendar(clock);
  assert.equal(defaultResolution.calendar, null);

  const activeWorkCalendar = persistedAppData.workCalendar ?? defaultResolution.calendar;
  assert.equal(activeWorkCalendar, persistedCalendar);
  assert.equal(activeWorkCalendar.schoolYear, "2026-2027");

  // State is supported_historical
  const supportState = academicYear.getCalendarSupportState(activeWorkCalendar, clock);
  assert.equal(supportState, "supported_historical");

  // UI exposes historical badge and disables editing
  assert.match(annualPlanSource, /calendarSupportState === "supported_historical" && <p className="historical-year-badge" role="status">Geçmiş Eğitim Yılı/);
  assert.match(annualPlanSource, /!isHistorical && <button type="button" onClick=\{\(\) => setCalendarOpen\(true\)\}>Takvimi düzenle<\/button>/);
  assert.match(annualPlanSource, /disabled=\{closed \|\| isHistorical\}/);
  assert.match(annualPlanSource, /isHistorical \? "Geçmiş kayıt"/);

  // Persisted data remains intact
  assert.equal(persistedAppData.annualPlanEntries.length, 1);
  assert.equal(persistedAppData.annualPlanEntries[0].topic, "Güneş Sistemi");
});

// ==========================================
// SCENARIO E — Unsupported arbitrary schoolYear cannot become official
// ==========================================
test("SCENARIO E: unsupported arbitrary schoolYear cannot become official via calendar editing or planning", () => {
  // isSupportedAcademicYear rejects non-2026-2027
  assert.equal(academicYear.isSupportedAcademicYear("2027-2028"), false);
  assert.equal(academicYear.isSupportedAcademicYear("2025-2026"), false);
  assert.equal(academicYear.isSupportedAcademicYear("invalid-year"), false);

  // CalendarSheet submit guard rejects unsupported schoolYear
  assert.match(annualPlanSource, /if \(!isSupportedAcademicYear\(draft\.schoolYear\)\) \{ setError\("Bu eğitim yılı için resmî MEB çalışma takvimi henüz sisteme eklenmemiştir\."/);

  // If an unsupported calendar is fed to plan builders, they fail closed (return null)
  const arbitraryCalendar = {
    schoolYear: "2027-2028",
    startDate: "2027-09-13",
    endDate: "2028-06-23",
    breaks: [],
  };

  assert.equal(planning.buildGrade5SciencePlan(arbitraryCalendar), null);
  assert.equal(planning.buildGrade6SciencePlan(arbitraryCalendar), null);
  assert.equal(planning.buildGrade7SciencePlan(arbitraryCalendar), null);
  assert.equal(planning.buildGrade8SciencePlan(arbitraryCalendar), null);
  assert.equal(planning.buildSciencePlanForClass("5-A", arbitraryCalendar), null);
});

// ==========================================
// SCENARIO F — Supported year planning invariants
// ==========================================
test("SCENARIO F: supported 2026-2027 year preserves all grade planning invariants and special rules", () => {
  const officialCalendar = academicYear.getOfficialWorkCalendar("2026-2027");
  assert.ok(officialCalendar);

  // 140 hours per grade
  const plan5 = planning.buildGrade5SciencePlan(officialCalendar);
  const plan6 = planning.buildGrade6SciencePlan(officialCalendar);
  const plan7 = planning.buildGrade7SciencePlan(officialCalendar);
  const plan8 = planning.buildGrade8SciencePlan(officialCalendar);

  assert.equal(plan5.totalHours, 140);
  assert.equal(plan5.firstTermHours, 68);
  assert.equal(plan5.secondTermHours, 72);

  assert.equal(plan6.totalHours, 140);
  assert.equal(plan6.firstTermHours, 68);
  assert.equal(plan6.secondTermHours, 72);

  assert.equal(plan7.totalHours, 140);
  assert.equal(plan7.firstTermHours, 68);
  assert.equal(plan7.secondTermHours, 72);

  assert.equal(plan8.totalHours, 140);
  assert.equal(plan8.firstTermHours, 72);
  assert.equal(plan8.secondTermHours, 68);

  // Social activity weeks for 5, 6, 7
  const breaks567 = officialCalendar.breaks.filter((b) => b.title === "Sosyal Etkinlik Haftası");
  assert.equal(breaks567.length, 2);
  assert.deepEqual(breaks567[0].grades, [5, 6, 7]);
  assert.equal(breaks567[0].startDate, "2027-01-18");
  assert.deepEqual(breaks567[1].grades, [5, 6, 7]);
  assert.equal(breaks567[1].startDate, "2027-06-21");

  // Grade 8 January exception (18 Jan week is teaching week for Grade 8)
  const weeks8 = planning.buildPlanWeeks(officialCalendar, 8);
  const jan18Week8 = weeks8.find((w) => w.startDate === "2027-01-18");
  assert.equal(jan18Week8.teachingDays, 5);

  // Grade 8 June early cutoff (14 June & 21 June weeks are non-teaching for Grade 8)
  const june14Week8 = weeks8.find((w) => w.startDate === "2027-06-14");
  assert.ok(june14Week8);
  const plan8June14 = plan8.weeks.find((w) => w.weekStart === "2027-06-14");
  assert.equal(plan8June14, undefined);
});
