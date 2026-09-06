import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const reactUrl = import.meta.resolve("react");
const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;

  transpiled = transpiled.replace(/from\s+["']react["']/g, `from "${reactUrl}"`);
  transpiled = `import React from "${reactUrl}";\n` + transpiled;

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
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".tsx") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.tsx`, import.meta.url));
        targetRel = `${targetRel}.tsx`;
      } catch {
        try {
          await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
          targetRel = `${targetRel}.ts`;
        } catch {
          targetRel = `${targetRel}/index.ts`;
        }
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

const reportsMod = await importTypeScript("app/lib/reports.ts");
const reportsViewMod = await importTypeScript("app/components/ReportsView.tsx");
const quickCheckMod = await importTypeScript("app/lib/quick-check.ts");
const academicYearMod = await importTypeScript("app/lib/academic-year.ts");

const demoCalendar = academicYearMod.getOfficialWorkCalendar("2026-2027");

const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function createMockClass(id = "c1", name = "8-A", students = []) {
  return {
    id,
    name,
    grade: 8,
    branch: "A",
    students,
  };
}

function createMockStudent(id = "s1", name = "Ahmet Yılmaz", number = 101, classId = "c1", active = true) {
  return {
    id,
    name,
    number,
    classId,
    active,
  };
}

function createMockSession(args = {}) {
  return {
    id: args.id ?? "ses-1",
    classId: args.classId ?? "c1",
    type: args.type ?? "Ödev",
    date: args.date ?? "2026-09-14",
    statuses: args.statuses ?? { s1: "complete" },
    visitIndex: "visitIndex" in args ? args.visitIndex : 1,
  };
}

// 1. selected student report renders
test("1. selected student report renders: seçilen öğrenci için rapor başarıyla üretilir", () => {
  assert.ok(typeof reportsViewMod.ReportsView === "function");
  const student = createMockStudent("s1", "Ahmet Yılmaz", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", date: "2026-09-14", statuses: { s1: "complete" }, visitIndex: 1 }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, {
    calendar: demoCalendar,
  });

  assert.equal(report.studentId, "s1");
  assert.equal(report.studentName, "Ahmet Yılmaz");
  assert.equal(report.studentNumber, 101);
  assert.equal(report.className, "8-A");
  assert.ok(Array.isArray(report.weeklyHistory));
});

// 2. class/student identity correct
test("2. class/student identity correct: öğrenci başlığında ad, sınıf adı, numara ve arşiv durumu doğru", () => {
  const student = createMockStudent("s1", "Zeynep Kaya", 205, "c1", false);
  const schoolClass = createMockClass("c1", "7-B", [student]);
  const sessions = [];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, {
    calendar: demoCalendar,
  });

  assert.equal(report.studentName, "Zeynep Kaya");
  assert.equal(report.studentNumber, 205);
  assert.equal(report.className, "7-B");
  assert.equal(student.active, false);

  // ReportsView'da numara formatı ve arşiv badge doğrulaması
  assert.match(reportsViewSource, /No: \{selectedStudent\.number\}/);
  assert.match(reportsViewSource, /selectedStudent\.active === false/);
  assert.match(reportsViewSource, /Arşivlenmiş öğrenci/);
});

// 3. four metrics exist
test("3. four metrics exist: 4 temel kontrol türü metriği eksiksiz hesaplanır", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const report = reportsMod.calculateStudentReportCore(student, schoolClass, [], { calendar: demoCalendar });

  for (const type of reportsMod.ALL_CHECK_TYPES) {
    assert.ok(type in report.breakdowns, `${type} metriği mevcut olmalı`);
  }
});

// 4. metric percentage correct
test("4. metric percentage correct: kontrol türü yüzdesi doğru hesaplanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", type: "Ödev", statuses: { s1: "missing" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  // complete: 100, missing: 0 -> avg: 50%
  assert.equal(report.breakdowns["Ödev"].score, 50);
});

// 5. metric evaluatedCount correct
test("5. metric evaluatedCount correct: değerlendirilen kontrol sayısı doğru", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Kitap", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", type: "Kitap", statuses: { s1: "absent" } }), // absent değerlendirmeye girmez
    createMockSession({ id: "ses-3", type: "Kitap", statuses: { s1: "partial" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.breakdowns["Kitap"].evaluatedCount, 2);
  assert.equal(report.breakdowns["Kitap"].absent, 1);
});

// 6. null metric -> —
test("6. null metric -> —: veri olmayan metrik skoru null döner ve arayüzde — olarak gösterilir", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const report = reportsMod.calculateStudentReportCore(student, schoolClass, [], { calendar: demoCalendar });

  assert.equal(report.breakdowns["Defter"].score, null);
  assert.equal(report.breakdowns["Defter"].evaluatedCount, 0);

  // ReportsView'da null kontrolü
  assert.match(reportsViewSource, /score !== null \? `%\$\{score\}` : "—"/);
  assert.match(reportsViewSource, /<span className="metric-no-data">Veri yok<\/span>/);
});

// 7. sufficient -> suggested score visible
test("7. sufficient -> suggested score visible: veri yeterli olduğunda katılım notu ve açıklamalar gösterilir", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  
  // 6 farklı hafta, her biri 1. ve 2. giriş içeren, her türden en az 2'şer kontrol
  const sessions = [];
  const weeks = [
    "2026-09-14", "2026-09-21", "2026-09-28",
    "2026-10-05", "2026-10-12", "2026-10-19",
  ];
  let idCounter = 1;
  for (const w of weeks) {
    sessions.push(createMockSession({ id: `s-${idCounter++}`, type: "Ödev", date: w, statuses: { s1: "complete" }, visitIndex: 1 }));
    sessions.push(createMockSession({ id: `s-${idCounter++}`, type: "Defter", date: w, statuses: { s1: "complete" }, visitIndex: 2 }));
    sessions.push(createMockSession({ id: `s-${idCounter++}`, type: "Kitap", date: w, statuses: { s1: "complete" }, visitIndex: 1 }));
    sessions.push(createMockSession({ id: `s-${idCounter++}`, type: "Materyal", date: w, statuses: { s1: "complete" }, visitIndex: 2 }));
  }

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(typeof report.suggestedParticipationScore, "number");
  assert.equal(report.suggestedParticipationScore, 100);

  // Metin doğrulamaları
  assert.equal(reportsMod.PARTICIPATION_COPY.TITLE, "Derse Katılım Öneri Notu");
  assert.equal(reportsMod.PARTICIPATION_COPY.DESCRIPTION, "Derse katılım değerlendirmesi; kayıt altına alınan ödev yapma, defter, kitap ve materyal getirme sıklıklarına göre oluşturulmuştur.");
  assert.equal(reportsMod.PARTICIPATION_COPY.DISCLAIMER, "Bu puan öğretmenin değerlendirmesine yardımcı olmak amacıyla oluşturulan öneri puandır.");
});

// 8. insufficient -> suggested score null
test("8. insufficient -> suggested score null: yetersiz veride suggestedParticipationScore null döner", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.dataSufficiency.sufficientData, false);
  assert.equal(report.suggestedParticipationScore, null);
});

// 9. coverageNote shown
test("9. coverageNote shown: yetersiz veride nötr coverageNote mevcuttur", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(report.dataSufficiency.coverageNote.length > 0);
  assert.match(report.dataSufficiency.coverageNote, /veri gerekiyor|kontrol eksik|veri bulunmamaktadır/);
  // Negative etiket veya risk içermemeli
  assert.doesNotMatch(report.dataSufficiency.coverageNote, /risk|tehlike|başarısız|kötü/i);
});

// 10. raw participation average not shown as final note
test("10. raw participation average not shown as final note: ham ortalama nihai not olarak gösterilmez", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }), // rawAverage = 100 ama veri yetersiz
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.participationRawAverage, 100);
  assert.equal(report.suggestedParticipationScore, null);

  // ReportsView'da sadece suggestedParticipationScore gösterilir, rawAverage nihai not yerine geçmez
  assert.match(reportsViewSource, /studentReport\.suggestedParticipationScore !== null/);
  assert.doesNotMatch(reportsViewSource, /participationRawAverage \/ 100/);
});

// 11. observedAbsenceCount correct
test("11. observedAbsenceCount correct: öğrencinin kontrollerdeki toplam gelmedi sayısı doğru", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "absent" } }),
    createMockSession({ id: "ses-2", type: "Kitap", statuses: { s1: "absent" } }),
    createMockSession({ id: "ses-3", type: "Defter", statuses: { s1: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.observedAbsenceCount, 2);
});

// 12. official devamsızlık terminology not introduced
test("12. official devamsızlık terminology not introduced: resmi devamsızlık/yoklama terimleri kullanılmaz", () => {
  const studentSection = reportsViewSource.slice(
    reportsViewSource.indexOf('activeTab === "students"')
  );

  assert.match(studentSection, /KONTROLLERDE GELMEDİ/);
  assert.match(studentSection, /Yalnız ders içi kontrollerde/);
  assert.doesNotMatch(studentSection, /resmi devamsızlık/i);
  assert.doesNotMatch(studentSection, /devamsızlık oranı/i);
  assert.doesNotMatch(studentSection, /özürlü devamsızlık/i);
  assert.doesNotMatch(studentSection, /özürsüz devamsızlık/i);
});

// 13. weekly history produced
test("13. weekly history produced: haftalık geçmiş listesi doğru üretilir", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", statuses: { s1: "complete" }, visitIndex: 1 }),
    createMockSession({ id: "ses-2", date: "2026-09-21", type: "Defter", statuses: { s1: "partial" }, visitIndex: 2 }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history.length, 2);
  assert.equal(history[0].weekStart, "2026-09-21"); // En yeni üstte
  assert.equal(history[1].weekStart, "2026-09-14");
});

// 14. current week range filtering
test("14. current week range filtering: mevcut hafta filtresi doğru çalışır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const now = new Date("2026-09-14T10:00:00Z");
  const range = reportsMod.resolveReportRange("current_week", demoCalendar, now);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-21", statuses: { s1: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { range, calendar: demoCalendar });
  assert.equal(report.totalValidCheckCount, 1);
  assert.equal(report.weeklyHistory.length, 1);
  assert.equal(report.weeklyHistory[0].weekStart, "2026-09-14");
});

// 15. last 4 weeks filtering
test("15. last 4 weeks filtering: son 4 hafta filtresi takvim sınırları içinde filtreler", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const now = new Date("2026-10-05T10:00:00Z");
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, now);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-21", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-3", date: "2026-09-28", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-4", date: "2026-10-05", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-5", date: "2026-10-12", statuses: { s1: "complete" } }), // out of range
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { range, calendar: demoCalendar });
  assert.equal(report.totalValidCheckCount, 4);
  assert.equal(report.weeklyHistory.length, 4);
});

// 16. term filtering
test("16. term filtering: 1. dönem filtresi doğru çalışır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const now = new Date("2026-09-14T10:00:00Z"); // 1. dönem tarihi
  const range = reportsMod.resolveReportRange("term", demoCalendar, now);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }), // 1. dönem
    createMockSession({ id: "ses-2", date: "2027-02-15", statuses: { s1: "complete" } }), // 2. dönem
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { range, calendar: demoCalendar });
  assert.equal(report.totalValidCheckCount, 1);
  assert.equal(report.weeklyHistory.length, 1);
  assert.equal(report.weeklyHistory[0].weekStart, "2026-09-14");
});

// 17. year filtering
test("17. year filtering: tam eğitim yılı filtresi tüm haftaları kapsar", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const now = new Date("2026-09-14T10:00:00Z");
  const range = reportsMod.resolveReportRange("year", demoCalendar, now);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2027-02-15", statuses: { s1: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { range, calendar: demoCalendar });
  assert.equal(report.totalValidCheckCount, 2);
  assert.equal(report.weeklyHistory.length, 2);
});

// 18. visit 1 grouping
test("18. visit 1 grouping: visitIndex 1 olan oturumlar 1. Giriş altında gruplanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", visitIndex: 1, statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-14", type: "Kitap", visitIndex: 1, statuses: { s1: "complete" } }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history[0].visits.length, 1);
  assert.equal(history[0].visits[0].visitIndex, 1);
  assert.equal(history[0].visits[0].checks.length, 2);
});

// 19. visit 2 grouping
test("19. visit 2 grouping: visitIndex 2 olan oturumlar 2. Giriş altında gruplanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", visitIndex: 1, statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-14", type: "Defter", visitIndex: 2, statuses: { s1: "partial" } }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history[0].visits.length, 2);
  assert.equal(history[0].visits[0].visitIndex, 1);
  assert.equal(history[0].visits[1].visitIndex, 2);
  assert.equal(history[0].visits[1].checks[0].type, "Defter");
});

// 20. visit 3+ support
test("20. visit 3+ support: 3 veya daha fazla giriş sıralı olarak desteklenir", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-3", date: "2026-09-14", type: "Kitap", visitIndex: 3, statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", visitIndex: 1, statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-14", type: "Defter", visitIndex: 2, statuses: { s1: "complete" } }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history[0].visits.length, 3);
  assert.equal(history[0].visits[0].visitIndex, 1);
  assert.equal(history[0].visits[1].visitIndex, 2);
  assert.equal(history[0].visits[2].visitIndex, 3);
});

// 21. legacy visit undefined preserved
test("21. legacy visit undefined preserved: visitIndex undefined olan oturumlar en sonda 'Giriş bilgisi yok' olarak gruplanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", visitIndex: undefined, statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-14", type: "Kitap", visitIndex: 1, statuses: { s1: "complete" } }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history[0].visits.length, 2);
  assert.equal(history[0].visits[0].visitIndex, 1);
  assert.equal(history[0].visits[1].visitIndex, undefined);

  // ReportsView'da etiket doğrulaması
  assert.match(reportsViewSource, /v\.visitIndex !== undefined\s*\?\s*`\$\{v\.visitIndex\}\. Giriş`\s*:\s*"Giriş bilgisi yok"/);
});

// 22. homework status label Yaptı/Yapmadı
test("22. homework status label Yaptı/Yapmadı: Ödev türü için Yaptı/Yapmadı etiketleri kullanılır", () => {
  const completePres = quickCheckMod.getStatusPresentation("Ödev", "complete");
  const missingPres = quickCheckMod.getStatusPresentation("Ödev", "missing");

  assert.equal(completePres.title, "Yaptı");
  assert.equal(missingPres.title, "Yapmadı");
});

// 23. material status label Getirdi/Getirmedi
test("23. material status label Getirdi/Getirmedi: Defter, Kitap ve Materyal için Getirdi/Getirmedi kullanılır", () => {
  for (const t of ["Defter", "Kitap", "Materyal"]) {
    const completePres = quickCheckMod.getStatusPresentation(t, "complete");
    const missingPres = quickCheckMod.getStatusPresentation(t, "missing");
    assert.equal(completePres.title, "Getirdi");
    assert.equal(missingPres.title, "Getirmedi");
  }
});

// 24. partial = Eksik
test("24. partial = Eksik: kısmi durum tüm kontrol türlerinde 'Eksik' başlığını taşır", () => {
  for (const t of reportsMod.ALL_CHECK_TYPES) {
    const pres = quickCheckMod.getStatusPresentation(t, "partial");
    assert.equal(pres.title, "Eksik");
  }
});

// 25. absent = Gelmedi
test("25. absent = Gelmedi: absent durumu tüm kontrol türlerinde 'Gelmedi' başlığını taşır", () => {
  for (const t of reportsMod.ALL_CHECK_TYPES) {
    const pres = quickCheckMod.getStatusPresentation(t, "absent");
    assert.equal(pres.title, "Gelmedi");
  }
});

// 26. newest week appears first
test("26. newest week appears first: haftalar yeniden eskiye (azalan) sıralanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-3", date: "2026-10-05", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-28", statuses: { s1: "complete" } }),
  ];

  const history = reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(history.length, 3);
  assert.equal(history[0].weekStart, "2026-10-05");
  assert.equal(history[1].weekStart, "2026-09-28");
  assert.equal(history[2].weekStart, "2026-09-14");
});

// 27. inactive student report works
test("27. inactive student report works: aktif olmayan (arşivlenmiş) öğrenci için de rapor eksiksiz üretilir", () => {
  const student = createMockStudent("s99", "Mehmet Demir", 999, "c1", false);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", type: "Ödev", statuses: { s99: "complete" } }),
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(student.active, false);
  assert.equal(report.studentName, "Mehmet Demir");
  assert.equal(report.totalValidCheckCount, 1);
  assert.equal(report.breakdowns["Ödev"].score, 100);
});

// 28. class isolation
test("28. class isolation: başka bir sınıfa ait oturumlar hesaplamaya dahil edilmez", () => {
  const student = createMockStudent("s1", "Ahmet Yılmaz", 101, "c1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", classId: "c2", type: "Ödev", statuses: { s1: "missing" } }), // Başka sınıf
  ];

  const report = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(report.totalValidCheckCount, 1);
  assert.equal(report.breakdowns["Ödev"].score, 100);
});

// 29. student isolation
test("29. student isolation: aynı oturumdaki diğer öğrencilerin durumları bu öğrenciye sızmaz", () => {
  const student1 = createMockStudent("s1", "Ahmet", 101, "c1");
  const student2 = createMockStudent("s2", "Ayşe", 102, "c1");
  const schoolClass = createMockClass("c1", "8-A", [student1, student2]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete", s2: "missing" } }),
  ];

  const report1 = reportsMod.calculateStudentReportCore(student1, schoolClass, sessions, { calendar: demoCalendar });
  const report2 = reportsMod.calculateStudentReportCore(student2, schoolClass, sessions, { calendar: demoCalendar });

  assert.equal(report1.breakdowns["Ödev"].score, 100);
  assert.equal(report2.breakdowns["Ödev"].score, 0);
});

// 30. no input mutation
test("30. no input mutation: hesaplama fonksiyonları girdi dizilerini ve nesnelerini mutate etmez", () => {
  const student = Object.freeze(createMockStudent("s1", "Ahmet", 101, "c1"));
  const schoolClass = Object.freeze(createMockClass("c1", "8-A", [student]));
  const session = Object.freeze(createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }));
  const sessions = Object.freeze([session]);

  assert.doesNotThrow(() => {
    reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
    reportsMod.calculateStudentWeeklyHistory(student, schoolClass, sessions, { calendar: demoCalendar });
  });
});

// 31. no chart dependency
test("31. no chart dependency: harici veya dahili grafik kütüphanesi kullanılmaz", () => {
  assert.match(cssSource, /\.reports-participation-card/);
  assert.match(cssSource, /\.student-weekly-card/);
  assert.doesNotMatch(reportsViewSource, /chart\.js/i);
  assert.doesNotMatch(reportsViewSource, /recharts/i);
  assert.doesNotMatch(reportsViewSource, /victory/i);
});

// 32. no PDF generation (RAPOR-13A: "Yazdır / PDF" yazdırma affordance'ı hariç)
test("32. no PDF: PDF kütüphanesi veya gerçek PDF üretimi bulunmaz", () => {
  assert.doesNotMatch(reportsViewSource, /jspdf/i);
  assert.doesNotMatch(reportsViewSource, /react-pdf|pdf-lib|html2canvas/i);
  assert.doesNotMatch(reportsViewSource, /new Blob|new File\(|URL\.createObjectURL/i);
  const withoutPrintAffordances = reportsViewSource
    .replace(/Yazdır \/ PDF/g, "")
    .replace(/PDF olarak kaydedebilirsiniz/g, "");
  assert.doesNotMatch(withoutPrintAffordances, /pdf/i);
});

// 33. no AI
test("33. no AI: yapay zeka veya LLM entegrasyonu bulunmaz", () => {
  assert.doesNotMatch(reportsViewSource, /gemini/i);
  assert.doesNotMatch(reportsViewSource, /openai/i);
  assert.doesNotMatch(reportsSource, /\bAI\b/);
  assert.doesNotMatch(reportsSource, /\bLLM\b/i);
});

// 34. no teacher notes
test("34. no teacher notes: öğretmen notu veya serbest metin yorumu bulunmaz", () => {
  const studentSection = reportsViewSource.slice(
    reportsViewSource.indexOf('activeTab === "students"')
  );
  assert.doesNotMatch(studentSection, /teacherNote/i);
  assert.doesNotMatch(studentSection, /öğretmen notu/i);
  assert.doesNotMatch(studentSection, /öğretmen yorumu/i);
});

// 35. no persistence/schema change
test("35. no persistence/schema change: veri tabanı şeması ve persistence katmanı değiştirilmez", async () => {
  const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storageSource, /weeklyHistory/);
  assert.doesNotMatch(storageSource, /suggestedParticipationScore/);
});

// 36. Class Reports regression stays green
test("36. Class Reports regression stays green: Sınıf raporları fonksiyonları ve arayüzü bozulmadan çalışır", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent("s1")]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } })];

  const classReport = reportsMod.calculateClassReportCore(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(classReport.classId, "c1");
  assert.equal(classReport.totalSessions, 1);
  assert.equal(classReport.typeAverages["Ödev"].score, 100);

  const weeklySummaries = reportsMod.calculateWeeklyClassSummaries(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(weeklySummaries.length, 1);
});
