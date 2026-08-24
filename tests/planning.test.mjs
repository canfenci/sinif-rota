import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const logic = await importTypeScript("app/lib/planning.ts");
const calendar = {
  schoolYear: "2026-2027",
  startDate: "2026-09-07",
  endDate: "2026-09-25",
  breaks: [{ id: "break-1", title: "Ara tatil", startDate: "2026-09-14", endDate: "2026-09-18" }],
};

test("iş takvimi haftaları ve iş günü sayılarını üretir", () => {
  const weeks = logic.buildPlanWeeks(calendar);
  assert.equal(weeks.length, 3);
  assert.deepEqual(weeks.map((week) => week.teachingDays), [5, 0, 5]);
  assert.deepEqual(weeks[1].breakTitles, ["Ara tatil"]);
});

test("kısmi tatil günlerini haftanın iş günü sayısından düşer", () => {
  const weeks = logic.buildPlanWeeks({ ...calendar, breaks: [{ id: "x", title: "Bayram", startDate: "2026-09-09", endDate: "2026-09-10" }] });
  assert.equal(weeks[0].teachingDays, 3);
});

test("sınıf ve eğitim yılına bağlı haftalık planı ekler ve günceller", () => {
  const data = { classes: [], sessions: [] };
  const first = logic.updateAnnualPlanEntry(data, "5-a", calendar, "2026-09-07", { topic: "Doğal sayılar", note: "", completed: false }, () => "plan-1");
  const second = logic.updateAnnualPlanEntry(first, "5-a", calendar, "2026-09-07", { topic: "Doğal sayılar", note: "Tekrar", completed: true }, () => "unused");
  assert.equal(second.annualPlanEntries.length, 1);
  assert.deepEqual(second.annualPlanEntries[0], { id: "plan-1", classId: "5-a", schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Doğal sayılar", note: "Tekrar", completed: true });
});

test("boş haftalık plan kaydını temizler", () => {
  const data = { classes: [], sessions: [], annualPlanEntries: [{ id: "plan-1", classId: "5-a", schoolYear: "2026-2027", weekStart: "2026-09-07", topic: "Konu", note: "", completed: false }] };
  const result = logic.updateAnnualPlanEntry(data, "5-a", calendar, "2026-09-07", { topic: "", note: "", completed: false }, () => "unused");
  assert.equal(result.annualPlanEntries.length, 0);
});

test("2026-2027 varsayılan takvimi resmî dönem ve tatil tarihlerini içerir", () => {
  const result = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  assert.deepEqual({ schoolYear: result.schoolYear, startDate: result.startDate, endDate: result.endDate }, { schoolYear: "2026-2027", startDate: "2026-09-14", endDate: "2027-06-25" });
  assert.deepEqual(result.breaks.map((item) => [item.title, item.startDate, item.endDate]), [
    ["1. Dönem Ara Tatili", "2026-11-16", "2026-11-20"],
    ["Sosyal Etkinlik Haftası", "2027-01-18", "2027-01-22"],
    ["Yarıyıl Tatili", "2027-01-25", "2027-02-05"],
    ["2. Dönem Ara Tatili", "2027-03-08", "2027-03-12"],
    ["Sosyal Etkinlik Haftası", "2027-06-14", "2027-06-18"],
    ["Sosyal Etkinlik Haftası", "2027-06-21", "2027-06-25"],
  ]);
});

test("5. sınıf Fen Bilimleri planı iki döneme 68'er saat dağıtılır", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.ok(result);
  assert.equal(result.weeks.length, 34);
  assert.equal(result.weeks.filter((week) => week.term === 1).length, 17);
  assert.equal(result.weeks.filter((week) => week.term === 2).length, 17);
  assert.deepEqual(result.weeks.map((week) => week.totalHours), Array(34).fill(4));
  assert.equal(result.weeks.filter((week) => week.term === 1).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.equal(result.weeks.filter((week) => week.term === 2).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.deepEqual({ curriculum: result.curriculumHours, extra: result.teacherExtraHours, capacity: result.totalHours }, { curriculum: 134, extra: 2, capacity: 136 });
});

test("ünite toplamları ve iki özel öğrenme çıktısı korunur", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const items = result.weeks.flatMap((week) => week.items);
  const unitHours = new Map();
  items.forEach((item) => unitHours.set(item.unit, (unitHours.get(item.unit) ?? 0) + item.hours));
  assert.deepEqual([...unitHours.entries()], [[1, 22], [2, 26], [3, 22], [4, 14], [5, 26], [6, 16], [7, 10]]);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.5.2.3.2" && item.extra).reduce((sum, item) => sum + item.hours, 0), 2);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.5.3.2.2").reduce((sum, item) => sum + item.hours, 0), 2);
});

test("ikinci dönemin ilk haftası iki farklı içeriği aynı anda destekler", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const firstWeek = result.weeks.find((week) => week.weekStart === "2027-02-08");
  assert.deepEqual(firstWeek.items.map((item) => [item.outcomeCode ?? item.unit, item.hours]), [["FB.5.3.2.2", 2], [4, 2]]);
});

test("Sosyal Etkinlik Haftalarına normal Fen içeriği atanmaz", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const weeks = logic.buildPlanWeeks(calendar);
  const plan = logic.buildGrade5SciencePlan(calendar);
  for (const weekStart of ["2027-01-18", "2027-06-14", "2027-06-21"]) {
    const week = weeks.find((item) => item.startDate === weekStart);
    assert.equal(week.teachingDays, 0);
    assert.deepEqual(week.breakTitles, ["Sosyal Etkinlik Haftası"]);
    assert.equal(plan.weeks.some((item) => item.weekStart === weekStart), false);
  }
});

test("varsayılan Fen planı yalnız 5. sınıf ve 2026-2027 için etkinleşir", () => {
  assert.equal(logic.isGrade5Class("5-A"), true);
  assert.equal(logic.isGrade5Class("5 / B"), true);
  assert.equal(logic.isGrade5Class("6-A"), false);
  assert.equal(logic.buildGrade5SciencePlan({ ...calendar, schoolYear: "2027-2028" }), null);
});
