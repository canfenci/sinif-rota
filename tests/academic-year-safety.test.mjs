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

const utcDate = (date) => new Date(`${date}T00:00:00.000Z`);

test("akademik yıl kimliği ağustos ayında yeni öğretim yılına geçer", () => {
  assert.equal(academicYear.resolveAcademicYearId(utcDate("2026-08-25")), "2026-2027");
  assert.equal(academicYear.resolveAcademicYearId(utcDate("2026-09-14")), "2026-2027");
  assert.equal(academicYear.resolveAcademicYearId(utcDate("2027-02-15")), "2026-2027");
  assert.equal(academicYear.resolveAcademicYearId(utcDate("2027-09-15")), "2027-2028");
  assert.equal(academicYear.resolveAcademicYearId(utcDate("2028-08-25")), "2028-2029");
});

test("yalnız 2026-2027 resmî iş takvimi desteklenir", () => {
  assert.deepEqual(academicYear.SUPPORTED_ACADEMIC_YEARS, ["2026-2027"]);
  assert.equal(academicYear.isSupportedAcademicYear("2026-2027"), true);
  assert.equal(academicYear.isSupportedAcademicYear("2027-2028"), false);
  assert.equal(academicYear.getOfficialWorkCalendar("2026-2027")?.schoolYear, "2026-2027");
  assert.equal(academicYear.getOfficialWorkCalendar("2027-2028"), null);
  assert.equal(academicYear.getOfficialWorkCalendar("2028-2029"), null);
});

test("desteklenen varsayılan çözümleme doğrulanmış resmî takvimi döndürür", () => {
  const result = academicYear.resolveDefaultWorkCalendar(utcDate("2026-08-25"));
  assert.equal(result.status, "supported");
  assert.equal(result.schoolYear, "2026-2027");
  assert.equal(result.calendar.schoolYear, "2026-2027");
  assert.equal(result.calendar.startDate, "2026-09-14");
  assert.ok(result.calendar.breaks.length > 0);
});

test("desteklenmeyen yıllar için WorkCalendar üretilmez", () => {
  for (const [date, schoolYear] of [["2027-09-15", "2027-2028"], ["2028-08-25", "2028-2029"]]) {
    const result = academicYear.resolveDefaultWorkCalendar(utcDate(date));
    assert.deepEqual(result, { status: "unsupported_year", schoolYear, calendar: null });
  }
});

test("takvim destek durumu current, historical ve unsupported ayrımını korur", () => {
  const official = academicYear.getOfficialWorkCalendar("2026-2027");
  assert.equal(academicYear.getCalendarSupportState(official, utcDate("2026-08-25")), "supported_current");
  assert.equal(academicYear.getCalendarSupportState(official, utcDate("2027-02-15")), "supported_current");
  assert.equal(academicYear.getCalendarSupportState(official, utcDate("2028-09-01")), "supported_historical");
  assert.equal(academicYear.getCalendarSupportState({ ...official, schoolYear: "2027-2028" }, utcDate("2027-09-15")), "unsupported_year");
});

test("uyumluluk wrapper'ı desteklenmeyen yıllarda null ile fail-closed davranır", () => {
  assert.equal(planning.createDefaultWorkCalendar(utcDate("2027-09-15")), null);
  assert.equal(planning.createDefaultWorkCalendar(utcDate("2028-09-01")), null);
  const supported = planning.createDefaultWorkCalendar(utcDate("2026-08-25"));
  assert.equal(supported.schoolYear, "2026-2027");
  assert.equal(supported.startDate, "2026-09-14");
  assert.ok(supported.breaks.length > 0);
});

test("fresh-install production akışı unsupported sonucu değiştirmeden null bırakır", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /data\.workCalendar \?\? defaultCalendarResolution\.calendar/);
  assert.match(pageSource, /resolveDefaultWorkCalendar\(\)/);
  assert.doesNotMatch(pageSource, /createDefaultWorkCalendar/);

  for (const date of ["2027-09-15", "2028-09-01"]) {
    const resolution = academicYear.resolveDefaultWorkCalendar(utcDate(date));
    assert.equal(resolution.calendar, null);
  }
});

test("mevcut kaydedilmiş 2026-2027 takvimi varsayılan çözümlemeden etkilenmez", () => {
  const persisted = academicYear.getOfficialWorkCalendar("2026-2027");
  persisted.customField = "korunmalı";
  const unsupportedDefault = academicYear.resolveDefaultWorkCalendar(utcDate("2028-09-01"));
  const selected = persisted ?? unsupportedDefault.calendar;
  assert.equal(selected, persisted);
  assert.equal(selected.customField, "korunmalı");
});

test("5-8. sınıf resmî planları 140 saat kalır ve desteklenmeyen yıl plan üretmez", () => {
  const official = academicYear.getOfficialWorkCalendar("2026-2027");
  const unsupported = { ...official, schoolYear: "2027-2028" };
  for (const builder of [
    planning.buildGrade5SciencePlan,
    planning.buildGrade6SciencePlan,
    planning.buildGrade7SciencePlan,
    planning.buildGrade8SciencePlan,
  ]) {
    assert.equal(builder(official)?.totalHours, 140);
    assert.equal(builder(unsupported), null);
  }
  assert.equal(planning.buildSciencePlanForClass("5-A", unsupported), null);
  assert.equal(planning.buildSciencePlanForClass("6-A", unsupported), null);
  assert.equal(planning.buildSciencePlanForClass("7-A", unsupported), null);
  assert.equal(planning.buildSciencePlanForClass("8-A", unsupported), null);
});
