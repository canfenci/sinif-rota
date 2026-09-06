import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const relRegex = /(import|export)\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(relRegex)];

  for (const match of matches) {
    const kind = match[1];
    const specifiers = match[2];
    const importPath = match[3];
    const dir = relPath.substring(0, relPath.lastIndexOf("/"));
    let targetParts = (dir ? dir + "/" + importPath : importPath).split("/");
    let cleanParts = [];
    for (const p of targetParts) {
      if (p === ".") continue;
      if (p === "..") cleanParts.pop();
      else cleanParts.push(p);
    }
    let targetRel = cleanParts.join("/");
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
        targetRel = `${targetRel}.ts`;
      } catch {
        targetRel = `${targetRel}/index.ts`;
      }
    }
    const targetDataUri = await getTranspiledDataUri(targetRel);
    transpiled = transpiled.replace(match[0], `${kind} ${specifiers} from "${targetDataUri}"`);
  }

  const uri = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  codeCache.set(relPath, uri);
  return uri;
}

async function importTypeScript(relPath) {
  const uri = await getTranspiledDataUri(relPath);
  return import(uri);
}

const reports = await importTypeScript("app/lib/reports.ts");
const seedModule = await importTypeScript("app/lib/seed.ts");
const mockCalendar = seedModule.demoSeedData.workCalendar;

// Sample test fixtures
function createTestStudent(id = "s-1", number = 101, name = "Ali Can", active = true) {
  return { id, number, name, active };
}

function createTestClass(id = "c-1", name = "8-A", students = [createTestStudent()]) {
  return { id, name, students };
}

function createSession(opts) {
  return {
    id: opts.id ?? `sess-${Math.random().toString(36).slice(2, 8)}`,
    classId: opts.classId ?? "c-1",
    className: opts.className ?? "8-A",
    type: opts.type ?? "Ödev",
    date: opts.date ?? "2026-10-05T09:00:00.000Z",
    statuses: opts.statuses ?? {},
    weekStart: opts.weekStart,
    visitIndex: opts.visitIndex,
  };
}

// 1. complete=100
test("1. calculateTypeBreakdown: yalnız complete verildiğinde score 100 olmalı", () => {
  const bd = reports.calculateTypeBreakdown(["complete", "complete"], "Ödev");
  assert.equal(bd.complete, 2);
  assert.equal(bd.partial, 0);
  assert.equal(bd.missing, 0);
  assert.equal(bd.absent, 0);
  assert.equal(bd.evaluatedCount, 2);
  assert.equal(bd.score, 100);
});

// 2. partial=50
test("2. calculateTypeBreakdown: yalnız partial verildiğinde score 50 olmalı", () => {
  const bd = reports.calculateTypeBreakdown(["partial"], "Defter");
  assert.equal(bd.complete, 0);
  assert.equal(bd.partial, 1);
  assert.equal(bd.missing, 0);
  assert.equal(bd.evaluatedCount, 1);
  assert.equal(bd.score, 50);
});

// 3. missing=0
test("3. calculateTypeBreakdown: yalnız missing verildiğinde score 0 olmalı", () => {
  const bd = reports.calculateTypeBreakdown(["missing", "missing"], "Kitap");
  assert.equal(bd.missing, 2);
  assert.equal(bd.evaluatedCount, 2);
  assert.equal(bd.score, 0);
});

// 4. absent excluded from score and denominator
test("4. calculateTypeBreakdown: absent skordan ve evaluatedCount paydasından hariç tutulmalı", () => {
  const bd = reports.calculateTypeBreakdown(["complete", "absent"], "Ödev");
  assert.equal(bd.complete, 1);
  assert.equal(bd.absent, 1);
  assert.equal(bd.evaluatedCount, 1);
  assert.equal(bd.score, 100);
});

// 5. absent separately counted
test("5. calculateTypeBreakdown: absent ayrı bir sayaç olarak tutulmalı", () => {
  const bd = reports.calculateTypeBreakdown(["absent", "absent", "absent"], "Materyal");
  assert.equal(bd.absent, 3);
  assert.equal(bd.evaluatedCount, 0);
  assert.equal(bd.score, null);
});

// 6. evaluatedCount correct and decimal score preserved
test("6. calculateTypeBreakdown: evaluatedCount ve decimal skor (complete=2, partial=1, missing=1, absent=1 -> 62.5)", () => {
  const bd = reports.calculateTypeBreakdown(["complete", "complete", "partial", "missing", "absent"], "Ödev");
  assert.equal(bd.complete, 2);
  assert.equal(bd.partial, 1);
  assert.equal(bd.missing, 1);
  assert.equal(bd.absent, 1);
  assert.equal(bd.evaluatedCount, 4);
  assert.equal(bd.score, 62.5);
});

// 7. no observations -> score null
test("7. calculateTypeBreakdown: hiçbir gözlem yokken score null olmalı ve NaN olmamalı", () => {
  const bd = reports.calculateTypeBreakdown([], "Ödev");
  assert.equal(bd.evaluatedCount, 0);
  assert.equal(bd.score, null);
  assert.equal(Number.isNaN(bd.score), false);
});

// 8. student type breakdown
test("8. calculateStudentReportCore: 4 kontrol türü için bağımsız TypeBreakdown üretir", () => {
  const student = createTestStudent("s-1", 10, "Zeynep Yılmaz");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" }),
    createSession({ type: "Defter", statuses: { "s-1": "partial" }, weekStart: "2026-10-05" }),
    createSession({ type: "Kitap", statuses: { "s-1": "missing" }, weekStart: "2026-10-05" }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.studentId, "s-1");
  assert.equal(report.className, "8-A");
  assert.equal(report.breakdowns["Ödev"].score, 100);
  assert.equal(report.breakdowns["Defter"].score, 50);
  assert.equal(report.breakdowns["Kitap"].score, 0);
  assert.equal(report.breakdowns["Materyal"].score, null);
  assert.equal(report.breakdowns["Materyal"].evaluatedCount, 0);
});

// 9. student raw participation average
test("9. calculateStudentReportCore: yalnız score != null olan türlerin ortalamasını alır (Ödev=80, Defter=90, Materyal=70, Kitap=null -> 80)", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  // Ödev: 4 complete, 1 missing -> 400 / 5 = 80
  // Defter: 9 complete, 1 missing -> 900 / 10 = 90
  // Materyal: 7 complete, 3 missing -> 700 / 10 = 70
  // Kitap: 0 session -> null
  const sessions = [
    ...Array.from({ length: 4 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" })),
    createSession({ type: "Ödev", statuses: { "s-1": "missing" }, weekStart: "2026-10-05" }),
    ...Array.from({ length: 9 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" })),
    createSession({ type: "Defter", statuses: { "s-1": "missing" }, weekStart: "2026-10-05" }),
    ...Array.from({ length: 7 }, () => createSession({ type: "Materyal", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Materyal", statuses: { "s-1": "missing" }, weekStart: "2026-10-05" })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.breakdowns["Ödev"].score, 80);
  assert.equal(report.breakdowns["Defter"].score, 90);
  assert.equal(report.breakdowns["Materyal"].score, 70);
  assert.equal(report.breakdowns["Kitap"].score, null);
  assert.equal(report.typeCoverage, 3);
  // (80 + 90 + 70) / 3 = 240 / 3 = 80
  assert.equal(report.participationRawAverage, 80);
});

// 10. missing type not treated as zero
test("10. calculateStudentReportCore: eksik kontrol türü 0 sayılmaz ve paydaya girmez", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.typeCoverage, 1);
  // Yalnız Ödev var (100). Defter, Kitap, Materyal yok.
  // 0 sayılsaydı 100/4 = 25 olurdu. Ama kural gereği 100/1 = 100 olmalı.
  assert.equal(report.participationRawAverage, 100);
});

// 11. class aggregate score
test("11. calculateClassReportCore: tüm gözlemleri eşit ağırlıkla toplayarak sınıf skoru hesaplar", () => {
  const s1 = createTestStudent("s-1", 1, "Öğrenci 1");
  const s2 = createTestStudent("s-2", 2, "Öğrenci 2");
  const schoolClass = createTestClass("c-1", "8-A", [s1, s2]);

  // Session 1: s1=complete (100), s2=missing (0)
  // Session 2: s1=complete (100), s2=absent (hesap dışı)
  // Toplam Ödev gözlemleri: complete=2, missing=1, absent=1 -> evaluated=3 -> (200)/3 = 66.6666...
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete", "s-2": "missing" }, weekStart: "2026-10-05" }),
    createSession({ type: "Ödev", statuses: { "s-1": "complete", "s-2": "absent" }, weekStart: "2026-10-05" }),
  ];

  const classReport = reports.calculateClassReportCore(schoolClass, sessions);
  assert.equal(classReport.totalStudents, 2);
  assert.equal(classReport.activeStudents, 2);
  assert.equal(classReport.typeAverages["Ödev"].complete, 2);
  assert.equal(classReport.typeAverages["Ödev"].missing, 1);
  assert.equal(classReport.typeAverages["Ödev"].absent, 1);
  assert.equal(classReport.typeAverages["Ödev"].evaluatedCount, 3);
  assert.equal(reports.roundScore(classReport.typeAverages["Ödev"].score, 2), 66.67);
});

// 12. weekly grouping
test("12. calculateWeeklyClassSummaries: session'ları haftalara göre kronolojik gruplar", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ weekStart: "2026-10-12", type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-09-28", type: "Ödev", statuses: { "s-1": "partial" } }),
    createSession({ weekStart: "2026-10-05", type: "Defter", statuses: { "s-1": "missing" } }),
  ];

  const weekly = reports.calculateWeeklyClassSummaries(schoolClass, sessions);
  assert.equal(weekly.length, 3);
  assert.equal(weekly[0].weekStart, "2026-09-28");
  assert.equal(weekly[1].weekStart, "2026-10-05");
  assert.equal(weekly[2].weekStart, "2026-10-12");
  assert.equal(weekly[0].sessionCount, 1);
  assert.equal(weekly[0].typeBreakdowns["Ödev"].score, 50);
});

// 13. visitIndex preservation
test("13. calculateWeeklyClassSummaries: haftadaki visitIndex'leri sıralı ve benzersiz olarak korur", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ weekStart: "2026-10-05", visitIndex: 2, type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-05", visitIndex: 1, type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-05", visitIndex: 2, type: "Defter", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-05", visitIndex: 3, type: "Kitap", statuses: { "s-1": "complete" } }),
  ];

  const [summary] = reports.calculateWeeklyClassSummaries(schoolClass, sessions);
  assert.deepEqual(summary.visitIndices, [1, 2, 3]);
  assert.equal(summary.hasLegacyVisits, false);
});

// 14. legacy visit undefined preserved
test("14. calculateWeeklyClassSummaries: legacy visitIndex=undefined korunur ve hasLegacyVisits true döner", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ weekStart: "2026-10-05", visitIndex: undefined, type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-05", visitIndex: 1, type: "Defter", statuses: { "s-1": "complete" } }),
  ];

  const [summary] = reports.calculateWeeklyClassSummaries(schoolClass, sessions);
  assert.deepEqual(summary.visitIndices, [1]);
  assert.equal(summary.hasLegacyVisits, true);
});

// 15. legacy week resolved
test("15. calculateStudentReportCore: weekStart alanı olmayan legacy session'ı tarihten çözer", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  // 2026-09-23 Çarşamba -> Hafta Pazartesisi: 2026-09-21
  const session = createSession({
    date: "2026-09-23T10:00:00.000Z",
    weekStart: undefined,
    type: "Ödev",
    statuses: { "s-1": "complete" },
  });

  const weekly = reports.calculateWeeklyClassSummaries(schoolClass, [session], { calendar: mockCalendar });
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].weekStart, "2026-09-21");
});

// 16. report range works (fromWeekStart, toWeekStart)
test("16. ReportRange: fromWeekStart ve toWeekStart aralığındaki oturumları tam filtreler", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ weekStart: "2026-09-21", type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-09-28", type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-05", type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ weekStart: "2026-10-12", type: "Ödev", statuses: { "s-1": "complete" } }),
  ];

  // Filtre: 28 Eylül - 5 Ekim arası (2 hafta)
  const range = { fromWeekStart: "2026-09-28", toWeekStart: "2026-10-05" };
  const report = reports.calculateStudentReportCore(student, schoolClass, sessions, { range });
  assert.equal(report.breakdowns["Ödev"].evaluatedCount, 2);

  const weekly = reports.calculateWeeklyClassSummaries(schoolClass, sessions, { range });
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].weekStart, "2026-09-28");
  assert.equal(weekly[1].weekStart, "2026-10-05");
});

// 17. class isolation
test("17. Class isolation: başka bir sınıfa ait oturumlar hesaplamaya katılmaz", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ classId: "c-1", type: "Ödev", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" }),
    createSession({ classId: "c-2", type: "Ödev", statuses: { "s-1": "missing" }, weekStart: "2026-10-05" }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.breakdowns["Ödev"].evaluatedCount, 1);
  assert.equal(report.breakdowns["Ödev"].score, 100);

  const classReport = reports.calculateClassReportCore(schoolClass, sessions);
  assert.equal(classReport.totalSessions, 1);
  assert.equal(classReport.typeAverages["Ödev"].score, 100);
});

// 18. student isolation
test("18. Student isolation: sınıftaki diğer öğrencilerin durumları öğrenci raporunu etkilemez", () => {
  const s1 = createTestStudent("s-1");
  const s2 = createTestStudent("s-2");
  const schoolClass = createTestClass("c-1", "8-A", [s1, s2]);
  const sessions = [
    createSession({ classId: "c-1", type: "Ödev", statuses: { "s-1": "complete", "s-2": "missing" }, weekStart: "2026-10-05" }),
  ];

  const r1 = reports.calculateStudentReportCore(s1, schoolClass, sessions);
  const r2 = reports.calculateStudentReportCore(s2, schoolClass, sessions);
  assert.equal(r1.breakdowns["Ödev"].score, 100);
  assert.equal(r2.breakdowns["Ödev"].score, 0);
});

// 19. input immutability
test("19. Input immutability: calculate fonksiyonları girdi nesnelerini mutate etmez", () => {
  const student = Object.freeze(createTestStudent("s-1", 1, "Ali"));
  const schoolClass = Object.freeze(createTestClass("c-1", "8-A", [student]));
  const session = Object.freeze(createSession({
    classId: "c-1",
    type: "Ödev",
    statuses: Object.freeze({ "s-1": "complete" }),
    weekStart: "2026-10-05",
  }));
  const sessions = Object.freeze([session]);

  // Çağrılar dondurulmuş nesnelerde hata fırlatmamalı
  assert.doesNotThrow(() => {
    reports.calculateStudentReportCore(student, schoolClass, sessions);
    reports.calculateClassReportCore(schoolClass, sessions);
    reports.calculateWeeklyClassSummaries(schoolClass, sessions);
  });
});

// 20. NaN never returned
test("20. NaN never returned: boş ve sıra dışı girdilerde skorlar null döner, asla NaN dönmez", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);

  const emptyStudentReport = reports.calculateStudentReportCore(student, schoolClass, []);
  assert.equal(emptyStudentReport.participationRawAverage, null);
  for (const type of reports.ALL_CHECK_TYPES) {
    assert.equal(emptyStudentReport.breakdowns[type].score, null);
    assert.equal(Number.isNaN(emptyStudentReport.breakdowns[type].score), false);
  }

  const emptyClassReport = reports.calculateClassReportCore(schoolClass, []);
  for (const type of reports.ALL_CHECK_TYPES) {
    assert.equal(emptyClassReport.typeAverages[type].score, null);
    assert.equal(Number.isNaN(emptyClassReport.typeAverages[type].score), false);
  }
});

// 21. observedAbsence terminology used
test("21. Terminoloji: observedAbsenceCount ve calculateObservedAbsenceRate kullanılır", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "absent" }, weekStart: "2026-10-05" }),
    createSession({ type: "Defter", statuses: { "s-1": "complete" }, weekStart: "2026-10-05" }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(typeof report.observedAbsenceCount, "number");
  assert.equal(report.observedAbsenceCount, 1);

  const rate = reports.calculateObservedAbsenceRate(report.observedAbsenceCount, 2);
  assert.equal(rate, 0.5);
});

// 22. no official attendance terminology introduced
test("22. Terminoloji kontrolü: app/lib/reports.ts kodunda resmi 'devamsızlık' ifadesi bulunmamalı", async () => {
  const source = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
  // Yalnızca yorum veya kodda 'devamsızlık' geçiyor mu (harfiyen kontrol)
  // Sadece yasaklayan ifadenin yorumda geçmesi hariç kontrol:
  const lines = source.split("\n");
  for (const line of lines) {
    if (line.includes("devamsızlık") && !line.includes("kaçınılır") && !line.includes("Resmi")) {
      assert.fail(`Bulunan yasaklı terminoloji: "${line}"`);
    }
  }
});

// 23. Edge Case: Inactive student
test("23. Edge Case: active=false öğrencinin raporu hesaplanabilir ancak sınıf activeStudents sayısına girmez", () => {
  const sActive = createTestStudent("s-1", 1, "Aktif Öğrenci", true);
  const sInactive = createTestStudent("s-2", 2, "Ayrılan Öğrenci", false);
  const schoolClass = createTestClass("c-1", "8-A", [sActive, sInactive]);

  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-2": "complete" }, weekStart: "2026-10-05" }),
  ];

  const inactiveReport = reports.calculateStudentReportCore(sInactive, schoolClass, sessions);
  assert.equal(inactiveReport.breakdowns["Ödev"].score, 100);

  const classReport = reports.calculateClassReportCore(schoolClass, sessions);
  assert.equal(classReport.totalStudents, 2);
  assert.equal(classReport.activeStudents, 1);
});

// 24. Edge Case: Cross-month week resolution
test("24. Edge Case: Ay geçişi haftasında oturum doğru Pazartesiye bağlanır", () => {
  const student = createTestStudent("s-1");
  const schoolClass = createTestClass("c-1", "8-A", [student]);
  // 2026-10-01 Perşembe -> Haftanın Pazartesisi: 2026-09-28
  const session = createSession({
    date: "2026-10-01T14:30:00.000Z",
    weekStart: undefined,
    type: "Ödev",
    statuses: { "s-1": "complete" },
  });

  const weekly = reports.calculateWeeklyClassSummaries(schoolClass, [session], { calendar: mockCalendar });
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].weekStart, "2026-09-28");
});
