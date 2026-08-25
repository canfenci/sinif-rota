import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  if (path === "app/lib/planning.ts") {
    const dependencySource = await readFile(new URL("../app/lib/academic-year.ts", import.meta.url), "utf8");
    const dependencyOutput = ts.transpileModule(dependencySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependencyOutput).toString("base64")}`;
    output = output.replace('from "./academic-year"', `from "${dependencyUrl}"`);
  }
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
    ["Sosyal Etkinlik Haftası", "2027-06-21", "2027-06-25"],
  ]);
});

test("5. sınıf Fen Bilimleri planı 68 + 72 olmak üzere toplam 140 saattir", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.ok(result);
  assert.equal(result.weeks.length, 35);
  assert.equal(result.weeks.filter((week) => week.term === 1).length, 17);
  assert.equal(result.weeks.filter((week) => week.term === 2).length, 18);
  assert.deepEqual(result.weeks.map((week) => week.totalHours), Array(35).fill(4));
  assert.equal(result.weeks.filter((week) => week.term === 1).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.equal(result.weeks.filter((week) => week.term === 2).reduce((sum, week) => sum + week.totalHours, 0), 72);
  assert.deepEqual({ curriculum: result.curriculumHours, adjustment: result.capacityAdjustmentHours, capacity: result.totalHours }, { curriculum: 140, adjustment: 0, capacity: 140 });
});

test("ilk hafta laboratuvar güvenliğidir ve 1. ünite 21 Eylül'de başlar", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.deepEqual(result.weeks[0].items.map((item) => [item.title, item.hours]), [["LABORATUVAR GÜVENLİĞİ VE LABORATUVAR KURALLARI", 4]]);
  assert.equal(result.weeks[1].weekStart, "2026-09-21");
  assert.deepEqual(result.weeks[1].items.map((item) => [item.outcomeCode, item.hours]), [["FB.5.1.1.1", 4]]);
});

test("5. sınıf ünite ve kritik öğrenme çıktısı süreleri aynen korunur", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const items = result.weeks.flatMap((week) => week.items);
  const unitHours = new Map();
  items.forEach((item) => unitHours.set(item.unit, (unitHours.get(item.unit) ?? 0) + item.hours));
  assert.deepEqual([...unitHours.entries()], [[0, 4], [1, 22], [2, 24], [3, 22], [4, 14], [5, 26], [6, 16], [7, 12]]);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.5.2.3.2").reduce((sum, item) => sum + item.hours, 0), 6);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.5.3.2.2").reduce((sum, item) => sum + item.hours, 0), 2);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.5.7.1.3").reduce((sum, item) => sum + item.hours, 0), 4);
});

test("5. sınıf öğrenme çıktılarının tüm saatleri pedagojik tabloyla aynıdır", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const actual = new Map();
  result.weeks.flatMap((week) => week.items).filter((item) => item.outcomeCode).forEach((item) => actual.set(item.outcomeCode, (actual.get(item.outcomeCode) ?? 0) + item.hours));
  assert.deepEqual([...actual.entries()], [
    ["FB.5.1.1.1", 8], ["FB.5.1.2.1", 4], ["FB.5.1.2.2", 6], ["FB.5.1.3.1", 4],
    ["FB.5.2.1.1", 6], ["FB.5.2.1.2", 4], ["FB.5.2.2.1", 4], ["FB.5.2.3.1", 4], ["FB.5.2.3.2", 6],
    ["FB.5.3.1.1", 6], ["FB.5.3.1.2", 6], ["FB.5.3.2.1", 8], ["FB.5.3.2.2", 2],
    ["FB.5.4.1.1", 4], ["FB.5.4.2.1", 4], ["FB.5.4.3.1", 6],
    ["FB.5.5.1.1", 4], ["FB.5.5.2.1", 4], ["FB.5.5.2.2", 4], ["FB.5.5.3.1", 6], ["FB.5.5.4.1", 4], ["FB.5.5.4.2", 4],
    ["FB.5.6.1.1", 2], ["FB.5.6.1.2", 4], ["FB.5.6.2.1", 10],
    ["FB.5.7.1.1", 4], ["FB.5.7.1.2", 4], ["FB.5.7.1.3", 4],
  ]);
});

test("tüm 5. sınıf öğrenme çıktıları verilen sırada dağıtılır", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const actual = [...new Set(result.weeks.flatMap((week) => week.items).map((item) => item.outcomeCode).filter(Boolean))];
  assert.deepEqual(actual, logic.grade5ScienceCurriculum.map((item) => item.code));
  assert.equal(logic.grade5ScienceCurriculum.every((item) => item.officialDescription === null && item.officialSource === null), true);
});

test("8 Şubat haftası FB.5.3.2.1 ve FB.5.3.2.2 için 2+2 geçişidir", () => {
  const result = logic.buildGrade5SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const firstWeek = result.weeks.find((week) => week.weekStart === "2027-02-08");
  assert.deepEqual(firstWeek.items.map((item) => [item.outcomeCode, item.hours]), [["FB.5.3.2.1", 2], ["FB.5.3.2.2", 2]]);
  assert.deepEqual(firstWeek.items.map((item) => [item.allocation.completedBeforeHours, item.allocation.completedAfterHours]), [[6, 8], [0, 2]]);
});

test("dağıtım motoru 2+2 ve 3+1 hafta içi geçişlerini destekler", () => {
  assert.deepEqual(logic.distributeHoursToWeeks([2, 2]), [[2, 2]]);
  assert.deepEqual(logic.distributeHoursToWeeks([3, 1]), [[3, 1]]);
  assert.deepEqual(logic.distributeHoursToWeeks([1, 3]), [[1, 3]]);
});

test("5. sınıfta Ocak ve son hafta sosyal, 14 Haziran normal Fen haftasıdır", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const weeks = logic.buildPlanWeeks(calendar, 5);
  const plan = logic.buildGrade5SciencePlan(calendar);
  for (const weekStart of ["2027-01-18", "2027-06-21"]) {
    const week = weeks.find((item) => item.startDate === weekStart);
    assert.equal(week.teachingDays, 0);
    assert.deepEqual(week.breakTitles, ["Sosyal Etkinlik Haftası"]);
    assert.equal(plan.weeks.some((item) => item.weekStart === weekStart), false);
  }
  const june14 = weeks.find((item) => item.startDate === "2027-06-14");
  assert.equal(june14.teachingDays, 5);
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2027-06-14").items.map((item) => [item.outcomeCode, item.hours]), [["FB.5.7.1.3", 4]]);
});

test("otomatik plan üretimi manuel planı ve iş takvimini değiştirmez", () => {
  const workCalendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const data = { classes: [], sessions: [], workCalendar, annualPlanEntries: [{ id: "manual-1", classId: "5-a", schoolYear: "2026-2027", weekStart: "2026-09-21", topic: "Öğretmen planı", note: "Korunmalı", completed: true }] };
  const before = structuredClone(data);
  logic.buildGrade5SciencePlan(workCalendar);
  assert.deepEqual(data, before);
});

test("varsayılan Fen planı yalnız 5. sınıf ve 2026-2027 için etkinleşir", () => {
  assert.equal(logic.isGrade5Class("5-A"), true);
  assert.equal(logic.isGrade5Class("5 / B"), true);
  assert.equal(logic.isGrade5Class("6-A"), false);
  assert.equal(logic.buildGrade5SciencePlan({ ...calendar, schoolYear: "2027-2028" }), null);
});

test("6. sınıf Fen Bilimleri planı 35 haftada toplam 140 saat üretir", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.ok(result);
  assert.equal(result.weeks.length, 35);
  assert.equal(result.weeks.filter((week) => week.term === 1).length, 17);
  assert.equal(result.weeks.filter((week) => week.term === 2).length, 18);
  assert.deepEqual(result.weeks.map((week) => week.totalHours), Array(35).fill(4));
  assert.equal(result.weeks.filter((week) => week.term === 1).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.equal(result.weeks.filter((week) => week.term === 2).reduce((sum, week) => sum + week.totalHours, 0), 72);
  assert.deepEqual({ curriculum: result.curriculumHours, adjustment: result.capacityAdjustmentHours, capacity: result.totalHours }, { curriculum: 138, adjustment: 2, capacity: 140 });
});

test("6. sınıf ilk haftası doğrudan FB.6.1.1.1 ile başlar ve laboratuvar haftası yoktur", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.deepEqual(result.weeks[0].items.map((item) => [item.outcomeCode, item.hours]), [["FB.6.1.1.1", 4]]);
  assert.equal(result.weeks.flatMap((week) => week.items).some((item) => /laboratuvar/i.test(item.title)), false);
});

test("6. sınıf ünite süreleri ve öğretmen +2 saat kararı korunur", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const items = result.weeks.flatMap((week) => week.items);
  const unitHours = new Map();
  items.forEach((item) => unitHours.set(item.unit, (unitHours.get(item.unit) ?? 0) + item.hours));
  assert.deepEqual([...unitHours.entries()], [[1, 12], [2, 14], [3, 24], [4, 22], [5, 32], [6, 18], [7, 18]]);
  assert.deepEqual(logic.grade6ScienceUnitHours.map((item) => [item.curriculumHours, item.planHours]), [[12, 12], [14, 14], [22, 24], [22, 22], [32, 32], [18, 18], [18, 18]]);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.6.3.1.5").reduce((sum, item) => sum + item.hours, 0), 4);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.6.3.1.5").every((item) => item.badge === "+2 öğretmen planlama"), true);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.6.7.2.2").reduce((sum, item) => sum + item.hours, 0), 6);
});

test("6. sınıf öğrenme çıktılarının tüm saatleri ve sırası verilen tabloyla aynıdır", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const actual = new Map();
  result.weeks.flatMap((week) => week.items).forEach((item) => actual.set(item.outcomeCode, (actual.get(item.outcomeCode) ?? 0) + item.hours));
  assert.deepEqual([...actual.entries()], [
    ["FB.6.1.1.1", 4], ["FB.6.1.1.2", 4], ["FB.6.1.2.1", 2], ["FB.6.1.2.2", 2],
    ["FB.6.2.1.1", 4], ["FB.6.2.1.2", 4], ["FB.6.2.2.1", 6],
    ["FB.6.3.1.1", 2], ["FB.6.3.1.2", 4], ["FB.6.3.1.3", 4], ["FB.6.3.1.4", 2], ["FB.6.3.1.5", 4], ["FB.6.3.2.1", 2], ["FB.6.3.2.2", 2], ["FB.6.3.2.3", 2], ["FB.6.3.2.4", 2],
    ["FB.6.4.1.1", 2], ["FB.6.4.1.2", 4], ["FB.6.4.2.1", 4], ["FB.6.4.3.1", 2], ["FB.6.4.3.2", 4], ["FB.6.4.3.3", 4], ["FB.6.4.3.4", 2],
    ["FB.6.5.1.1", 6], ["FB.6.5.2.1", 6], ["FB.6.5.3.1", 6], ["FB.6.5.3.2", 6], ["FB.6.5.3.3", 4], ["FB.6.5.3.4", 4],
    ["FB.6.6.1.1", 4], ["FB.6.6.2.1", 8], ["FB.6.6.2.2", 6],
    ["FB.6.7.1.1", 4], ["FB.6.7.1.2", 4], ["FB.6.7.2.1", 4], ["FB.6.7.2.2", 6],
  ]);
  assert.deepEqual([...new Set(result.weeks.flatMap((week) => week.items).map((item) => item.outcomeCode))], logic.grade6ScienceCurriculum.map((item) => item.code));
  assert.equal(logic.grade6ScienceCurriculum.every((item) => item.officialDescription === null && item.officialSource === null), true);
});

test("6. sınıf çapraz ünite haftaları saat ve ilerleme ayrıntılarıyla doğrudur", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const expected = new Map([
    ["2026-10-26", [["FB.6.2.2.1", 2, 4, 6], ["FB.6.3.1.1", 2, 0, 2]]],
    ["2026-12-14", [["FB.6.3.2.4", 2, 0, 2], ["FB.6.4.1.1", 2, 0, 2]]],
    ["2027-05-17", [["FB.6.6.2.2", 2, 4, 6], ["FB.6.7.1.1", 2, 0, 2]]],
  ]);
  for (const [weekStart, items] of expected) {
    const week = result.weeks.find((item) => item.weekStart === weekStart);
    assert.deepEqual(week.items.map((item) => [item.outcomeCode, item.hours, item.allocation.completedBeforeHours, item.allocation.completedAfterHours]), items);
  }
});

test("6. sınıfın 35 haftalık nihai çizelgesi tarih ve saat bazında aynıdır", () => {
  const result = logic.buildGrade6SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const actual = result.weeks.map((week) => [week.weekStart, week.items.map((item) => [item.outcomeCode, item.hours])]);
  assert.deepEqual(actual, [
    ["2026-09-14", [["FB.6.1.1.1", 4]]],
    ["2026-09-21", [["FB.6.1.1.2", 4]]],
    ["2026-09-28", [["FB.6.1.2.1", 2], ["FB.6.1.2.2", 2]]],
    ["2026-10-05", [["FB.6.2.1.1", 4]]],
    ["2026-10-12", [["FB.6.2.1.2", 4]]],
    ["2026-10-19", [["FB.6.2.2.1", 4]]],
    ["2026-10-26", [["FB.6.2.2.1", 2], ["FB.6.3.1.1", 2]]],
    ["2026-11-02", [["FB.6.3.1.2", 4]]],
    ["2026-11-09", [["FB.6.3.1.3", 4]]],
    ["2026-11-23", [["FB.6.3.1.4", 2], ["FB.6.3.1.5", 2]]],
    ["2026-11-30", [["FB.6.3.1.5", 2], ["FB.6.3.2.1", 2]]],
    ["2026-12-07", [["FB.6.3.2.2", 2], ["FB.6.3.2.3", 2]]],
    ["2026-12-14", [["FB.6.3.2.4", 2], ["FB.6.4.1.1", 2]]],
    ["2026-12-21", [["FB.6.4.1.2", 4]]],
    ["2026-12-28", [["FB.6.4.2.1", 4]]],
    ["2027-01-04", [["FB.6.4.3.1", 2], ["FB.6.4.3.2", 2]]],
    ["2027-01-11", [["FB.6.4.3.2", 2], ["FB.6.4.3.3", 2]]],
    ["2027-02-08", [["FB.6.4.3.3", 2], ["FB.6.4.3.4", 2]]],
    ["2027-02-15", [["FB.6.5.1.1", 4]]],
    ["2027-02-22", [["FB.6.5.1.1", 2], ["FB.6.5.2.1", 2]]],
    ["2027-03-01", [["FB.6.5.2.1", 4]]],
    ["2027-03-15", [["FB.6.5.3.1", 4]]],
    ["2027-03-22", [["FB.6.5.3.1", 2], ["FB.6.5.3.2", 2]]],
    ["2027-03-29", [["FB.6.5.3.2", 4]]],
    ["2027-04-05", [["FB.6.5.3.3", 4]]],
    ["2027-04-12", [["FB.6.5.3.4", 4]]],
    ["2027-04-19", [["FB.6.6.1.1", 4]]],
    ["2027-04-26", [["FB.6.6.2.1", 4]]],
    ["2027-05-03", [["FB.6.6.2.1", 4]]],
    ["2027-05-10", [["FB.6.6.2.2", 4]]],
    ["2027-05-17", [["FB.6.6.2.2", 2], ["FB.6.7.1.1", 2]]],
    ["2027-05-24", [["FB.6.7.1.1", 2], ["FB.6.7.1.2", 2]]],
    ["2027-05-31", [["FB.6.7.1.2", 2], ["FB.6.7.2.1", 2]]],
    ["2027-06-07", [["FB.6.7.2.1", 2], ["FB.6.7.2.2", 2]]],
    ["2027-06-14", [["FB.6.7.2.2", 4]]],
  ]);
});

test("6. sınıfta Ocak ve son hafta sosyal, 14 Haziran normal Fen haftasıdır", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const weeks = logic.buildPlanWeeks(calendar, 6);
  const plan = logic.buildGrade6SciencePlan(calendar);
  for (const weekStart of ["2027-01-18", "2027-06-21"]) {
    assert.equal(weeks.find((item) => item.startDate === weekStart).teachingDays, 0);
    assert.equal(plan.weeks.some((item) => item.weekStart === weekStart), false);
  }
  assert.equal(weeks.find((item) => item.startDate === "2027-06-14").teachingDays, 5);
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2027-06-14").items.map((item) => [item.outcomeCode, item.hours]), [["FB.6.7.2.2", 4]]);
});

test("6. sınıf otomatik planı manuel kayıtları, iş takvimini ve gelecekteki alanları değiştirmez", () => {
  const workCalendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const data = { classes: [], sessions: [], workCalendar, annualPlanEntries: [{ id: "manual-6", classId: "6-a", schoolYear: "2026-2027", weekStart: "2026-10-26", topic: "Manuel", note: "Korunmalı", completed: false }], futureField: { keep: true } };
  const before = structuredClone(data);
  logic.buildGrade6SciencePlan(workCalendar);
  assert.deepEqual(data, before);
});

test("6. sınıf eklenirken 5. sınıf 140 saatlik planı değişmez", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const plan = logic.buildGrade5SciencePlan(calendar);
  assert.equal(plan.totalHours, 140);
  assert.equal(plan.weeks.length, 35);
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2027-06-14").items.map((item) => [item.outcomeCode, item.hours]), [["FB.5.7.1.3", 4]]);
});

test("sınıf adına göre 5., 6. ve 7. sınıf Fen profili seçilir", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  assert.equal(logic.isGrade6Class("6-A"), true);
  assert.equal(logic.isGrade6Class("6 / B"), true);
  assert.equal(logic.isGrade6Class("5-A"), false);
  assert.equal(logic.buildSciencePlanForClass("5-A", calendar).grade, 5);
  assert.equal(logic.buildSciencePlanForClass("6-B", calendar).grade, 6);
  assert.equal(logic.isGrade7Class("7 / C"), true);
  assert.equal(logic.isGrade7Class("6-A"), false);
  assert.equal(logic.buildSciencePlanForClass("7-A", calendar).grade, 7);
});

test("7. sınıf Fen Bilimleri planı 35 haftada 68 + 72 olmak üzere 140 saattir", () => {
  const result = logic.buildGrade7SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.ok(result);
  assert.equal(result.weeks.length, 35);
  assert.deepEqual(result.weeks.map((week) => week.totalHours), Array(35).fill(4));
  assert.equal(result.weeks.filter((week) => week.term === 1).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.equal(result.weeks.filter((week) => week.term === 2).reduce((sum, week) => sum + week.totalHours, 0), 72);
  assert.deepEqual({ curriculum: result.curriculumHours, adjustment: result.capacityAdjustmentHours, capacity: result.totalHours }, { curriculum: 138, adjustment: 2, capacity: 140 });
});

test("7. sınıf ünite toplamları ile öğretmen +2 saat kararı korunur", () => {
  const result = logic.buildGrade7SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const items = result.weeks.flatMap((week) => week.items);
  const unitHours = new Map();
  items.forEach((item) => unitHours.set(item.unit, (unitHours.get(item.unit) ?? 0) + item.hours));
  assert.deepEqual([...unitHours.entries()], [[1, 14], [2, 20], [3, 32], [4, 14], [5, 36], [6, 12], [7, 12]]);
  assert.deepEqual(logic.grade7ScienceUnitHours.map((item) => [item.curriculumHours, item.planHours]), [[14, 14], [20, 20], [32, 32], [14, 14], [34, 36], [12, 12], [12, 12]]);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.7.5.1.4").reduce((sum, item) => sum + item.hours, 0), 6);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.7.5.1.4").every((item) => item.badge === "+2 öğretmen planlama"), true);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.7.7.1.1").reduce((sum, item) => sum + item.hours, 0), 6);
  assert.equal(items.filter((item) => item.outcomeCode === "FB.7.7.2.1").reduce((sum, item) => sum + item.hours, 0), 6);
});

test("7. sınıf öğrenme çıktılarının exact MEB kodları, sırası ve saatleri korunur", () => {
  const result = logic.buildGrade7SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const actual = new Map();
  result.weeks.flatMap((week) => week.items).forEach((item) => actual.set(item.outcomeCode, (actual.get(item.outcomeCode) ?? 0) + item.hours));
  assert.deepEqual([...actual.entries()], [
    ["FB.7.1.1.1", 2], ["FB.7.1.1.2", 4], ["FB.7.1.1.3", 2], ["FB.7.1.2.1", 4], ["FB.7.1.2.2", 2],
    ["FB.7.2.1.1", 6], ["FB.7.2.1.2", 6], ["FB.7.2.2.1", 8],
    ["FB.7.3.1.1", 6], ["FB.7.3.1.2", 2], ["FB.7.3.2.1", 6], ["FB.7.3.2.2", 2], ["FB.7.3.2.3", 2], ["FB.7.3.3.1", 6], ["FB.7.3.3.2", 2], ["FB.7.3.4.1", 4], ["FB.7.3.4.2", 2],
    ["FB.7.4.1.1", 6], ["FB.7.4.2.1", 4], ["FB.7.4.2.2", 4],
    ["FB.7.5.1.1", 4], ["FB.7.5.1.2", 2], ["FB.7.5.1.3", 2], ["FB.7.5.1.4", 6], ["FB.7.5.2.1", 4], ["FB.7.5.2.2", 2], ["FB.7.5.2.3", 2], ["FB.7.5.2.4", 2], ["FB.7.5.3.1", 2], ["FB.7.5.3.2", 6], ["FB.7.5.4.1", 4],
    ["FB.7.6.1.1", 2], ["FB.7.6.1.2", 6], ["FB.7.6.1.3", 4],
    ["FB.7.7.1.1", 6], ["FB.7.7.2.1", 6],
  ]);
  assert.deepEqual([...actual.keys()], logic.grade7ScienceCurriculum.map((item) => item.code));
  assert.equal(actual.has("FB.7.5.10"), false);
});

test("7. sınıf ilk haftası doğrudan üniteyle başlar; sosyal ve normal Haziran haftaları doğrudur", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const weeks = logic.buildPlanWeeks(calendar, 7);
  const plan = logic.buildGrade7SciencePlan(calendar);
  assert.deepEqual(plan.weeks[0].items.map((item) => [item.outcomeCode, item.hours]), [["FB.7.1.1.1", 2], ["FB.7.1.1.2", 2]]);
  assert.equal(plan.weeks.flatMap((week) => week.items).some((item) => /laboratuvar/i.test(item.title)), false);
  for (const weekStart of ["2027-01-18", "2027-06-21"]) {
    assert.equal(weeks.find((item) => item.startDate === weekStart).teachingDays, 0);
    assert.equal(plan.weeks.some((item) => item.weekStart === weekStart), false);
  }
  assert.equal(weeks.find((item) => item.startDate === "2027-06-14").teachingDays, 5);
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2027-06-14").items.map((item) => [item.outcomeCode, item.hours]), [["FB.7.7.2.1", 4]]);
});

test("7. sınıf ortak motoru çapraz ünite ve dönemler arası kısmi ilerlemeyi korur", () => {
  const plan = logic.buildGrade7SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2026-10-05").items.map((item) => [item.outcomeCode, item.hours]), [["FB.7.1.2.2", 2], ["FB.7.2.1.1", 2]]);
  assert.deepEqual(plan.weeks.find((item) => item.weekStart === "2026-11-09").items.map((item) => [item.outcomeCode, item.hours]), [["FB.7.2.2.1", 2], ["FB.7.3.1.1", 2]]);
  const january = plan.weeks.find((item) => item.weekStart === "2027-01-11").items.at(-1);
  const february = plan.weeks.find((item) => item.weekStart === "2027-02-08").items[0];
  assert.deepEqual([january.outcomeCode, january.hours, january.allocation.completedBeforeHours, january.allocation.completedAfterHours, january.allocation.plannedTotalHours], ["FB.7.4.1.1", 2, 0, 2, 6]);
  assert.deepEqual([february.outcomeCode, february.hours, february.allocation.completedBeforeHours, february.allocation.completedAfterHours, february.allocation.plannedTotalHours], ["FB.7.4.1.1", 4, 2, 6, 6]);
});

test("7. sınıf resmî açıklamaları kaynaklıdır ve kaynak dışı metadata üretilmez", () => {
  assert.equal(logic.grade7ScienceCurriculum.length, 36);
  assert.equal(logic.grade7ScienceCurriculum.every((item) => item.officialDescription && item.officialSource?.startsWith("https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/")), true);
  assert.equal(logic.grade7ScienceCurriculum.every((item) => [item.processComponents, item.contentFramework, item.keyConcepts, item.learningEvidence, item.learningTeachingExperiences, item.differentiation, item.skills, item.values, item.literacySkills].every((field) => Array.isArray(field) && field.length === 0)), true);
});

test("7. sınıf otomatik planı manuel kayıtları ve mevcut sınıf verilerini değiştirmez", () => {
  const workCalendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const data = { classes: [{ id: "7-a", name: "7-A" }], students: [{ id: "student-1" }], sessions: [], workCalendar, annualPlanEntries: [{ id: "manual-7", classId: "7-a", schoolYear: "2026-2027", weekStart: "2026-10-05", topic: "Manuel plan", note: "Korunmalı", completed: false }], futureField: { keep: true } };
  const before = structuredClone(data);
  logic.buildGrade7SciencePlan(workCalendar);
  assert.deepEqual(data, before);
  assert.equal(logic.buildGrade5SciencePlan(workCalendar).totalHours, 140);
  const grade6 = logic.buildGrade6SciencePlan(workCalendar);
  assert.equal(grade6.totalHours, 140);
  assert.equal(grade6.weeks.flatMap((week) => week.items).filter((item) => item.outcomeCode === "FB.6.3.1.5").reduce((sum, item) => sum + item.hours, 0), 4);
  assert.equal(grade6.weeks.flatMap((week) => week.items).filter((item) => item.outcomeCode === "FB.6.7.2.2").reduce((sum, item) => sum + item.hours, 0), 6);
});

test("8. sınıf Fen Bilimleri planı 35 haftada 72 + 68 olmak üzere 140 saattir", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.ok(result);
  assert.equal(result.weeks.length, 35);
  assert.deepEqual(result.weeks.map((week) => week.totalHours), Array(35).fill(4));
  assert.equal(result.weeks.filter((week) => week.term === 1).reduce((sum, week) => sum + week.totalHours, 0), 72);
  assert.equal(result.weeks.filter((week) => week.term === 2).reduce((sum, week) => sum + week.totalHours, 0), 68);
  assert.deepEqual({ curriculum: result.curriculumHours, engineering: result.capacityAdjustmentHours, total: result.totalHours }, { curriculum: 132, engineering: 8, total: 140 });
});

test("8. sınıf resmî ünite toplamları ve 61 canonical F.8 kazanımı korunur", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const items = result.weeks.flatMap((week) => week.items);
  const unitHours = new Map();
  items.filter((item) => item.unit > 0).forEach((item) => unitHours.set(item.unit, (unitHours.get(item.unit) ?? 0) + item.hours));
  assert.deepEqual([...unitHours.entries()], [[1, 14], [2, 22], [3, 10], [4, 28], [5, 10], [6, 24], [7, 24]]);
  assert.deepEqual(logic.grade8ScienceUnitHours.map((item) => [item.outcomes, item.curriculumHours, item.planHours]), [[3, 14, 14], [13, 22, 22], [3, 10, 10], [17, 28, 28], [2, 10, 10], [12, 24, 24], [11, 24, 24]]);
  assert.equal(logic.grade8ScienceCurriculum.length, 61);
  assert.equal(logic.grade8ScienceCurriculum.every((item) => item.code.startsWith("F.8.") && !item.code.startsWith("FB.8.")), true);
  assert.equal(new Set(logic.grade8ScienceCurriculum.map((item) => item.code)).size, 61);
});

test("8. sınıf 2018 kaynak metadata'sını taşır ve Maarif metadata'sı uydurmaz", () => {
  assert.equal(logic.grade8ScienceCurriculum.every((item) => item.curriculumVersion === "2018 Fen Bilimleri Dersi Öğretim Programı"), true);
  assert.equal(logic.grade8ScienceCurriculum.every((item) => item.officialDescription && item.officialSource?.includes("mufredat.meb.gov.tr") && item.sectionTitle && item.topicHours > 0), true);
  assert.equal(logic.grade8ScienceCurriculum.every((item) => [item.processComponents, item.contentFramework, item.learningEvidence, item.learningTeachingExperiences, item.differentiation, item.skills, item.values, item.literacySkills].every((field) => Array.isArray(field) && field.length === 0)), true);
});

test("8. sınıf ilk haftası F.8.1.1.1 ile başlar; ara tatillerde allocation yoktur", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.equal(result.weeks[0].weekStart, "2026-09-14");
  assert.deepEqual(result.weeks[0].items.map((item) => [item.outcomeCodes, item.hours]), [[['F.8.1.1.1'], 4]]);
  assert.equal(result.weeks.some((week) => week.weekStart === "2026-11-16"), false);
  assert.equal(result.weeks.some((week) => week.weekStart === "2027-03-08"), false);
});

test("18 Ocak yalnız 8. sınıfta normal Fen haftasıdır ve 2+2 geçişi doğrudur", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  for (const grade of [5, 6, 7]) {
    const week = logic.buildPlanWeeks(calendar, grade).find((item) => item.startDate === "2027-01-18");
    assert.equal(week.teachingDays, 0);
    assert.deepEqual(week.breakTitles, ["Sosyal Etkinlik Haftası"]);
  }
  const grade8Week = logic.buildPlanWeeks(calendar, 8).find((item) => item.startDate === "2027-01-18");
  assert.equal(grade8Week.teachingDays, 5);
  assert.deepEqual(grade8Week.breakTitles, []);
  const planWeek = logic.buildGrade8SciencePlan(calendar).weeks.find((item) => item.weekStart === "2027-01-18");
  assert.deepEqual(planWeek.items.map((item) => [item.title, item.hours]), [["Maddenin Isı ile Etkileşimi", 2], ["Türkiye’de Kimya Endüstrisi", 2]]);
});

test("eski kaydedilmiş kapsam dışı Ocak etkinliği Grade 8 planını bozmaz", () => {
  const calendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const january = calendar.breaks.find((item) => item.id === "2027-first-social");
  delete january.grades;
  assert.equal(logic.buildPlanWeeks(calendar, 8).find((item) => item.startDate === "2027-01-18").teachingDays, 5);
  assert.equal(logic.buildPlanWeeks(calendar, 7).find((item) => item.startDate === "2027-01-18").teachingDays, 0);
  assert.equal(logic.buildGrade8SciencePlan(calendar).totalHours, 140);
});

test("8. sınıf kritik 1+3 geçişini ve Basit Makineler 10 saatini korur", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  assert.deepEqual(result.weeks.find((week) => week.weekStart === "2026-12-28").items.map((item) => [item.title, item.hours]), [["Kimyasal Tepkimeler", 1], ["Asitler ve Bazlar", 3]]);
  assert.equal(result.weeks.flatMap((week) => week.items).filter((item) => item.unit === 5).reduce((sum, item) => sum + item.hours, 0), 10);
});

test("tüm F.8 kazanımları 28 Mayıs'a kadar biter ve son iki hafta yalnız mühendisliktir", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const curriculumItems = result.weeks.flatMap((week) => week.items.map((item) => ({ weekStart: week.weekStart, item }))).filter(({ item }) => item.outcomeCodes?.some((code) => code.startsWith("F.8.")));
  assert.equal(curriculumItems.at(-1).weekStart, "2027-05-24");
  for (const weekStart of ["2027-05-31", "2027-06-07"]) {
    const week = result.weeks.find((item) => item.weekStart === weekStart);
    assert.deepEqual(week.items.map((item) => [item.title, item.hours, item.badge, item.outcomeCodes]), [["Fen, Mühendislik ve Girişimcilik Uygulamaları", 4, "mühendislik / proje", undefined]]);
  }
  assert.equal(result.weeks.some((week) => week.weekStart > "2027-06-07"), false);
});

test("8. sınıf çoklu kazanım grupları canonical kodları ve açıklamaları kaybetmez", () => {
  const result = logic.buildGrade8SciencePlan(logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z")));
  const kalitim = result.weeks.flatMap((week) => week.items).find((item) => item.title === "Kalıtım");
  assert.deepEqual(kalitim.outcomeCodes, ["F.8.2.2.1", "F.8.2.2.2", "F.8.2.2.3"]);
  assert.deepEqual(kalitim.curricula.map((item) => item.code), kalitim.outcomeCodes);
  assert.equal(kalitim.curricula.every((item) => item.officialDescription), true);
});

test("8. sınıf otomatik planı manuel ve mevcut verileri değiştirmez; Grade 5–7 regresyonu yoktur", () => {
  const workCalendar = logic.createDefaultWorkCalendar(new Date("2026-08-24T00:00:00.000Z"));
  const data = { classes: [{ id: "8-a", name: "8-A" }], students: [{ id: "student-8" }], sessions: [], workCalendar, annualPlanEntries: [{ id: "manual-8", classId: "8-a", schoolYear: "2026-2027", weekStart: "2026-12-28", topic: "Manuel", note: "Korunmalı", completed: true }], futureField: { keep: true } };
  const before = structuredClone(data);
  logic.buildGrade8SciencePlan(workCalendar);
  assert.deepEqual(data, before);
  assert.equal(logic.buildGrade5SciencePlan(workCalendar).totalHours, 140);
  assert.equal(logic.buildGrade6SciencePlan(workCalendar).totalHours, 140);
  assert.equal(logic.buildGrade7SciencePlan(workCalendar).totalHours, 140);
  assert.deepEqual(logic.grade7ScienceCurriculum.map((item) => item.code).slice(-3), ["FB.7.6.1.3", "FB.7.7.1.1", "FB.7.7.2.1"]);
  assert.equal(logic.isGrade8Class("8 / A"), true);
  assert.equal(logic.buildSciencePlanForClass("8-A", workCalendar).grade, 8);
});
