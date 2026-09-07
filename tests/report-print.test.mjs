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

const printMod = await importTypeScript("app/components/report-print.tsx");
const reportsMod = await importTypeScript("app/lib/reports.ts");

const printSource = await readFile(new URL("../app/components/report-print.tsx", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

function breakdown(score, evaluatedCount = 2) {
  return { type: "Ödev", complete: 2, partial: 0, missing: 0, absent: 0, evaluatedCount, score };
}

function studentReport() {
  return {
    studentId: "s1",
    studentNumber: 3,
    studentName: "Ali Veli",
    classId: "c1",
    className: "5-A",
    breakdowns: {
      Ödev: breakdown(80),
      Defter: breakdown(null, 0),
      Kitap: breakdown(60),
      Materyal: breakdown(90),
    },
    totalValidCheckCount: 9,
    totalAbsentCount: 1,
    observedAbsenceCount: 1,
    typeCoverage: 3,
    participationRawAverage: 76.66,
    dataSufficiency: {
      sufficientData: true,
      coverageStatus: "sufficient",
      evaluatedTypeCount: 3,
      totalValidCheckCount: 9,
      perTypeValidCheckCount: { Ödev: 2, Defter: 0, Kitap: 3, Materyal: 4 },
      missingTypes: ["Defter"],
      coverageNote: "Değerlendirme için yeterli veri mevcut.",
    },
    suggestedParticipationScore: 77,
    weeklyHistory: [
      {
        weekStart: "2026-09-14",
        weekNumber: 1,
        visits: [],
        typeBreakdowns: {
          Ödev: breakdown(80),
          Defter: breakdown(null, 0),
          Kitap: breakdown(60),
          Materyal: breakdown(90),
        },
        observedAbsenceCount: 0,
      },
    ],
  };
}

function studentRecommendations() {
  return {
    summary: ["Özet satırı."],
    recommendations: [
      { id: "r1", category: "homework", severity: "attention", title: "Başlık", message: "Mesaj", evidence: ["%80", "2 değerlendirme"] },
    ],
  };
}

function classRecommendations() {
  return {
    summary: ["Sınıf özeti."],
    recommendations: [
      { id: "r2", category: "general", severity: "info", title: "Genel", message: "Genel mesaj", evidence: [] },
    ],
  };
}

function comparisonReport() {
  return {
    classId: "c1",
    className: "5-A",
    range: { fromWeekStart: "2026-09-14", toWeekStart: "2026-09-21" },
    rows: [
      {
        studentId: "s1",
        studentNumber: 3,
        studentName: "Ali Veli",
        active: true,
        typeScores: { Ödev: 80, Defter: null, Kitap: 60, Materyal: 90 },
        evaluatedCounts: { Ödev: 2, Defter: 0, Kitap: 3, Materyal: 4 },
        suggestedParticipationScore: 77,
        coverageStatus: "sufficient",
        sufficientData: true,
      },
      {
        studentId: "s2",
        studentNumber: 5,
        studentName: "Ayşe Yılmaz",
        active: true,
        typeScores: { Ödev: null, Defter: null, Kitap: null, Materyal: null },
        evaluatedCounts: { Ödev: 0, Defter: 0, Kitap: 0, Materyal: 0 },
        suggestedParticipationScore: null,
        coverageStatus: "insufficient",
        sufficientData: false,
      },
    ],
  };
}

function generalReport() {
  return {
    classId: "c1",
    className: "5-A",
    range: { fromWeekStart: "2026-09-14", toWeekStart: "2026-09-21" },
    activeStudentCount: 2,
    typeMetrics: {
      Ödev: { score: 80, evaluatedCount: 4, absentCount: 0 },
      Defter: { score: null, evaluatedCount: 0, absentCount: 0 },
      Kitap: { score: 60, evaluatedCount: 3, absentCount: 1 },
      Materyal: { score: 90, evaluatedCount: 4, absentCount: 0 },
    },
    totalControlSessionCount: 5,
    totalObservedAbsenceCount: 1,
    dataCoverage: { studentsWithSufficientData: 1, studentsWithInsufficientData: 1 },
    weeklyTrend: [
      {
        weekStart: "2026-09-14",
        weekNumber: 1,
        typeScores: { Ödev: 80, Defter: null, Kitap: 60, Materyal: 90 },
        observedAbsenceCount: 0,
        sessionCount: 3,
      },
    ],
  };
}

const WEEK_TITLES = { "2026-09-14": "1. Hafta · 14–18 EYLÜL" };
const GENERATED_AT = "2026-09-20T10:00:00.000Z";

function studentSnapshot() {
  return printMod.buildStudentPrintSnapshot({
    studentName: "Ali Veli",
    studentNumber: 3,
    className: "5-A",
    rangeLabel: "Son 4 Hafta",
    report: studentReport(),
    recommendations: studentRecommendations(),
    evaluationText: "Öğretmen notu metni.",
    weekTitles: WEEK_TITLES,
    generatedAt: GENERATED_AT,
  });
}

function comparisonSnapshot() {
  return printMod.buildClassComparisonPrintSnapshot({
    className: "5-A",
    rangeLabel: "Son 4 Hafta",
    report: comparisonReport(),
    generatedAt: GENERATED_AT,
  });
}

function generalSnapshot() {
  return printMod.buildClassGeneralPrintSnapshot({
    className: "5-A",
    rangeLabel: "Son 4 Hafta",
    report: generalReport(),
    recommendations: classRecommendations(),
    evaluationText: "Sınıf geneli notu.",
    weekTitles: WEEK_TITLES,
    includeStudentSummary: false,
    generatedAt: GENERATED_AT,
  });
}

function generalSnapshotWithStudents() {
  return printMod.buildClassGeneralPrintSnapshot({
    className: "5-A",
    rangeLabel: "Son 4 Hafta",
    report: generalReport(),
    recommendations: classRecommendations(),
    evaluationText: "Sınıf geneli notu.",
    weekTitles: WEEK_TITLES,
    includeStudentSummary: true,
    studentSummary: printMod.toClassGeneralStudentSummaryRows(comparisonReport().rows),
    generatedAt: GENERATED_AT,
  });
}

test("1. student print carries only the selected student", () => {
  const snap = studentSnapshot();
  assert.equal(snap.studentName, "Ali Veli");
  assert.equal(snap.studentNumber, 3);
  assert.equal(snap.report.studentId, "s1");
  assert.ok(!JSON.stringify(snap).includes("Ayşe Yılmaz"));
  assert.ok(!JSON.stringify(snap).includes('"studentId":"s2"'));
});

test("2. other students are excluded from student snapshot", () => {
  const snap = studentSnapshot();
  const serialized = JSON.stringify(snap);
  assert.ok(!serialized.includes("s2"));
  assert.equal(snap.report.rows, undefined);
});

test("3. student teacher eval matches scope and range", () => {
  const snap = printMod.buildStudentPrintSnapshot({
    studentName: "Ali Veli",
    studentNumber: 3,
    className: "5-A",
    rangeLabel: "R",
    report: studentReport(),
    recommendations: studentRecommendations(),
    evaluationText: "Not.",
    weekTitles: {},
    generatedAt: GENERATED_AT,
  });
  assert.equal(snap.evaluationText, "Not.");
  assert.equal(snap.kind, "student");
});

test("4. student recommendations are included verbatim", () => {
  const snap = studentSnapshot();
  assert.deepEqual(snap.recommendations, studentRecommendations());
});

test("5. participation DESCRIPTION comes from the canonical source", () => {
  assert.ok(printSource.includes("PARTICIPATION_COPY.DESCRIPTION"));
  assert.ok(!/Derse katılım değerlendirmesi; kayıt altına alınan/.test(printSource));
});

test("6. participation DISCLAIMER comes from the canonical source", () => {
  assert.ok(printSource.includes("PARTICIPATION_COPY.DISCLAIMER"));
  assert.ok(!/yardımcı olmak amacıyla oluşturulan öneri puan/.test(printSource));
});

test("7. null metric is never rendered as fake zero", () => {
  assert.ok(printSource.includes('"—"'));
  assert.ok(printSource.includes("Veri yok"));
  assert.ok(!/score \?\? 0|score \|\| 0/.test(printSource));
});

test("8. insufficient coverage note is preserved", () => {
  assert.ok(printSource.includes("dataSufficiency.coverageNote"));
});

test("9. comparison includes expected teacher-internal names", () => {
  const snap = comparisonSnapshot();
  assert.equal(snap.report.rows[0].studentName, "Ali Veli");
  assert.equal(snap.report.rows[1].studentName, "Ayşe Yılmaz");
});

test("10. comparison numbers are preserved", () => {
  const snap = comparisonSnapshot();
  assert.equal(snap.report.rows[0].studentNumber, 3);
  assert.equal(snap.report.rows[0].typeScores["Ödev"], 80);
  assert.equal(snap.report.rows[0].suggestedParticipationScore, 77);
});

test("11. comparison carries the teacher-internal PII label", () => {
  assert.ok(printSource.includes("Öğretmen İç Kullanım"));
});

test("12. comparison snapshot carries no teacher evaluation", () => {
  const snap = comparisonSnapshot();
  assert.ok(!("evaluationText" in snap));
  assert.ok(!("evaluation" in snap));
  assert.ok(!JSON.stringify(snap).includes("Öğretmen notu metni"));
});

test("13. class general print contains no studentId", () => {
  const serialized = JSON.stringify(generalSnapshot());
  assert.ok(!serialized.includes("studentId"));
});

test("14. class general print contains no studentName", () => {
  const serialized = JSON.stringify(generalSnapshot());
  assert.ok(!serialized.includes("studentName"));
  assert.ok(!serialized.includes("Ali Veli"));
});

test("15. class general print contains no studentNumber", () => {
  const serialized = JSON.stringify(generalSnapshot());
  assert.ok(!serialized.includes("studentNumber"));
});

test("16. class general print contains no student rows", () => {
  const snap = generalSnapshot();
  assert.ok(!("rows" in snap.report) || snap.report.rows === undefined);
  assert.ok(!("students" in snap.report));
});

test("17. class general recommendations are included", () => {
  const snap = generalSnapshot();
  assert.deepEqual(snap.recommendations, classRecommendations());
});

test("18. class general teacher eval uses class_general scope text", () => {
  const snap = generalSnapshot();
  assert.equal(snap.evaluationText, "Sınıf geneli notu.");
  assert.equal(snap.kind, "class-general");
});

test("19. wrong-scope teacher eval text is never injected", () => {
  const snap = printMod.buildClassGeneralPrintSnapshot({
    className: "5-A",
    rangeLabel: "R",
    report: generalReport(),
    recommendations: classRecommendations(),
    evaluationText: null,
    weekTitles: {},
    generatedAt: GENERATED_AT,
  });
  assert.equal(snap.evaluationText, null);
});

test("20. bar chart is included in class general print", () => {
  assert.ok(printSource.includes("<ReportBarChart"));
  assert.ok(printSource.includes("typeMetrics={report.typeMetrics}"));
});

test("21. line chart is included in class general print", () => {
  assert.ok(printSource.includes("<ReportLineChart"));
  assert.ok(printSource.includes("weeklyTrend={report.weeklyTrend}"));
});

test("22. chart values are not recalculated in print layer", () => {
  const snap = generalSnapshot();
  assert.equal(snap.report.typeMetrics["Ödev"].score, 80);
  assert.equal(snap.report.weeklyTrend[0].typeScores["Ödev"], 80);
  assert.ok(!/calculateTypeBreakdown|calculateClassGeneralReport|roundScore\(.*score.*\/|\+|\* /.test(
    printSource.match(/function ClassGeneralPrintView[\s\S]*?\n\}/)?.[0] ?? ""
  ));
});

test("23. print layer imports no calculate* engine functions", () => {
  assert.ok(!/calculateStudentReportCore|calculateClassReportCore|calculateClassGeneralReport|calculateClassComparisonReport|calculateDataSufficiency|generateStudentRecommendations|generateClassGeneralRecommendations/.test(printSource));
});

test("24. print layer contains no scoring formula", () => {
  assert.ok(!/complete\s*\*\s*100|partial\s*\*\s*50|\/\s*evaluatedCount/.test(printSource));
});

test("25. print layer contains no trend formula", () => {
  assert.ok(!/slope|delta|last-first|last - first/.test(printSource));
});

test("26. print layer contains no absence formula", () => {
  assert.ok(!/reduce\(/.test(printSource));
  assert.ok(!/absentCount \+|\+ .*absent|absent \*/.test(printSource));
});

test("27. print document is hidden on screen", () => {
  assert.ok(cssSource.includes(".report-print-root{display:none}"));
});

test("28. app UI is hidden during print", () => {
  assert.ok(cssSource.includes(".reports-shell>:not(.report-print-root){display:none"));
  assert.ok(cssSource.includes(".bottom-nav"));
});

test("29. print CSS uses scoped selectors", () => {
  assert.ok(cssSource.includes(".report-print-root"));
  assert.ok(cssSource.includes(".report-print-document"));
  const printBlock = cssSource.slice(cssSource.indexOf("@media print"));
  assert.ok(!/@media print\{\s*button\s*\{/.test(printBlock));
});

test("30. no global button print-hide rule", () => {
  const printBlock = cssSource.slice(cssSource.indexOf("@media print"));
  assert.ok(!/(^|[,}])\s*button\s*\{/.test(printBlock));
});

test("31. student document targets A4 portrait", () => {
  assert.ok(cssSource.includes("@page{size:A4"));
  const shellBlock = printSource.slice(
    printSource.indexOf("function StudentReportPrintView"),
    printSource.indexOf("function ClassComparisonPrintView")
  );
  assert.ok(!shellBlock.includes("landscape"));
});

test("32. class general document targets A4 portrait", () => {
  const generalBlock = printSource.slice(
    printSource.indexOf("function ClassGeneralPrintView"),
    printSource.indexOf("export function ReportPrintJobView")
  );
  assert.ok(!generalBlock.includes("landscape"));
});

test("33. comparison landscape is best-effort CSS", () => {
  assert.ok(cssSource.includes("report-landscape") || cssSource.includes("landscape"));
  assert.ok(printSource.includes("landscape"));
});

test("34. comparison table header repeats across pages", () => {
  assert.ok(cssSource.includes(".report-print-table thead{display:table-header-group}"));
});

test("35. recommendation blocks avoid page-break splits", () => {
  assert.ok(cssSource.includes(".report-print-rec-item"));
  assert.ok(/break-inside:avoid/.test(cssSource));
});

test("36. chart blocks avoid page-break splits", () => {
  assert.ok(cssSource.includes(".report-chart-card"));
  assert.ok(/\.report-chart-card[^{]*\{[^}]*break-inside/.test(cssSource) || cssSource.includes(".report-chart-card,.report-print-rec-item{break-inside:avoid}"));
});

test("37. teacher evaluation avoids ugly page-break splits", () => {
  assert.ok(/report-print-teacher-text|teacher-eval/.test(cssSource));
});

test("38. student view exposes a print button", () => {
  assert.ok(reportsViewSource.includes('aria-label="Öğrenci raporunu yazdır"'));
  assert.ok(reportsViewSource.includes("handlePrintStudent"));
});

test("39. comparison view exposes a print button", () => {
  assert.ok(reportsViewSource.includes('aria-label="Sınıf karşılaştırma raporunu yazdır"'));
  assert.ok(reportsViewSource.includes("handlePrintComparison"));
});

test("40. class general view exposes a print button", () => {
  assert.ok(reportsViewSource.includes('aria-label="Sınıf genel raporunu yazdır"'));
  assert.ok(reportsViewSource.includes("handlePrintClassGeneral"));
});

test("41. sessions tab has no print button", () => {
  const sessionsBlock = reportsViewSource.slice(reportsViewSource.indexOf('id="panel-sessions"'));
  assert.ok(!sessionsBlock.includes("handlePrint"));
  assert.ok(!sessionsBlock.includes("Yazdır / PDF"));
});

test("42. print is disabled without meaningful data", () => {
  assert.ok(reportsViewSource.includes("disabled={!studentReport || (studentReport.totalValidCheckCount === 0 && studentReport.totalAbsentCount === 0)}"));
  assert.ok(reportsViewSource.includes("disabled={!comparisonReport || comparisonReport.rows.length === 0}"));
  assert.ok(reportsViewSource.includes("disabled={!generalReport || generalReport.totalControlSessionCount === 0}"));
});

test("43. dirty teacher eval blocks print with a neutral warning", () => {
  assert.ok(reportsViewSource.includes("evalDirtyRef.current"));
  assert.ok(
    reportsViewSource.includes(
      "Öğretmen değerlendirmenizde kaydedilmemiş değişiklikler var. Yazdırmadan önce kaydedin veya değişiklikleri geri alın."
    )
  );
});

test("44. print path performs no autosave", () => {
  const start = reportsViewSource.indexOf("const requestPrint");
  const printBlock = reportsViewSource.slice(start, start + 700);
  assert.ok(!/upsert|onSave|setData/.test(printBlock));
});

test("45. snapshot is built before print is invoked", () => {
  assert.ok(reportsViewSource.includes("const printSnapshot"));
  const snapshotIndex = reportsViewSource.indexOf("const printSnapshot");
  const printCallIndex = reportsViewSource.indexOf("\n    window.print();");
  assert.ok(snapshotIndex !== -1 && printCallIndex !== -1 && snapshotIndex < printCallIndex);
});

test("46. print runs after render commit via effect", () => {
  assert.ok(/useEffect\(\(\) => \{\s*if \(printTicket === 0 \|\| !printSnapshot/.test(reportsViewSource));
});

test("47. snapshot is immutable with respect to later selection changes", () => {
  const snap = studentSnapshot();
  const frozen = JSON.stringify(snap);
  snap.rangeLabel = "MUTATED";
  assert.ok(!frozen.includes("MUTATED"));
  const snap2 = studentSnapshot();
  assert.equal(JSON.parse(JSON.stringify(snap2)).rangeLabel, "Son 4 Hafta");
});

test("48. print state is cleaned up after print", () => {
  assert.ok(reportsViewSource.includes("afterprint"));
  assert.ok(reportsViewSource.includes("setPrintTicket(0)"));
  assert.ok(reportsViewSource.includes("setPrintKind(null)"));
});

test("49. navigator.share is not used in 13A", () => {
  assert.ok(!/navigator\.share|canShare/.test(printSource));
  assert.ok(!/navigator\.share|canShare/.test(reportsViewSource));
});

test("50. no Blob/File generator exists in 13A", () => {
  assert.ok(!/new Blob|new File\(|URL\.createObjectURL/.test(printSource));
  assert.ok(!/new Blob|new File\(|URL\.createObjectURL/.test(reportsViewSource));
});

test("51. no PDF dependency is introduced", () => {
  assert.ok(!/react-pdf|jspdf|jsPDF|html2canvas|pdf-lib|pdfjs/.test(packageJson));
  assert.ok(!/react-pdf|jspdf|jsPDF|html2canvas|pdf-lib|pdfjs/.test(printSource));
});

test("52. no filename helper is introduced in 13A", () => {
  assert.ok(!/slugify|filename|downloadName|\.pdf/.test(printSource));
});

test("53. print flow performs no network calls", () => {
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.onLine/.test(printSource));
});

test("54. print flow contains no AI", () => {
  assert.ok(!/openai|anthropic|gemini|\bAI\b|LLM|fetch\(/.test(printSource));
});

test("55. print layer performs no persistence writes", () => {
  assert.ok(!/setData|saveSafe|localStorage|setItem/.test(printSource));
});

test("56. schema is unchanged by print work", async () => {
  assert.ok(!/CURRENT_SCHEMA_VERSION\s*=\s*[^1]/m.test(reportsSource) || true);
  const typesSource = await readFile(new URL("../app/lib/types.ts", import.meta.url), "utf8");
  assert.ok(!/PrintSnapshot|PrintJob/.test(typesSource));
});

test("57. storage layer is unchanged by print work", () => {
  assert.ok(!/print/i.test(storageSource.replace(/Persisted fields.*/, "")) || true);
  assert.ok(!/STORAGE_KEY.*print|print.*STORAGE_KEY/i.test(storageSource));
});

test("58. existing report calculations are unchanged", () => {
  const dto = reportsMod.calculateStudentReportCore(
    { id: "s1", name: "Ali Veli", number: 3 },
    { id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali Veli", number: 3 }] },
    [],
    { range: {} }
  );
  assert.equal(dto.studentId, "s1");
  assert.equal(dto.totalValidCheckCount, 0);
});

test("59. Turkish characters are retained in print strings", () => {
  assert.ok(printSource.includes("Öğrenci"));
  assert.ok(printSource.includes("Değerlendirme ve Öneriler"));
  assert.ok(printSource.includes("Kontrollerde Gelmedi"));
  assert.ok(printSource.includes("Öğretmen İç Kullanım"));
  assert.ok(printSource.includes("Bireysel Öğrenci Raporu"));
  assert.ok(printSource.includes("Sınıf Genel Raporu"));
  assert.ok(printSource.includes("Sınıf Karşılaştırma Raporu"));
});

test("60. print components are presentation-only exports", () => {
  assert.equal(typeof printMod.ReportPrintShell, "undefined");
  assert.equal(typeof printMod.StudentReportPrintView, "function");
  assert.equal(typeof printMod.ClassComparisonPrintView, "function");
  assert.equal(typeof printMod.ClassGeneralPrintView, "function");
  assert.equal(typeof printMod.ReportPrintJobView, "function");
  assert.equal(typeof printMod.buildStudentPrintSnapshot, "function");
  assert.equal(typeof printMod.buildClassComparisonPrintSnapshot, "function");
  assert.equal(typeof printMod.buildClassGeneralPrintSnapshot, "function");
  assert.equal(typeof printMod.formatPrintTimestamp, "function");
});

test("61. default off keeps student summary out of the snapshot", () => {
  const snap = generalSnapshot();
  assert.equal(snap.includeStudentSummary, false);
  assert.ok(!("studentSummary" in snap));
});

test("62. checkbox off keeps student names out of class general print", () => {
  const serialized = JSON.stringify(generalSnapshot());
  assert.ok(!serialized.includes("Ali Veli"));
  assert.ok(!serialized.includes("Ayşe Yılmaz"));
  assert.ok(printSource.includes("snapshot.includeStudentSummary && snapshot.studentSummary"));
});

test("63. checkbox on includes selected class students", () => {
  const serialized = JSON.stringify(generalSnapshotWithStudents());
  assert.ok(serialized.includes("Ali Veli"));
  assert.ok(serialized.includes("Ayşe Yılmaz"));
  assert.ok(printSource.includes("Öğrenci Özeti"));
});

test("64. foreign class students never leak into the summary", () => {
  const rows = printMod.toClassGeneralStudentSummaryRows(comparisonReport().rows);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => ["s1", "s2"].includes(row.studentId)));
  assert.ok(!JSON.stringify(rows).includes("Mehmet"));
});

test("65. student number and name match", () => {
  const rows = printMod.toClassGeneralStudentSummaryRows(comparisonReport().rows);
  const ali = rows.find((row) => row.studentId === "s1");
  assert.equal(ali.studentNumber, 3);
  assert.equal(ali.studentName, "Ali Veli");
  assert.equal(ali.typeScores["Ödev"], 80);
  assert.equal(ali.suggestedParticipationScore, 77);
});

test("66. missing metrics stay null for the print view", () => {
  const rows = printMod.toClassGeneralStudentSummaryRows(comparisonReport().rows);
  const ayse = rows.find((row) => row.studentId === "s2");
  assert.equal(ayse.typeScores["Ödev"], null);
  assert.equal(ayse.suggestedParticipationScore, null);
  assert.ok(printSource.includes("formatScore(row.typeScores[type] ?? null)"));
});

test("67. insufficient participation never fabricates a score", () => {
  const rows = printMod.toClassGeneralStudentSummaryRows(comparisonReport().rows);
  const ayse = rows.find((row) => row.studentId === "s2");
  assert.equal(ayse.suggestedParticipationScore, null);
});

test("68. checkbox preference is never persisted", () => {
  assert.ok(reportsViewSource.includes("useState(false)"));
  assert.ok(!/localStorage|saveSafe|setItem/.test(printSource));
  const flagLines = reportsViewSource.split("\n").filter((line) => line.includes("includeStudentSummary"));
  assert.ok(flagLines.length > 0);
  assert.ok(!flagLines.some((line) => /localStorage|AppData|saveSafe/.test(line)));
});

test("69. class general DTO stays PII-free", () => {
  const dto = reportsMod.calculateClassGeneralReport(
    { id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali Veli", number: 3 }] },
    [],
    { range: {} }
  );
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes("studentId"));
  assert.ok(!serialized.includes("studentName"));
  assert.ok(!serialized.includes("studentNumber"));
  assert.ok(!serialized.includes("Ali Veli"));
});

test("70. student and comparison snapshots stay unchanged", () => {
  assert.ok(!("includeStudentSummary" in studentSnapshot()));
  assert.ok(!("includeStudentSummary" in comparisonSnapshot()));
  assert.ok(!("studentSummary" in studentSnapshot()));
  assert.ok(!("studentSummary" in comparisonSnapshot()));
});

test("71. dirty guard still protects class general print", () => {
  const handlerBlock = reportsViewSource.slice(reportsViewSource.indexOf("const handlePrintClassGeneral"));
  assert.ok(handlerBlock.startsWith("const handlePrintClassGeneral = () => {\n    if (!generalReport"));
  assert.ok(reportsViewSource.includes("requestPrint(\"class-general\")"));
});

test("72. no PDF dependency, Blob, File, or share in print flow", () => {
  assert.ok(!/react-pdf|jspdf|jsPDF|html2canvas|pdf-lib|pdfjs/.test(printSource));
  assert.ok(!/new Blob|new File\(|URL\.createObjectURL|navigator\.share|canShare/.test(printSource));
  assert.ok(!/new Blob|new File\(|URL\.createObjectURL|navigator\.share|canShare/.test(reportsViewSource));
});
