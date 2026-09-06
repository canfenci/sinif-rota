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
const academicYearMod = await importTypeScript("app/lib/academic-year.ts");

const demoCalendar = academicYearMod.getOfficialWorkCalendar("2026-2027");

// Kaynak dosyaları metin doğrulaması için oku
const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// Mock Sınıf ve Öğrenciler
function createMockClass(id = "c1", name = "8-A", studentCount = 4) {
  const students = [];
  for (let i = 1; i <= studentCount; i++) {
    students.push({
      id: `s${i}`,
      number: 100 + i,
      name: `Öğrenci ${i}`,
      classId: id,
      active: true,
    });
  }
  return {
    id,
    name,
    grade: 8,
    branch: "A",
    students,
  };
}

// 1. Sınıf seçildiğinde header bilgileri doğru
test("1. Sınıf seçildiğinde header sınıf adı ve aktif öğrenci sayısını doğru gösterir", () => {
  const mockClass = createMockClass("c1", "8-A", 18);
  const report = reportsMod.calculateClassReportCore(mockClass, []);
  assert.equal(report.className, "8-A");
  assert.equal(report.activeStudents, 18);
  assert.equal(report.totalStudents, 18);
});

// 2. Seçili aralık bilgisi header'da görünür
test("2. Seçili aralık bilgisi ReportsView bileşeninde rangeDisplayLabel olarak üretilir", () => {
  assert.equal(typeof reportsViewMod.ReportsView, "function");
  assert.match(reportsViewSource, /rangeDisplayLabel/);
  assert.match(reportsViewSource, /reports-range-tag/);
});

// 3. 4 metrik kartı doğru etiketlerle render edilir
test("3. 4 ana metrik kartı Ödev Yapma, Defter Getirme, Kitap Getirme, Materyal Getirme etiketleriyle tanımlıdır", () => {
  assert.match(reportsViewSource, /type === "Ödev" \? "Ödev Yapma" : `\$\{type\} Getirme`/);
  assert.match(reportsViewSource, /ALL_CHECK_TYPES\.map/);
});

// 4. Puan olan türde yüzde ve değerlendirme sayısı gösterilir
test("4. Puan olan türde yüzde ve değerlendirme sayısı doğru hesaplanır", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const sessions = [
    {
      id: "sess1",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Ödev",
      statuses: { s1: "complete", s2: "partial" },
    },
  ];
  const report = reportsMod.calculateClassReportCore(mockClass, sessions);
  assert.equal(report.typeAverages["Ödev"].evaluatedCount, 2);
  // (100 + 50) / 2 = 75
  assert.equal(report.typeAverages["Ödev"].score, 75);
});

// 5. Veri olmayan türde "—" görünür, 0% GÖRÜNMEZ
test("5. Veri olmayan kontrol türünde score null olur ve UI '—' gösterir (fake 0% yok)", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const report = reportsMod.calculateClassReportCore(mockClass, []);
  assert.equal(report.typeAverages["Ödev"].score, null);
  assert.equal(report.typeAverages["Ödev"].evaluatedCount, 0);
  assert.match(reportsViewSource, /score !== null \? `%\$\{score\}` : "—"/);
});

// 6. Kontrollerde Gelmedi kartı doğru sayı gösterir
test("6. Kontrollerde Gelmedi kartı doğru 'X kayıt' sayısı gösterir", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const sessions = [
    {
      id: "sess1",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Ödev",
      statuses: { s1: "absent", s2: "complete" },
    },
  ];
  const report = reportsMod.calculateClassReportCore(mockClass, sessions);
  assert.equal(report.typeAverages["Ödev"].absent, 1);
  assert.match(reportsViewSource, /KONTROLLERDE GELMEDİ/);
  assert.match(reportsViewSource, /kayıt/);
});

// 7. Kontrollerde Gelmedi kartında resmi devamsızlık terimi KULLANILMAZ
test("7. Kontrollerde Gelmedi kartında resmi Devamsızlık veya Yoklama terimi KESİNLİKLE yer almaz", () => {
  assert.doesNotMatch(reportsViewSource, /Resmi Devamsızlık/i);
  assert.doesNotMatch(reportsViewSource, /Okul Devamsızlığı/i);
  assert.match(reportsViewSource, /Yalnız ders içi kontrollerde/);
});

// 8. Veri yeterliliği özeti doğru sayıları gösterir
test("8. Veri yeterliliği özeti studentsWithSufficientData ve studentsWithInsufficientData sayılarını sunar", () => {
  const mockClass = createMockClass("c1", "8-A", 3);
  const report = reportsMod.calculateClassReportCore(mockClass, []);
  assert.equal(report.studentsWithSufficientData, 0);
  assert.equal(report.studentsWithInsufficientData, 3);
  assert.match(reportsViewSource, /DERSE KATILIM VERİ YETERLİLİĞİ/);
  assert.match(reportsViewSource, /yeterli veri/);
  assert.match(reportsViewSource, /yetersiz veri/);
});

// 9. Veri yeterliliği özetinde öğrenci ismi GEÇMEZ
test("9. Veri yeterliliği kartında bireysel öğrenci adları yer almaz (toplu sayı özeti)", () => {
  const sufficiencySection = reportsViewSource.slice(
    reportsViewSource.indexOf("sufficiency-card"),
    reportsViewSource.indexOf("reports-weekly-section")
  );
  assert.doesNotMatch(sufficiencySection, /student\.name/);
  assert.doesNotMatch(sufficiencySection, /studentName/);
});

// 10. Haftalık özet listesi kronolojik sıralıdır
test("10. Haftalık özet listesi weekStart değerine göre kronolojik sıralanır", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const sessions = [
    {
      id: "s2",
      classId: "c1",
      date: "2026-09-28",
      weekStart: "2026-09-28",
      type: "Ödev",
      statuses: { s1: "complete" },
    },
    {
      id: "s1",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Defter",
      statuses: { s1: "complete" },
    },
  ];
  const report = reportsMod.calculateClassReportCore(mockClass, sessions);
  assert.equal(report.weeklySummaries.length, 2);
  assert.equal(report.weeklySummaries[0].weekStart, "2026-09-14");
  assert.equal(report.weeklySummaries[1].weekStart, "2026-09-28");
});

// 11. Haftalık özette 4 türün durumu görünür
test("11. Haftalık özette 4 kontrol türünün o haftaki puanları veya boş göstergeleri yer alır", () => {
  assert.match(reportsViewSource, /weekly-type-pill/);
  assert.match(reportsViewSource, /summary\.typeBreakdowns\[type\]/);
});

// 12. Haftalık özette giriş (visit) detayları görünür (e.g. 1. Giriş · Ödev, Defter)
test("12. Haftalık özette visitIndex gruplaması ve türler doğru gösterilir", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const sessions = [
    {
      id: "s1",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Ödev",
      visitIndex: 1,
      statuses: { s1: "complete" },
    },
    {
      id: "s2",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Defter",
      visitIndex: 1,
      statuses: { s1: "complete" },
    },
    {
      id: "s3",
      classId: "c1",
      date: "2026-09-15",
      weekStart: "2026-09-14",
      type: "Kitap",
      visitIndex: 2,
      statuses: { s1: "complete" },
    },
  ];
  const report = reportsMod.calculateClassReportCore(mockClass, sessions);
  const w1 = report.weeklySummaries[0];
  assert.equal(w1.visitSummaries.length, 2);
  assert.equal(w1.visitSummaries[0].visitIndex, 1);
  assert.deepEqual(w1.visitSummaries[0].sessionTypes, ["Ödev", "Defter"]);
  assert.equal(w1.visitSummaries[1].visitIndex, 2);
  assert.deepEqual(w1.visitSummaries[1].sessionTypes, ["Kitap"]);
});

// 13. Eski kayıtlar (visitIndex olmayan) için "Eski kayıtlar: giriş bilgisi yok" görünür
test("13. Eski kayıtlarda visitIndex yoksa 'Eski kayıtlar: giriş bilgisi yok' ifadesi üretilir", () => {
  const mockClass = createMockClass("c1", "8-A", 2);
  const sessions = [
    {
      id: "s1",
      classId: "c1",
      date: "2026-09-14",
      weekStart: "2026-09-14",
      type: "Ödev",
      statuses: { s1: "complete" },
    },
  ];
  const report = reportsMod.calculateClassReportCore(mockClass, sessions);
  const w1 = report.weeklySummaries[0];
  assert.equal(w1.hasLegacyVisits, true);
  assert.equal(w1.visitSummaries[0].visitIndex, undefined);
  assert.match(reportsViewSource, /Eski kayıtlar: giriş bilgisi yok/);
});

// 14. last_4_weeks ve diğer presetler için PlanWeek tabanlı ReportRange doğrulamaları
test("14-A. İlk plan haftasında last_4_weeks = yalnız ilk hafta (2026-09-14)", () => {
  const week1 = new Date("2026-09-16T10:00:00.000Z"); // 1. Hafta içi Çarşamba
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, week1);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.equal(range.toWeekStart, "2026-09-14");
});

test("14-B. İkinci plan haftasında last_4_weeks = 2 gerçek hafta (2026-09-14 - 2026-09-21)", () => {
  const week2 = new Date("2026-09-23T10:00:00.000Z"); // 2. Hafta içi Çarşamba
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, week2);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.equal(range.toWeekStart, "2026-09-21");
});

test("14-C. Üçüncü plan haftasında last_4_weeks = 3 gerçek hafta (2026-09-14 - 2026-09-28)", () => {
  const week3 = new Date("2026-09-30T10:00:00.000Z"); // 3. Hafta içi Çarşamba
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, week3);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.equal(range.toWeekStart, "2026-09-28");
});

test("14-D. Dördüncü plan haftasında last_4_weeks = 4 gerçek hafta (2026-09-14 - 2026-10-05)", () => {
  const week4 = new Date("2026-10-07T10:00:00.000Z"); // 4. Hafta içi Çarşamba
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, week4);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.equal(range.toWeekStart, "2026-10-05");
});

test("14-E. Beşinci haftada en eski hafta düşer, yine 4 hafta döner (2026-09-21 - 2026-10-12)", () => {
  const week5 = new Date("2026-10-14T10:00:00.000Z"); // 5. Hafta içi Çarşamba
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, week5);
  assert.equal(range.fromWeekStart, "2026-09-21");
  assert.equal(range.toWeekStart, "2026-10-12");
});

test("14-F. Takvim başlangıcından önce weekStart (2026-09-07) ASLA üretilmez", () => {
  const beforeStart = new Date("2026-09-02T10:00:00.000Z");
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, beforeStart);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.notEqual(range.fromWeekStart, "2026-09-07");
});

test("14-G. Ara tatil PlanWeek ise mevcut plan-week semantiği korunur", () => {
  // 2026-11-16 haftası 1. Dönem ara tatilidir. buildPlanWeeks içinde 10. haftadır.
  const breakWeek = new Date("2026-11-18T10:00:00.000Z");
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, breakWeek);
  assert.equal(range.toWeekStart, "2026-11-16");
  assert.equal(range.fromWeekStart, "2026-10-26"); // 4 hafta öncesi: 10-26, 11-02, 11-09, 11-16
});

test("14-H. term resolver akademik yıla özel literal event id'sine (2027-semester-break) bağlı değildir", () => {
  assert.doesNotMatch(reportsSource, /"2027-semester-break"/);
  assert.doesNotMatch(reportsViewSource, /"2027-semester-break"/);

  // Farklı bir akademik yıl mock'u ile test et: 2027-2028
  const futureCalendar = {
    schoolYear: "2027-2028",
    startDate: "2027-09-13",
    endDate: "2028-06-23",
    breaks: [
      { id: "custom-term-break-2028", title: "Yarıyıl Tatili", startDate: "2028-01-24", endDate: "2028-02-04" },
    ],
  };

  // 1. Dönem içi bir tarih
  const term1Date = new Date("2027-11-10T10:00:00.000Z");
  const term1Range = reportsMod.resolveReportRange("term", futureCalendar, term1Date);
  assert.equal(term1Range.fromWeekStart, "2027-09-13");
  assert.equal(term1Range.toWeekStart, "2028-01-17");

  // 2. Dönem içi bir tarih
  const term2Date = new Date("2028-03-15T10:00:00.000Z");
  const term2Range = reportsMod.resolveReportRange("term", futureCalendar, term2Date);
  assert.equal(term2Range.fromWeekStart, "2028-02-07");
  assert.equal(term2Range.toWeekStart, "2028-06-19");
});

test("14-I. year resolver tüm takvim haftalarını kapsar ve değişmez", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");
  const yearRange = reportsMod.resolveReportRange("year", demoCalendar, now);
  assert.equal(yearRange.fromWeekStart, "2026-09-14");
  assert.equal(yearRange.toWeekStart, "2027-06-21");
});

test("14-J. current_week resolver güncel haftayı tek hafta olarak döner ve değişmez", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");
  const currentWeek = reportsMod.resolveReportRange("current_week", demoCalendar, now);
  assert.equal(currentWeek.fromWeekStart, "2026-09-28");
  assert.equal(currentWeek.toWeekStart, "2026-09-28");
});

// 15. Seçili aralıkta oturum yoksa boş durum mesajı
test("15. Seçili dönemde hiç kontrol yoksa doğru bilgilendirici mesaj gösterilir", () => {
  assert.match(reportsViewSource, /Seçilen dönemde bu sınıf için henüz kontrol kaydı bulunmuyor\./);
  assert.match(reportsViewSource, /reports-empty-range/);
});

// 16. Hiç sınıf seçilmediğinde boş durum mesajı
test("16. Sınıf seçilmediğinde 'Raporu görüntülemek için bir sınıf seçin.' promptu gösterilir", () => {
  assert.match(reportsViewSource, /Raporu görüntülemek için bir sınıf seçin\./);
});

// 17. Sınıf düzeyinde tek bir katılım notu GÖSTERİLMEZ
test("17. Sınıf düzeyinde tek bir katılım notu hesaplanmaz ve gösterilmez", () => {
  const classPanelBody = reportsViewSource.slice(
    reportsViewSource.indexOf('activeTab === "classes"'),
    reportsViewSource.indexOf('activeTab === "students"')
  );
  assert.doesNotMatch(classPanelBody, /sınıf katılım notu/i);
  assert.doesNotMatch(classPanelBody, /genel katılım notu/i);
  assert.doesNotMatch(classPanelBody, /classParticipationScore/i);
});

// 18. Chart kütüphanesi KULLANILMAZ
test("18. Harici veya dahili chart kütüphanesi import edilmez (saf CSS döküm)", () => {
  assert.doesNotMatch(reportsViewSource, /chart\.js/i);
  assert.doesNotMatch(reportsViewSource, /recharts/i);
  assert.doesNotMatch(reportsViewSource, /victory/i);
});

// 19. PDF export KULLANILMAZ
test("19. Bu görevde PDF export butonu veya kütüphanesi yer almaz", () => {
  assert.doesNotMatch(reportsViewSource, /jspdf/i);
  assert.doesNotMatch(reportsViewSource, /pdf/i);
});

// 20. AI KULLANILMAZ
test("20. AI veya LLM kütüphanesi / servisi çağrılmaz", () => {
  assert.doesNotMatch(reportsViewSource, /gemini/i);
  assert.doesNotMatch(reportsViewSource, /openai/i);
  assert.doesNotMatch(reportsSource, /\bAI\b/);
  assert.doesNotMatch(reportsSource, /\bLLM\b/i);
});

// 21. Teacher notes KULLANILMAZ
test("21. Öğretmen yorumları veya notları sınıf raporuna dahil edilmez", () => {
  const classPanelBody = reportsViewSource.slice(
    reportsViewSource.indexOf('activeTab === "classes"'),
    reportsViewSource.indexOf('activeTab === "students"')
  );
  assert.doesNotMatch(classPanelBody, /teacherNote/i);
  assert.doesNotMatch(classPanelBody, /öğretmen yorumu/i);
});

// 22. Kural tabanlı öneriler KULLANILMAZ
test("22. Kural tabanlı rehberlik önerileri veya reçeteler gösterilmez", () => {
  const classPanelBody = reportsViewSource.slice(
    reportsViewSource.indexOf('activeTab === "classes"'),
    reportsViewSource.indexOf('activeTab === "students"')
  );
  assert.doesNotMatch(classPanelBody, /önerilen eylem/i);
  assert.doesNotMatch(classPanelBody, /tavsiye/i);
});

// 23. Metrik kartları button DEĞİLDİR (tıklanamaz)
test("23. Metrik kartları salt gösterim amaçlı div elemanlarıdır (tıklanabilir button değildir)", () => {
  assert.match(reportsViewSource, /<div key=\{type\} className="reports-metric-card">/);
  assert.doesNotMatch(reportsViewSource, /<button[^>]*className="reports-metric-card"/);
});

// 24. Erişilebilirlik: null puan kartlarında aria-label
test("24. Null skor durumunda aria-label 'Veri yok' metnini erişilebilir kılar", () => {
  assert.match(reportsViewSource, /aria-label=\{score !== null \? `\$\{title\}: %\$\{score\}` : `\$\{title\}: Veri yok`\}/);
});

// 25. Responsive grid: mobilde 2, desktop'ta 4 sütun
test("25. Metrik kartları responsive grid CSS ile mobilde 2, desktop'ta 4 sütun olarak biçimlendirilir", () => {
  assert.match(cssSource, /\.reports-metrics-grid\{display:grid;grid-template-columns:repeat\(2,1fr\);gap:12px;margin:18px 0\}/);
  assert.match(cssSource, /@media\(min-width:700px\)\{\.reports-metrics-grid\{grid-template-columns:repeat\(4,1fr\)\}\}/);
});
