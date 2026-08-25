import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [page, annualPlan] = await Promise.all([
  read("app/page.tsx"),
  read("app/components/AnnualPlan.tsx"),
]);

test("desteklenen güncel yıl normal yıllık plan deneyimini korur", () => {
  assert.match(page, /calendarSupportState !== "unsupported_year" && workCalendar && <AnnualPlan/);
  assert.match(annualPlan, /calendarSupportState === "supported_historical"/);
});

test("tarihsel destekli takvim görünür kalır ve tarihsel rozet gösterir", () => {
  assert.match(annualPlan, /Geçmiş Eğitim Yılı \(\{calendar\.schoolYear\.replace\("-", "–"\)\}\)/);
  assert.match(annualPlan, /!isHistorical && <button type="button" onClick=\{\(\) => setCalendarOpen\(true\)\}>Takvimi düzenle<\/button>/);
  assert.match(annualPlan, /disabled=\{closed \|\| isHistorical\}/);
  assert.match(annualPlan, /isHistorical \? "Geçmiş kayıt"/);
  assert.match(page, /data\.workCalendar \?\? defaultCalendarResolution\.calendar/);
  assert.doesNotMatch(page, /calendarSupportState === "supported_historical" && <section className="unsupported-year-state"/);
});

test("desteklenmeyen varsayılan yıl dinamik yapılandırılmadı durumunu gösterir", () => {
  assert.match(page, /calendarSupportState === "unsupported_year" && <section className="unsupported-year-state"/);
  assert.match(page, /Eğitim Öğretim Yılı Henüz Yapılandırılmadı/);
  assert.match(page, /Bu eğitim yılı için resmî MEB çalışma takvimi ve ders planı şablonu henüz sisteme eklenmemiştir\./);
  assert.match(page, /calendarSchoolYear\.replace\("-", "–"\)/);
  assert.doesNotMatch(page, /calendarSupportState === "unsupported_year" && workCalendar && <AnnualPlan/);
});

test("takvim düzenleyicisi desteklenmeyen serbest eğitim yılı kaydını kabul etmez", () => {
  assert.match(annualPlan, /isSupportedAcademicYear\(draft\.schoolYear\)/);
  assert.match(annualPlan, /Bu eğitim yılı için resmî MEB çalışma takvimi henüz sisteme eklenmemiştir\./);
});
