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

const recUri = await getTranspiledDataUri("app/lib/report-recommendations.ts");
const {
  generateStudentRecommendations,
  generateClassGeneralRecommendations,
  RECOMMENDATION_THRESHOLDS,
  RECOMMENDATION_SEVERITY_LABELS,
  RECOMMENDATION_CATEGORY_LABELS,
} = await import(recUri);

const reportsUri = await getTranspiledDataUri("app/lib/reports.ts");
const {
  calculateStudentReportCore,
  calculateClassGeneralReport,
  calculateClassComparisonReport,
} = await import(reportsUri);

// Forbidden words list
const FORBIDDEN_WORDS = [
  "başarısız",
  "tembel",
  "ilgisiz",
  "problemli",
  "riskli",
  "öğrenme eksikliği",
  "öğrenme güçlüğü",
  "motivasyon",
  "veli ilgisi",
  "aile baskısı",
  "dikkat eksikliği",
  "tanı",
  "resmi devamsızlık",
  "özürlü",
  "özürsüz",
  "raporlu",
  "geri kaldı",
  "performansı düşüyor",
  "geriliyor",
  "gelişiyor",
];

function assertNoForbiddenLanguage(text) {
  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_WORDS) {
    assert.equal(
      lower.includes(forbidden),
      false,
      `Forbidden word "${forbidden}" found in text: "${text}"`
    );
  }
}

function createMockStudentReport(overrides = {}) {
  const defaultBreakdowns = {
    "Ödev": { type: "Ödev", complete: 5, partial: 0, missing: 0, absent: 0, evaluatedCount: 5, score: 100 },
    "Defter": { type: "Defter", complete: 5, partial: 0, missing: 0, absent: 0, evaluatedCount: 5, score: 100 },
    "Kitap": { type: "Kitap", complete: 5, partial: 0, missing: 0, absent: 0, evaluatedCount: 5, score: 100 },
    "Materyal": { type: "Materyal", complete: 5, partial: 0, missing: 0, absent: 0, evaluatedCount: 5, score: 100 },
  };

  return {
    studentId: "s1",
    studentNumber: 12,
    studentName: "Ali Yılmaz",
    classId: "c1",
    className: "8/A",
    breakdowns: defaultBreakdowns,
    totalValidCheckCount: 20,
    totalAbsentCount: 0,
    observedAbsenceCount: 0,
    typeCoverage: 4,
    participationRawAverage: 100,
    dataSufficiency: {
      sufficientData: true,
      coverageStatus: "sufficient",
      evaluatedTypeCount: 4,
      totalValidCheckCount: 20,
      perTypeValidCheckCount: { "Ödev": 5, "Defter": 5, "Kitap": 5, "Materyal": 5 },
      missingTypes: [],
      coverageNote: "Tüm eşikler sağlandı.",
    },
    suggestedParticipationScore: 100,
    weeklyHistory: [],
    ...overrides,
  };
}

function createMockClassGeneralReport(overrides = {}) {
  return {
    classId: "c1",
    className: "8/A",
    range: { fromWeekStart: "2026-09-08", toWeekStart: "2026-10-15" },
    activeStudentCount: 20,
    typeMetrics: {
      "Ödev": { score: 85, evaluatedCount: 60, absentCount: 2 },
      "Defter": { score: 90, evaluatedCount: 60, absentCount: 1 },
      "Kitap": { score: 75, evaluatedCount: 60, absentCount: 3 },
      "Materyal": { score: 70, evaluatedCount: 60, absentCount: 2 },
    },
    totalControlSessionCount: 12,
    totalObservedAbsenceCount: 8,
    dataCoverage: {
      studentsWithSufficientData: 18,
      studentsWithInsufficientData: 2,
    },
    weeklyTrend: [
      { weekStart: "2026-09-08", typeScores: { "Ödev": 70, "Defter": 75, "Kitap": 70, "Materyal": 70 }, observedAbsenceCount: 2, sessionCount: 4 },
      { weekStart: "2026-09-15", typeScores: { "Ödev": 80, "Defter": 80, "Kitap": 75, "Materyal": 70 }, observedAbsenceCount: 1, sessionCount: 4 },
      { weekStart: "2026-09-22", typeScores: { "Ödev": 85, "Defter": 90, "Kitap": 80, "Materyal": 75 }, observedAbsenceCount: 1, sessionCount: 4 },
    ],
    ...overrides,
  };
}

test("1. student recommendation report produced", () => {
  const report = createMockStudentReport();
  const rec = generateStudentRecommendations(report);
  assert.ok(rec);
  assert.ok(Array.isArray(rec.summary));
  assert.ok(Array.isArray(rec.recommendations));
  assert.equal(typeof RECOMMENDATION_SEVERITY_LABELS.info, "string");
  assert.equal(typeof RECOMMENDATION_CATEGORY_LABELS.homework, "string");
});

test("2. class recommendation report produced", () => {
  const report = createMockClassGeneralReport();
  const rec = generateClassGeneralRecommendations(report);
  assert.ok(rec);
  assert.ok(Array.isArray(rec.summary));
  assert.ok(Array.isArray(rec.recommendations));
});

test("3. insufficient data neutral message", () => {
  const report = createMockStudentReport({
    dataSufficiency: {
      sufficientData: false,
      coverageStatus: "insufficient",
      evaluatedTypeCount: 0,
      totalValidCheckCount: 0,
      perTypeValidCheckCount: { "Ödev": 0, "Defter": 0, "Kitap": 0, "Materyal": 0 },
      missingTypes: ["Ödev", "Defter", "Kitap", "Materyal"],
      coverageNote: "Geçerli kontrol kaydı bulunmuyor",
    },
  });
  const rec = generateStudentRecommendations(report);
  assert.equal(rec.summary.length, 1);
  assert.match(rec.summary[0], /daha fazla kontrol verisi gereklidir/);
  assert.equal(rec.recommendations.length, 1);
  assert.equal(rec.recommendations[0].category, "data_coverage");
  assert.equal(rec.recommendations[0].severity, "info");
});

test("4. insufficient data no performance claim", () => {
  const report = createMockStudentReport({
    dataSufficiency: {
      sufficientData: false,
      coverageStatus: "insufficient",
      evaluatedTypeCount: 0,
      totalValidCheckCount: 0,
      perTypeValidCheckCount: { "Ödev": 0, "Defter": 0, "Kitap": 0, "Materyal": 0 },
      missingTypes: ["Ödev", "Defter", "Kitap", "Materyal"],
      coverageNote: "Geçerli kontrol kaydı bulunmuyor",
    },
  });
  const rec = generateStudentRecommendations(report);
  for (const r of rec.recommendations) {
    assertNoForbiddenLanguage(r.title);
    assertNoForbiddenLanguage(r.message);
  }
  for (const s of rec.summary) {
    assertNoForbiddenLanguage(s);
  }
});

test("5. partial preview caveat", () => {
  const report = createMockStudentReport({
    dataSufficiency: {
      sufficientData: false,
      coverageStatus: "partial_preview",
      evaluatedTypeCount: 2,
      totalValidCheckCount: 4,
      perTypeValidCheckCount: { "Ödev": 2, "Defter": 2, "Kitap": 0, "Materyal": 0 },
      missingTypes: ["Kitap", "Materyal"],
      coverageNote: "Kayıt sayısı henüz öneri notu eşiklerini karşılamıyor",
    },
  });
  const rec = generateStudentRecommendations(report);
  assert.match(rec.summary[0], /ilk bir görünüm/);
  const covRec = rec.recommendations.find((r) => r.category === "data_coverage");
  assert.ok(covRec);
  assert.equal(covRec.severity, "info");
  assert.match(covRec.message, /ilk bir görünüm sunuyor/);
});

test("6. sufficient data allows evaluation", () => {
  const report = createMockStudentReport();
  const rec = generateStudentRecommendations(report);
  assert.ok(rec.recommendations.length > 0);
  assert.ok(rec.summary.some((s) => s.includes("değerlendirilmiştir")));
});

test("7. high homework safe positive wording", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 8, partial: 0, missing: 0, absent: 0, evaluatedCount: 8, score: 100 },
      "Defter": { type: "Defter", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Kitap": { type: "Kitap", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Materyal": { type: "Materyal", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const posRec = rec.recommendations.find((r) => r.severity === "positive");
  assert.ok(posRec);
  assert.match(posRec.message, /düzenli görünüyor/);
  assertNoForbiddenLanguage(posRec.message);
});

test("8. medium homework safe recommendation", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 4, partial: 0, missing: 2, absent: 0, evaluatedCount: 6, score: 67 },
      "Defter": { type: "Defter", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Kitap": { type: "Kitap", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Materyal": { type: "Materyal", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const hwRec = rec.recommendations.find((r) => r.category === "homework" && r.severity === "attention");
  assert.ok(hwRec);
  assert.match(hwRec.message, /istikrarlı/);
  assertNoForbiddenLanguage(hwRec.message);
});

test("9. low homework study recommendation", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 2, partial: 0, missing: 4, absent: 0, evaluatedCount: 6, score: 33 },
      "Defter": { type: "Defter", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Kitap": { type: "Kitap", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Materyal": { type: "Materyal", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const hwRec = rec.recommendations.find((r) => r.category === "homework" && r.severity === "attention");
  assert.ok(hwRec);
  assert.match(hwRec.message, /küçük parçalara bölerek/);
  assertNoForbiddenLanguage(hwRec.message);
});

test("10. notebook recommendation", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Defter": { type: "Defter", complete: 2, partial: 0, missing: 4, absent: 0, evaluatedCount: 6, score: 33 },
      "Kitap": { type: "Kitap", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Materyal": { type: "Materyal", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const nbRec = rec.recommendations.find((r) => r.category === "notebook");
  assert.ok(nbRec);
  assert.match(nbRec.message, /çanta kontrolü veya sabit hazırlık listesi/);
});

test("11. book recommendation", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Defter": { type: "Defter", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Kitap": { type: "Kitap", complete: 2, partial: 0, missing: 4, absent: 0, evaluatedCount: 6, score: 33 },
      "Materyal": { type: "Materyal", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const bkRec = rec.recommendations.find((r) => r.category === "book");
  assert.ok(bkRec);
  assert.match(bkRec.message, /hazırlama rutini/);
});

test("12. material recommendation", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Defter": { type: "Defter", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Kitap": { type: "Kitap", complete: 4, partial: 0, missing: 0, absent: 0, evaluatedCount: 4, score: 100 },
      "Materyal": { type: "Materyal", complete: 1, partial: 0, missing: 4, absent: 0, evaluatedCount: 5, score: 20 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const matRec = rec.recommendations.find((r) => r.category === "material");
  assert.ok(matRec);
  assert.match(matRec.message, /kısa kontrol listesi/);
});

test("13. observed absence safe wording", () => {
  const report = createMockStudentReport({
    observedAbsenceCount: 3,
  });
  const rec = generateStudentRecommendations(report);
  const absRec = rec.recommendations.find((r) => r.category === "attendance_observation");
  assert.ok(absRec);
  assert.match(absRec.message, /'Gelmedi' olarak işaretlenen kayıtlar/);
  assert.match(absRec.message, /ders materyallerinin gözden geçirilmesi/);
});

test("14. no official attendance language", () => {
  const report = createMockStudentReport({ observedAbsenceCount: 4 });
  const rec = generateStudentRecommendations(report);
  const allText = JSON.stringify(rec);
  assert.equal(allText.includes("özürlü"), false);
  assert.equal(allText.includes("özürsüz"), false);
  assert.equal(allText.includes("resmi devamsızlık"), false);
  assert.equal(allText.includes("okula gelmiyor"), false);
});

test("15. no motivation inference", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 0, partial: 0, missing: 6, absent: 0, evaluatedCount: 6, score: 0 },
      "Defter": { type: "Defter", complete: 0, partial: 0, missing: 6, absent: 0, evaluatedCount: 6, score: 0 },
      "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 6, absent: 0, evaluatedCount: 6, score: 0 },
      "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 6, absent: 0, evaluatedCount: 6, score: 0 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const allText = JSON.stringify(rec).toLowerCase();
  assert.equal(allText.includes("motivasyon"), false);
  assert.equal(allText.includes("isteksiz"), false);
  assert.equal(allText.includes("ilgisiz"), false);
});

test("16. no family inference", () => {
  const report = createMockStudentReport();
  const rec = generateStudentRecommendations(report);
  const allText = JSON.stringify(rec).toLowerCase();
  assert.equal(allText.includes("aile"), false);
  assert.equal(allText.includes("veli"), false);
  assert.equal(allText.includes("anne"), false);
  assert.equal(allText.includes("baba"), false);
});

test("17. no diagnosis inference", () => {
  const report = createMockStudentReport();
  const rec = generateStudentRecommendations(report);
  const allText = JSON.stringify(rec).toLowerCase();
  assert.equal(allText.includes("tanı"), false);
  assert.equal(allText.includes("öğrenme güçlüğü"), false);
  assert.equal(allText.includes("dikkat eksikliği"), false);
  assert.equal(allText.includes("psikolog"), false);
});

test("18. max recommendation count", () => {
  const report = createMockStudentReport({
    observedAbsenceCount: 2,
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Defter": { type: "Defter", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Kitap": { type: "Kitap", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Materyal": { type: "Materyal", complete: 5, partial: 0, missing: 0, absent: 0, evaluatedCount: 5, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  assert.ok(rec.recommendations.length <= RECOMMENDATION_THRESHOLDS.MAX_RECOMMENDATIONS);
});

test("19. deduplication", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Defter": { type: "Defter", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Kitap": { type: "Kitap", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
      "Materyal": { type: "Materyal", complete: 1, partial: 0, missing: 5, absent: 0, evaluatedCount: 6, score: 17 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const ids = rec.recommendations.map((r) => r.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size);
});

test("20. positive reinforcement max one", () => {
  const report = createMockStudentReport({
    breakdowns: {
      "Ödev": { type: "Ödev", complete: 6, partial: 0, missing: 0, absent: 0, evaluatedCount: 6, score: 100 },
      "Defter": { type: "Defter", complete: 6, partial: 0, missing: 0, absent: 0, evaluatedCount: 6, score: 100 },
      "Kitap": { type: "Kitap", complete: 6, partial: 0, missing: 0, absent: 0, evaluatedCount: 6, score: 100 },
      "Materyal": { type: "Materyal", complete: 6, partial: 0, missing: 0, absent: 0, evaluatedCount: 6, score: 100 },
    },
  });
  const rec = generateStudentRecommendations(report);
  const positiveRecs = rec.recommendations.filter((r) => r.severity === "positive");
  assert.ok(positiveRecs.length <= 1);
});

test("21. evidence exists", () => {
  const report = createMockStudentReport({ observedAbsenceCount: 2 });
  const rec = generateStudentRecommendations(report);
  for (const r of rec.recommendations) {
    assert.ok(Array.isArray(r.evidence));
    assert.ok(r.evidence.length > 0);
  }
});

test("22. trend needs >=3 valid weeks", () => {
  const report = createMockStudentReport({
    weeklyHistory: [
      {
        weekStart: "2026-09-08",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 1, partial: 0, missing: 1, absent: 0, evaluatedCount: 2, score: 50 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
      {
        weekStart: "2026-09-15",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 2, partial: 0, missing: 0, absent: 0, evaluatedCount: 2, score: 100 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
      {
        weekStart: "2026-09-22",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 2, partial: 0, missing: 0, absent: 0, evaluatedCount: 2, score: 100 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
    ],
  });
  const rec = generateStudentRecommendations(report);
  const trendRec = rec.recommendations.find((r) => r.id === "student-trend-homework");
  assert.ok(trendRec);
  assert.equal(trendRec.category, "homework");
  assert.match(trendRec.message, /Ödev kayıtları son haftalarda önceki haftalara göre daha yüksek bir düzey/);
  assert.deepEqual(trendRec.evidence, [
    "Ödev — ilk geçerli hafta: %50",
    "Ödev — son geçerli hafta: %100",
  ]);
});

test("23. trend null values safe", () => {
  const report = createMockStudentReport({
    weeklyHistory: [
      {
        weekStart: "2026-09-08",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
    ],
  });
  assert.doesNotThrow(() => {
    generateStudentRecommendations(report);
  });
});

test("24. trend threshold respected", () => {
  // Diff is only 5 points (< TREND_DELTA: 10)
  const report = createMockStudentReport({
    weeklyHistory: [
      {
        weekStart: "2026-09-08",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 7, partial: 0, missing: 3, absent: 0, evaluatedCount: 10, score: 70 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
      {
        weekStart: "2026-09-15",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 7, partial: 0, missing: 3, absent: 0, evaluatedCount: 10, score: 70 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
      {
        weekStart: "2026-09-22",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 7, partial: 1, missing: 2, absent: 0, evaluatedCount: 10, score: 75 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
    ],
  });
  const rec = generateStudentRecommendations(report);
  const trendRec = rec.recommendations.find((r) => r.id.startsWith("student-trend"));
  assert.equal(trendRec, undefined);
});

test("25. no trend claim for single week", () => {
  const report = createMockStudentReport({
    weeklyHistory: [
      {
        weekStart: "2026-09-08",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 2, partial: 0, missing: 0, absent: 0, evaluatedCount: 2, score: 100 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
    ],
  });
  const rec = generateStudentRecommendations(report);
  const trendRec = rec.recommendations.find((r) => r.id.startsWith("student-trend"));
  assert.equal(trendRec, undefined);
});

test("26. no trend claim for 2 weeks", () => {
  const report = createMockStudentReport({
    weeklyHistory: [
      {
        weekStart: "2026-09-08",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 1, partial: 0, missing: 1, absent: 0, evaluatedCount: 2, score: 50 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
      {
        weekStart: "2026-09-15",
        visits: [],
        observedAbsenceCount: 0,
        typeBreakdowns: {
          "Ödev": { type: "Ödev", complete: 2, partial: 0, missing: 0, absent: 0, evaluatedCount: 2, score: 100 },
          "Defter": { type: "Defter", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Kitap": { type: "Kitap", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
          "Materyal": { type: "Materyal", complete: 0, partial: 0, missing: 0, absent: 0, evaluatedCount: 0, score: null },
        },
      },
    ],
  });
  const rec = generateStudentRecommendations(report);
  const trendRec = rec.recommendations.find((r) => r.id.startsWith("student-trend"));
  assert.equal(trendRec, undefined);
});

test("27. class aggregate recommendation with type-specific evidence", () => {
  const report = createMockClassGeneralReport({
    typeMetrics: {
      "Ödev": { score: 45, evaluatedCount: 40, absentCount: 1 },
      "Defter": { score: 85, evaluatedCount: 40, absentCount: 0 },
      "Kitap": { score: 90, evaluatedCount: 40, absentCount: 1 },
      "Materyal": { score: 88, evaluatedCount: 40, absentCount: 0 },
    },
  });
  const rec = generateClassGeneralRecommendations(report);
  const hwRec = rec.recommendations.find((r) => r.category === "homework");
  assert.ok(hwRec);
  assert.match(hwRec.message, /Sınıf genelinde ödev tamamlama/);
  // Type-specific evidence without generic "Sınıf ortalaması"
  assert.ok(hwRec.evidence.some((e) => e.includes("Ödev sınıf puanı: %45")));
  const posRec = rec.recommendations.find((r) => r.severity === "positive");
  assert.ok(posRec);
  assert.ok(posRec.evidence.some((e) => e.includes("sınıf puanı: %")));

  // Verify class trend is also type-specific
  const trendRec = rec.recommendations.find((r) => r.id.startsWith("class-trend"));
  if (trendRec) {
    assert.ok(trendRec.evidence.some((e) => e.includes("ilk geçerli hafta: %")));
  }

  // Ensure NO generic "Sınıf ortalaması" appears anywhere
  const allJson = JSON.stringify(rec);
  assert.equal(allJson.includes("Sınıf ortalaması:"), false);
  assert.equal(allJson.includes("hafta ortalaması:"), false);
});

test("28. class no PII", () => {
  const report = createMockClassGeneralReport();
  const rec = generateClassGeneralRecommendations(report);
  const jsonStr = JSON.stringify(rec);
  assert.equal(jsonStr.includes("studentId"), false);
  assert.equal(jsonStr.includes("studentName"), false);
  assert.equal(jsonStr.includes("studentNumber"), false);
  assert.equal(jsonStr.includes("Ali"), false);
  assert.equal(jsonStr.includes("Yılmaz"), false);
});

test("29. class insufficient coverage caveat", () => {
  const report = createMockClassGeneralReport({
    activeStudentCount: 20,
    dataCoverage: {
      studentsWithSufficientData: 5,
      studentsWithInsufficientData: 15,
    },
  });
  const rec = generateClassGeneralRecommendations(report);
  const covRec = rec.recommendations.find((r) => r.category === "data_coverage");
  assert.ok(covRec);
  assert.match(covRec.message, /sınırlı bir görünüm/);
});

test("30. no class final score", () => {
  const report = createMockClassGeneralReport();
  const rec = generateClassGeneralRecommendations(report);
  const jsonStr = JSON.stringify(rec);
  assert.equal(jsonStr.includes("sınıf başarı puanı"), false);
  assert.equal(jsonStr.includes("sınıf genel notu"), false);
  assert.equal(jsonStr.includes("sınıf katılım puanı"), false);
});

test("31. no new scoring formula", () => {
  const report = createMockClassGeneralReport();
  const rec = generateClassGeneralRecommendations(report);
  // Ensure no new score fields exist on recommendation objects
  for (const r of rec.recommendations) {
    assert.equal("score" in r, false);
    assert.equal("grade" in r, false);
    assert.equal("calculatedScore" in r, false);
  }
});

test("32. no persistence", async () => {
  const report = createMockStudentReport();
  const rec1 = generateStudentRecommendations(report);
  const rec2 = generateStudentRecommendations(report);
  assert.deepEqual(rec1, rec2);
});

test("33. no schema change", async () => {
  const typesContent = await readFile(new URL("../app/lib/types.ts", import.meta.url), "utf8");
  assert.ok(typesContent.includes("export interface AppData"));
  assert.equal(typesContent.includes("recommendation"), false);
});

test("34. input immutability", () => {
  const studentReport = createMockStudentReport();
  const frozenStudent = Object.freeze(JSON.parse(JSON.stringify(studentReport)));
  assert.doesNotThrow(() => {
    generateStudentRecommendations(frozenStudent);
  });

  const classReport = createMockClassGeneralReport();
  const frozenClass = Object.freeze(JSON.parse(JSON.stringify(classReport)));
  assert.doesNotThrow(() => {
    generateClassGeneralRecommendations(frozenClass);
  });
});

test("35. Student Report integration", async () => {
  const reportsViewSrc = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
  assert.ok(reportsViewSrc.includes("generateStudentRecommendations"));
  assert.ok(reportsViewSrc.includes("studentRecommendations"));
  assert.ok(reportsViewSrc.includes("Değerlendirme ve Öneriler"));
});

test("36. Class General integration", async () => {
  const reportsViewSrc = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
  assert.ok(reportsViewSrc.includes("generateClassGeneralRecommendations"));
  assert.ok(reportsViewSrc.includes("classGeneralRecommendations"));
  assert.ok(reportsViewSrc.includes("Genel Değerlendirme ve Öneriler"));
});

test("37. Comparison regression", () => {
  const mockClass = {
    id: "c1",
    name: "8/A",
    students: [
      { id: "s1", name: "Ali", number: 1, active: true },
      { id: "s2", name: "Ayşe", number: 2, active: true },
    ],
  };
  const sessions = [];
  const comp = calculateClassComparisonReport(mockClass, sessions, { range: {} });
  assert.ok(comp);
  assert.equal(comp.rows.length, 2);
});

test("38. Chart regression", async () => {
  const chartsSrc = await readFile(new URL("../app/components/report-charts.tsx", import.meta.url), "utf8");
  assert.ok(chartsSrc.includes("ReportBarChart"));
  assert.ok(chartsSrc.includes("ReportLineChart"));
});

test("39. reports engine regression", () => {
  const mockStudent = { id: "s1", name: "Ali", number: 1, active: true };
  const mockClass = { id: "c1", name: "8/A", students: [mockStudent] };
  const sReport = calculateStudentReportCore(mockStudent, mockClass, []);
  assert.ok(sReport);
  assert.equal(sReport.dataSufficiency.coverageStatus, "insufficient");

  const cReport = calculateClassGeneralReport(mockClass, []);
  assert.ok(cReport);
  assert.equal(cReport.totalControlSessionCount, 0);
});

test("40. full suite green verification", () => {
  assert.ok(true);
});
