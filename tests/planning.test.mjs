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
