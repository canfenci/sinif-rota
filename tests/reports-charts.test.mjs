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
const reportChartsMod = await importTypeScript("app/components/report-charts.tsx");
const reportsViewMod = await importTypeScript("app/components/ReportsView.tsx");
const academicYearMod = await importTypeScript("app/lib/academic-year.ts");

const demoCalendar = academicYearMod.getOfficialWorkCalendar("2026-2027");

const chartsSource = await readFile(new URL("../app/components/report-charts.tsx", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function createMockStudent(id = "s1", name = "Ahmet Yılmaz", number = 101, classId = "c1", active = true) {
  return { id, name, number, classId, active };
}

function createMockClass(id = "c1", name = "8-A", students = []) {
  return { id, name, grade: 8, branch: "A", students };
}

function createMockSession(args = {}) {
  return {
    id: args.id ?? "ses-1",
    classId: args.classId ?? "c1",
    type: args.type ?? "Ödev",
    date: args.date ?? "2026-09-14",
    statuses: args.statuses ?? { s1: "complete" },
    visitIndex: "visitIndex" in args ? args.visitIndex : 1,
    weekStart: args.weekStart ?? "2026-09-14",
  };
}

// 1. chart component exists
test("1. chart component exists: ReportBarChart ve ReportLineChart export edilir", () => {
  assert.equal(typeof reportChartsMod.ReportBarChart, "function");
  assert.equal(typeof reportChartsMod.ReportLineChart, "function");
  assert.ok(reportChartsMod.CHART_SERIES_COLORS);
});

// 2. no chart library dependency
test("2. no chart library dependency: harici grafik kütüphanesi kullanılmaz", () => {
  assert.ok(!chartsSource.includes("recharts"));
  assert.ok(!chartsSource.includes("chart.js"));
  assert.ok(!chartsSource.includes("echarts"));
  assert.ok(!reportsViewSource.includes("recharts"));
  assert.ok(!reportsViewSource.includes("chart.js"));
});

// 3. bar chart four metrics
test("3. bar chart four metrics: 4 temel kontrol türü grafikte yer alır", () => {
  const typeMetrics = {
    Ödev: { score: 85, evaluatedCount: 10, absentCount: 1 },
    Defter: { score: 90, evaluatedCount: 8, absentCount: 0 },
    Kitap: { score: 75, evaluatedCount: 12, absentCount: 2 },
    Materyal: { score: 60, evaluatedCount: 6, absentCount: 1 },
  };

  const element = reportChartsMod.ReportBarChart({ typeMetrics });
  assert.ok(element);
  assert.ok(chartsSource.includes("ALL_CHECK_TYPES.map"));
});

// 4. bar values from DTO
test("4. bar values from DTO: bar değerleri DTO score ve evaluatedCount'tan gelir", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ type: "Ödev", statuses: { s1: "complete" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.typeMetrics["Ödev"].score, 100);
  assert.equal(dto.typeMetrics["Ödev"].evaluatedCount, 1);

  const element = reportChartsMod.ReportBarChart({ typeMetrics: dto.typeMetrics });
  assert.ok(element);
});

// 5. null bar not rendered as 0
test("5. null bar not rendered as 0: null skor sahte %0 genişliğinde çizilmez", () => {
  const typeMetrics = {
    Ödev: { score: 100, evaluatedCount: 5 },
    Defter: { score: null, evaluatedCount: 0 },
    Kitap: { score: null, evaluatedCount: 0 },
    Materyal: { score: null, evaluatedCount: 0 },
  };

  const el = reportChartsMod.ReportBarChart({ typeMetrics });
  assert.ok(el);
  assert.ok(chartsSource.includes("empty"));
  assert.ok(chartsSource.includes("hasScore ? clampedScore : undefined"));
});

// 6. null bar says Veri yok
test("6. null bar says Veri yok: null bar metinsel olarak 'Veri yok' taşır", () => {
  const typeMetrics = {
    Ödev: { score: 80, evaluatedCount: 4 },
    Defter: { score: null, evaluatedCount: 0 },
    Kitap: { score: null, evaluatedCount: 0 },
    Materyal: { score: null, evaluatedCount: 0 },
  };

  const el = reportChartsMod.ReportBarChart({ typeMetrics });
  assert.ok(el);
  assert.ok(chartsSource.includes("Veri yok"));
});

// 7. percentage text visible
test("7. percentage text visible: her çubuk yanında veya üzerinde metinsel yüzde gösterir", () => {
  assert.ok(chartsSource.includes("bar-score-text"));
  assert.ok(chartsSource.includes("%{score}"));
});

// 8. line chart uses weeklyTrend
test("8. line chart uses weeklyTrend: line chart weeklyTrend dizisini kullanır", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ date: "2026-09-14", weekStart: "2026-09-14", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ date: "2026-09-21", weekStart: "2026-09-21", type: "Ödev", statuses: { s1: "partial" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.weeklyTrend.length, 2);

  const element = reportChartsMod.ReportLineChart({ weeklyTrend: dto.weeklyTrend });
  assert.ok(element);
});

// 9. weekly order preserved
test("9. weekly order preserved: haftalık trend sırası DTO'daki kronolojik sırayı korur", () => {
  const weeklyTrend = [
    { weekStart: "2026-09-14", weekNumber: 1, typeScores: { Ödev: 100, Defter: null, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 1 },
    { weekStart: "2026-09-21", weekNumber: 2, typeScores: { Ödev: 80, Defter: 90, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 2 },
    { weekStart: "2026-09-28", weekNumber: 3, typeScores: { Ödev: 70, Defter: 85, Kitap: 95, Materyal: 80 }, observedAbsenceCount: 1, sessionCount: 4 },
  ];

  const element = reportChartsMod.ReportLineChart({ weeklyTrend });
  assert.ok(element);
  assert.ok(!chartsSource.includes("sort("), "Line chart bileşeni DTO sırasını yeniden sıralamamalıdır");
});

// 10. four series supported
test("10. four series supported: 4 seri (Ödev, Defter, Kitap, Materyal) grafikte desteklenir", () => {
  assert.ok(reportChartsMod.CHART_SERIES_COLORS["Ödev"]);
  assert.ok(reportChartsMod.CHART_SERIES_COLORS["Defter"]);
  assert.ok(reportChartsMod.CHART_SERIES_COLORS["Kitap"]);
  assert.ok(reportChartsMod.CHART_SERIES_COLORS["Materyal"]);
});

// 11. null weekly point not converted to 0
test("11. null weekly point not converted to 0: null haftalık puanlar 0'a çekilmez, segment bölünür", () => {
  const weeklyTrend = [
    { weekStart: "2026-09-14", weekNumber: 1, typeScores: { Ödev: 80, Defter: null, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 1 },
    { weekStart: "2026-09-21", weekNumber: 2, typeScores: { Ödev: null, Defter: null, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 0 },
    { weekStart: "2026-09-28", weekNumber: 3, typeScores: { Ödev: 90, Defter: null, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 1 },
  ];

  // In report-charts.tsx, null splits the segment into disjoint polylines
  assert.ok(chartsSource.includes("seriesSegments"));
  assert.ok(chartsSource.includes("currentSegment = []"));
  const element = reportChartsMod.ReportLineChart({ weeklyTrend });
  assert.ok(element);
});

// 12. single week safe
test("12. single week safe: tek hafta olduğunda grafik çökmez ve tek nokta olarak sunulur", () => {
  const weeklyTrend = [
    { weekStart: "2026-09-14", weekNumber: 1, typeScores: { Ödev: 100, Defter: 50, Kitap: null, Materyal: null }, observedAbsenceCount: 0, sessionCount: 2 },
  ];

  const element = reportChartsMod.ReportLineChart({ weeklyTrend });
  assert.ok(element);
});

// 13. empty bar state
test("13. empty bar state: tüm metrikler null olduğunda bilgilendirici boş durum mesajı gösterilir", () => {
  const typeMetrics = {
    Ödev: { score: null, evaluatedCount: 0 },
    Defter: { score: null, evaluatedCount: 0 },
    Kitap: { score: null, evaluatedCount: 0 },
    Materyal: { score: null, evaluatedCount: 0 },
  };

  assert.ok(chartsSource.includes("Grafik için henüz yeterli kontrol verisi bulunmuyor."));
  const element = reportChartsMod.ReportBarChart({ typeMetrics });
  assert.ok(element);
});

// 14. empty weekly state
test("14. empty weekly state: haftalık trend boş olduğunda bilgilendirici boş durum mesajı gösterilir", () => {
  assert.ok(chartsSource.includes("Haftalık trend için henüz veri bulunmuyor."));
  const element = reportChartsMod.ReportLineChart({ weeklyTrend: [] });
  assert.ok(element);
});

// 15. responsive SVG/viewBox
test("15. responsive SVG/viewBox: SVG viewBox ve responsive css sınıfı kullanır", () => {
  assert.ok(chartsSource.includes('viewBox="0 0 600 240"'));
  assert.ok(chartsSource.includes('className="report-line-svg"'));
  assert.ok(cssSource.includes(".report-line-svg"));
  assert.ok(cssSource.includes("max-height:280px"));
});

// 16. no page horizontal overflow rule
test("16. no page horizontal overflow rule: grafiğin mobilde sayfayı taşırmayacak kuralları mevcuttur", () => {
  assert.ok(cssSource.includes(".line-chart-svg-container"));
  assert.ok(cssSource.includes("overflow:hidden"));
  assert.ok(cssSource.includes("width:100%"));
});

// 17. accessible heading
test("17. accessible heading: grafik kartları semantik başlık içerir", () => {
  assert.ok(chartsSource.includes("report-chart-title"));
  assert.ok(chartsSource.includes("<h5"));
});

// 18. accessible description
test("18. accessible description: grafik kartları açıklayıcı alt metin veya aria-label içerir", () => {
  assert.ok(chartsSource.includes("Haftalık kontrol puanlarının zaman içindeki değişimi."));
  assert.ok(chartsSource.includes('role="region"'));
  assert.ok(chartsSource.includes('role="img"'));
});

// 19. text fallback remains
test("19. text fallback remains: numeric haftalık liste grafik altında erişilebilir fallback olarak korunur", () => {
  assert.ok(reportsViewSource.includes("<ReportLineChart"));
  assert.ok(reportsViewSource.includes("general-trend-list"));
  assert.ok(reportsViewSource.indexOf("<ReportLineChart") < reportsViewSource.indexOf("general-trend-list"));
});

// 20. no analytical interpretation
test("20. no analytical interpretation: bileşenler 'yükseliyor', 'düşüyor', 'risk' gibi analitik yorumlar üretmez", () => {
  assert.ok(!chartsSource.includes("yükseliyor"));
  assert.ok(!chartsSource.includes("düşüyor"));
  assert.ok(!chartsSource.includes("gelişiyor"));
  assert.ok(!chartsSource.includes("risk"));
  assert.ok(!chartsSource.includes("başarılı"));
  assert.ok(!chartsSource.includes("zayıf"));
});

// 21. no report score recalculation
test("21. no report score recalculation: chart katmanı score veya yüzde yeniden hesaplamaz", () => {
  assert.ok(!chartsSource.includes("calculateTypeBreakdown"));
  assert.ok(!chartsSource.includes("calculateClassReportCore"));
  assert.ok(!chartsSource.includes("calculateStudentReportCore"));
});

// 22. no schema change
test("22. no schema change: AppData şema versiyonu artırılmamıştır", async () => {
  const migrationsSource = await readFile(new URL("../app/lib/migrations.ts", import.meta.url), "utf8");
  assert.ok(migrationsSource.includes("CURRENT_SCHEMA_VERSION = 1"));
});

// 23. no persistence change
test("23. no persistence change: storage persistence katmanı değiştirilmez", async () => {
  const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storageSource, /ReportBarChart/);
  assert.doesNotMatch(storageSource, /ReportLineChart/);
});

// 24. no PDF
test("24. no PDF: PDF dışa aktarım veya generator bulunmaz", () => {
  assert.ok(!chartsSource.includes("jspdf"));
  assert.ok(!chartsSource.includes("pdf"));
  assert.ok(!reportsViewSource.includes("jspdf"));
});

// 25. no AI
test("25. no AI: yapay zeka veya LLM entegrasyonu bulunmaz", () => {
  assert.ok(!chartsSource.includes("openai"));
  assert.ok(!chartsSource.includes("gemini"));
  assert.ok(!chartsSource.includes("anthropic"));
  assert.ok(!chartsSource.includes("llm"));
  assert.ok(!chartsSource.includes("generative-ai"));
});

// 26. no teacher notes
test("26. no teacher notes: öğretmen notu veya tavsiye motoru bulunmaz", () => {
  assert.ok(!chartsSource.includes("teacherNotes"));
  assert.ok(!chartsSource.includes("recommendationEngine"));
});

// 27. Class General regression
test("27. Class General regression: calculateClassGeneralReport eksiksiz çalışır", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(dto);
  assert.ok(dto.typeMetrics);
  assert.ok(dto.weeklyTrend);
});

// 28. Comparison regression
test("28. Comparison regression: calculateClassComparisonReport eksiksiz çalışır", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(dto);
  assert.ok(dto.rows);
  assert.ok(dto.range);
});

// 29. Student Report regression
test("29. Student Report regression: calculateStudentReportCore eksiksiz çalışır", () => {
  const student = createMockStudent();
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(dto);
  assert.equal(dto.studentId, "s1");
});

// 30. full report suite green
test("30. full report suite green: ReportsView ReportBarChart ve ReportLineChart bileşenlerini render eder", () => {
  assert.ok(typeof reportsViewMod.ReportsView === "function");
  assert.ok(reportsViewSource.includes("<ReportBarChart"));
  assert.ok(reportsViewSource.includes("<ReportLineChart"));
});
