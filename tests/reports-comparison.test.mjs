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

const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
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
  };
}

// 1. comparison DTO produced
test("1. comparison DTO produced: calculateClassComparisonReport geçerli bir ClassComparisonReportDTO üretir", () => {
  assert.ok(typeof reportsViewMod.ReportsView === "function");
  const student = createMockStudent("s1", "Ahmet Yılmaz", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.classId, "c1");
  assert.equal(dto.className, "8-A");
  assert.equal(dto.rows.length, 1);
  assert.equal(dto.rows[0].studentName, "Ahmet Yılmaz");
});

// 2. selected class isolation
test("2. selected class isolation: başka bir sınıfa ait oturumlar ve öğrenciler rapora sızmaz", () => {
  const student1 = createMockStudent("s1", "Ahmet", 101, "c1");
  const schoolClass = createMockClass("c1", "8-A", [student1]);
  const sessions = [
    createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", classId: "c2", type: "Ödev", statuses: { s1: "missing" } }), // Başka sınıf
  ];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows.length, 1);
  assert.equal(dto.rows[0].typeScores["Ödev"], 100);
});

// 3. selected range filtering
test("3. selected range filtering: yalnız seçili aralıktaki oturumlar hesaplamaya katılır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const now = new Date("2026-09-14T10:00:00Z");
  const range = reportsMod.resolveReportRange("current_week", demoCalendar, now);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-28", statuses: { s1: "missing" } }), // farklı hafta
  ];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { range, calendar: demoCalendar });
  assert.equal(dto.rows[0].typeScores["Ödev"], 100);
  assert.deepEqual(dto.range, range);
});

// 3b. comparison DTO range contract
test("3b. comparison DTO range contract: range her zaman mevcuttur, current_week, last_4_weeks, term ve year doğru aralık taşır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);

  // TypeScript seviyesinde range optional olmamalı
  const interfaceMatch = reportsSource.match(/interface\s+ClassComparisonReportDTO\s*\{[\s\S]*?\}/);
  assert.ok(interfaceMatch, "ClassComparisonReportDTO arayüzü tanımlı olmalı");
  assert.doesNotMatch(interfaceMatch[0], /range\?:/, "ClassComparisonReportDTO içinde range optional olmamalı");
  assert.match(interfaceMatch[0], /range:\s*ReportRange;/, "ClassComparisonReportDTO içinde range: ReportRange olmalı");

  // current_week
  const nowCurrent = new Date("2026-09-14T10:00:00Z");
  const currentRange = reportsMod.resolveReportRange("current_week", demoCalendar, nowCurrent);
  const dtoCurrent = reportsMod.calculateClassComparisonReport(schoolClass, [], { range: currentRange, calendar: demoCalendar });
  assert.ok(dtoCurrent.range, "current_week range tanımlı olmalı");
  assert.equal(dtoCurrent.range.fromWeekStart, "2026-09-14");
  assert.equal(dtoCurrent.range.toWeekStart, "2026-09-14");

  // last_4_weeks
  const now4w = new Date("2026-10-05T10:00:00Z");
  const last4Range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, now4w);
  const dtoLast4 = reportsMod.calculateClassComparisonReport(schoolClass, [], { range: last4Range, calendar: demoCalendar });
  assert.ok(dtoLast4.range, "last_4_weeks range tanımlı olmalı");
  assert.equal(dtoLast4.range.fromWeekStart, "2026-09-14");
  assert.equal(dtoLast4.range.toWeekStart, "2026-10-05");

  // term (1. dönem)
  const nowTerm = new Date("2026-10-05T10:00:00Z");
  const termRange = reportsMod.resolveReportRange("term", demoCalendar, nowTerm);
  const dtoTerm = reportsMod.calculateClassComparisonReport(schoolClass, [], { range: termRange, calendar: demoCalendar });
  assert.ok(dtoTerm.range, "term range tanımlı olmalı");
  assert.equal(dtoTerm.range.fromWeekStart, "2026-09-14");
  assert.equal(dtoTerm.range.toWeekStart, "2027-01-18");

  // year
  const nowYear = new Date("2026-10-05T10:00:00Z");
  const yearRange = reportsMod.resolveReportRange("year", demoCalendar, nowYear);
  const dtoYear = reportsMod.calculateClassComparisonReport(schoolClass, [], { range: yearRange, calendar: demoCalendar });
  assert.ok(dtoYear.range, "year range tanımlı olmalı");
  assert.equal(dtoYear.range.fromWeekStart, "2026-09-14");
  assert.equal(dtoYear.range.toWeekStart, "2027-06-21");

  // Parametre verilmediğinde bile range otomatik olarak current_week ile doldurulur
  const dtoDefault = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.ok(dtoDefault.range, "varsayılan range her zaman tanımlı olmalı");
  assert.equal(typeof dtoDefault.range.fromWeekStart, "string");
  assert.equal(typeof dtoDefault.range.toWeekStart, "string");
});

// 4. all students appear
test("4. all students appear: sınıftaki tüm öğrenciler tabloda yer alır", () => {
  const students = [
    createMockStudent("s1", "Ahmet", 101),
    createMockStudent("s2", "Mehmet", 102),
    createMockStudent("s3", "Ayşe", 103),
  ];
  const schoolClass = createMockClass("c1", "8-A", students);
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.rows.length, 3);
});

// 5. inactive student preserved
test("5. inactive student preserved: arşivlenmiş (inactive) öğrenci tabloda korunur", () => {
  const students = [
    createMockStudent("s1", "Ahmet", 101, "c1", true),
    createMockStudent("s2", "Eski Öğrenci", 102, "c1", false),
  ];
  const schoolClass = createMockClass("c1", "8-A", students);
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.rows.length, 2);
  const inactiveRow = dto.rows.find((r) => r.studentId === "s2");
  assert.ok(inactiveRow);
  assert.equal(inactiveRow.active, false);
});

// 6. default order student number ascending
test("6. default order student number ascending: varsayılan sıralama artan öğrenci numarasıdır", () => {
  const students = [
    createMockStudent("s3", "Can", 300),
    createMockStudent("s1", "Ali", 100),
    createMockStudent("s2", "Burak", 200),
  ];
  const schoolClass = createMockClass("c1", "8-A", students);
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.rows[0].studentNumber, 100);
  assert.equal(dto.rows[1].studentNumber, 200);
  assert.equal(dto.rows[2].studentNumber, 300);
});

// 7. same number fallback alphabetical
test("7. same number fallback alphabetical: eşit numaralarda isim alfabetik sıralanır", () => {
  const students = [
    createMockStudent("s2", "Zeynep", 100),
    createMockStudent("s1", "Ayşe", 100),
  ];
  const schoolClass = createMockClass("c1", "8-A", students);
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.rows[0].studentName, "Ayşe");
  assert.equal(dto.rows[1].studentName, "Zeynep");
});

// 8. four type scores correct
test("8. four type scores correct: 4 kontrol türünün puanları doğru hesaplanır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", type: "Defter", statuses: { s1: "partial" } }),
    createMockSession({ id: "ses-3", type: "Kitap", statuses: { s1: "missing" } }),
  ];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows[0].typeScores["Ödev"], 100);
  assert.equal(dto.rows[0].typeScores["Defter"], 50);
  assert.equal(dto.rows[0].typeScores["Kitap"], 0);
  assert.equal(dto.rows[0].typeScores["Materyal"], null);
});

// 9. null score remains null
test("9. null score remains null: kontrolü olmayan tür null kalır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.rows[0].typeScores["Ödev"], null);
  assert.equal(dto.rows[0].typeScores["Defter"], null);
  assert.equal(dto.rows[0].typeScores["Kitap"], null);
  assert.equal(dto.rows[0].typeScores["Materyal"], null);
});

// 10. absent excluded
test("10. absent excluded: Gelmedi işaretlenen kontroller skordan ve evaluatedCount paydasından hariç tutulur", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", type: "Ödev", statuses: { s1: "absent" } }),
  ];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows[0].typeScores["Ödev"], 100);
  assert.equal(dto.rows[0].evaluatedCounts["Ödev"], 1);
});

// 11. suggested score sufficient case
test("11. suggested score sufficient case: yeterli veride suggestedParticipationScore üretilir", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const weeks = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];
  const sessions = [];
  let id = 1;
  for (const w of weeks) {
    sessions.push(createMockSession({ id: `s-${id++}`, type: "Ödev", date: w, statuses: { s1: "complete" }, visitIndex: 1 }));
    sessions.push(createMockSession({ id: `s-${id++}`, type: "Defter", date: w, statuses: { s1: "complete" }, visitIndex: 2 }));
    sessions.push(createMockSession({ id: `s-${id++}`, type: "Kitap", date: w, statuses: { s1: "complete" }, visitIndex: 1 }));
    sessions.push(createMockSession({ id: `s-${id++}`, type: "Materyal", date: w, statuses: { s1: "complete" }, visitIndex: 2 }));
  }

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows[0].sufficientData, true);
  assert.equal(dto.rows[0].coverageStatus, "sufficient");
  assert.equal(dto.rows[0].suggestedParticipationScore, 100);
});

// 12. suggested score insufficient -> null
test("12. suggested score insufficient -> null: yetersiz veride suggestedParticipationScore null döner", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows[0].sufficientData, false);
  assert.equal(dto.rows[0].suggestedParticipationScore, null);
});

// 13. raw average not used as final
test("13. raw average not used as final: veri yetersizken ham ortalama nihai not olarak gösterilmez", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.rows[0].suggestedParticipationScore, null);
  // ReportsView'da raw average yerine suggestedParticipationScore kullanıldığı doğrulanır
  assert.match(reportsViewSource, /row\.suggestedParticipationScore !== null \? row\.suggestedParticipationScore : "—"/);
});

// 14. coverage sufficient label
test("14. coverage sufficient label: 'sufficient' durumu için etiket 'Yeterli' olmalıdır", () => {
  assert.equal(reportsMod.COVERAGE_STATUS_LABELS.sufficient, "Yeterli");
});

// 15. partial_preview label
test("15. partial_preview label: 'partial_preview' durumu için etiket 'Ön İzleme' olmalıdır", () => {
  assert.equal(reportsMod.COVERAGE_STATUS_LABELS.partial_preview, "Ön İzleme");
});

// 16. insufficient label
test("16. insufficient label: 'insufficient' durumu için etiket 'Yetersiz Veri' olmalıdır", () => {
  assert.equal(reportsMod.COVERAGE_STATUS_LABELS.insufficient, "Yetersiz Veri");
});

// 17. student name visible
test("17. student name visible: öğrenci adı tabloda açıkça gösterilir", () => {
  assert.match(reportsViewSource, /\{row\.studentName\}/);
});

// 18. student number visible
test("18. student number visible: öğrenci numarası tabloda gösterilir", () => {
  assert.match(reportsViewSource, /\{row\.studentNumber\}/);
});

// 19. sort by name asc/desc
test("19. sort by name asc/desc: isme göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "Zeynep", studentNumber: 1, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "Ali", studentNumber: 2, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
    { studentName: "Mehmet", studentNumber: 3, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s3" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "name", "asc");
  assert.equal(asc[0].studentName, "Ali");
  assert.equal(asc[2].studentName, "Zeynep");

  const desc = reportsMod.sortComparisonRows(rows, "name", "desc");
  assert.equal(desc[0].studentName, "Zeynep");
  assert.equal(desc[2].studentName, "Ali");
});

// 20. sort by number asc/desc
test("20. sort by number asc/desc: numaraya göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 30, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 10, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
    { studentName: "C", studentNumber: 20, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s3" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "number", "asc");
  assert.equal(asc[0].studentNumber, 10);
  assert.equal(asc[2].studentNumber, 30);

  const desc = reportsMod.sortComparisonRows(rows, "number", "desc");
  assert.equal(desc[0].studentNumber, 30);
  assert.equal(desc[2].studentNumber, 10);
});

// 21. sort by Ödev asc/desc
test("21. sort by Ödev asc/desc: Ödev puanına göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: { Ödev: 60 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: { Ödev: 90 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
    { studentName: "C", studentNumber: 3, typeScores: { Ödev: 40 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s3" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "Ödev", "asc");
  assert.equal(asc[0].typeScores["Ödev"], 40);
  assert.equal(asc[2].typeScores["Ödev"], 90);

  const desc = reportsMod.sortComparisonRows(rows, "Ödev", "desc");
  assert.equal(desc[0].typeScores["Ödev"], 90);
  assert.equal(desc[2].typeScores["Ödev"], 40);
});

// 22. sort by Defter asc/desc
test("22. sort by Defter asc/desc: Defter puanına göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: { Defter: 50 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: { Defter: 100 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "Defter", "asc");
  assert.equal(asc[0].typeScores["Defter"], 50);

  const desc = reportsMod.sortComparisonRows(rows, "Defter", "desc");
  assert.equal(desc[0].typeScores["Defter"], 100);
});

// 23. sort by Kitap asc/desc
test("23. sort by Kitap asc/desc: Kitap puanına göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: { Kitap: 70 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: { Kitap: 30 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "Kitap", "asc");
  assert.equal(asc[0].typeScores["Kitap"], 30);

  const desc = reportsMod.sortComparisonRows(rows, "Kitap", "desc");
  assert.equal(desc[0].typeScores["Kitap"], 70);
});

// 24. sort by Materyal asc/desc
test("24. sort by Materyal asc/desc: Materyal puanına göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: { Materyal: 20 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: { Materyal: 80 }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "Materyal", "asc");
  assert.equal(asc[0].typeScores["Materyal"], 20);

  const desc = reportsMod.sortComparisonRows(rows, "Materyal", "desc");
  assert.equal(desc[0].typeScores["Materyal"], 80);
});

// 25. sort by suggested score asc/desc
test("25. sort by suggested score asc/desc: Öneri notuna göre artan ve azalan sıralama doğru çalışır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: 85, coverageStatus: "sufficient", sufficientData: true, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: 95, coverageStatus: "sufficient", sufficientData: true, active: true, studentId: "s2" },
    { studentName: "C", studentNumber: 3, typeScores: {}, evaluatedCounts: {}, suggestedParticipationScore: 70, coverageStatus: "sufficient", sufficientData: true, active: true, studentId: "s3" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "suggestedScore", "asc");
  assert.equal(asc[0].suggestedParticipationScore, 70);
  assert.equal(asc[2].suggestedParticipationScore, 95);

  const desc = reportsMod.sortComparisonRows(rows, "suggestedScore", "desc");
  assert.equal(desc[0].suggestedParticipationScore, 95);
  assert.equal(desc[2].suggestedParticipationScore, 70);
});

// 26. null sorting always last
test("26. null sorting always last: null değerli satırlar hem asc hem desc sıralamada en altta kalır", () => {
  const rows = [
    { studentName: "A", studentNumber: 1, typeScores: { Ödev: 80 }, evaluatedCounts: {}, suggestedParticipationScore: 80, coverageStatus: "sufficient", sufficientData: true, active: true, studentId: "s1" },
    { studentName: "B", studentNumber: 2, typeScores: { Ödev: null }, evaluatedCounts: {}, suggestedParticipationScore: null, coverageStatus: "insufficient", sufficientData: false, active: true, studentId: "s2" },
    { studentName: "C", studentNumber: 3, typeScores: { Ödev: 90 }, evaluatedCounts: {}, suggestedParticipationScore: 90, coverageStatus: "sufficient", sufficientData: true, active: true, studentId: "s3" },
  ];

  const asc = reportsMod.sortComparisonRows(rows, "Ödev", "asc");
  assert.equal(asc[0].typeScores["Ödev"], 80);
  assert.equal(asc[1].typeScores["Ödev"], 90);
  assert.equal(asc[2].typeScores["Ödev"], null);

  const desc = reportsMod.sortComparisonRows(rows, "Ödev", "desc");
  assert.equal(desc[0].typeScores["Ödev"], 90);
  assert.equal(desc[1].typeScores["Ödev"], 80);
  assert.equal(desc[2].typeScores["Ödev"], null);

  const scoreDesc = reportsMod.sortComparisonRows(rows, "suggestedScore", "desc");
  assert.equal(scoreDesc[0].suggestedParticipationScore, 90);
  assert.equal(scoreDesc[1].suggestedParticipationScore, 80);
  assert.equal(scoreDesc[2].suggestedParticipationScore, null);
});

// 27. mobile comparison remains readable
test("27. mobile comparison remains readable: mobil ekranda yatay kaydırma ve min-width korunur", () => {
  assert.match(cssSource, /\.reports-table-scroll\{overflow-x:auto/);
  assert.match(cssSource, /\.reports-comparison-table\{width:100%;min-width:640px/);
});

// 28. no class final participation score
test("28. no class final participation score: sınıf düzeyinde tek bir katılım notu üretilmez", () => {
  assert.doesNotMatch(reportsViewSource, /sınıf katılım notu/i);
  assert.doesNotMatch(reportsViewSource, /genel katılım notu/i);
  assert.doesNotMatch(reportsSource, /classParticipationScore/i);
});

// 29. no chart
test("29. no chart: harici veya dahili chart kütüphanesi kullanılmaz", () => {
  assert.doesNotMatch(reportsViewSource, /chart\.js/i);
  assert.doesNotMatch(reportsViewSource, /recharts/i);
  assert.doesNotMatch(reportsViewSource, /victory/i);
});

// 30. no PDF generation (RAPOR-13A: "Yazdır / PDF" yazdırma affordance'ı hariç)
test("30. no PDF: PDF kütüphanesi veya gerçek PDF üretimi yer almaz", () => {
  assert.doesNotMatch(reportsViewSource, /jspdf/i);
  assert.doesNotMatch(reportsViewSource, /react-pdf|pdf-lib|html2canvas/i);
  assert.doesNotMatch(reportsViewSource, /new Blob|new File\(|URL\.createObjectURL/i);
  const withoutPrintAffordances = reportsViewSource
    .replace(/Yazdır \/ PDF/g, "")
    .replace(/PDF olarak kaydedebilirsiniz/g, "");
  assert.doesNotMatch(withoutPrintAffordances, /pdf/i);
});

// 31. no AI
test("31. no AI: yapay zeka veya LLM entegrasyonu bulunmaz", () => {
  assert.doesNotMatch(reportsViewSource, /gemini/i);
  assert.doesNotMatch(reportsViewSource, /openai/i);
  assert.doesNotMatch(reportsSource, /\bAI\b/);
  assert.doesNotMatch(reportsSource, /\bLLM\b/i);
});

// 32. no teacher notes
test("32. no teacher notes: öğretmen serbest metin yorumu veya tavsiye motoru bulunmaz", () => {
  assert.doesNotMatch(reportsViewSource, /teacherNote/i);
  assert.doesNotMatch(reportsViewSource, /öğretmen notu/i);
  assert.doesNotMatch(reportsViewSource, /öğretmen yorumu/i);
});

// 33. no schema/persistence changes
test("33. no schema/persistence changes: veri tabanı şeması ve persistence katmanı değiştirilmez", async () => {
  const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storageSource, /ClassComparison/);
  assert.doesNotMatch(storageSource, /comparisonRows/);
});

// 34. input immutability
test("34. input immutability: hesaplama ve sıralama fonksiyonları girdi nesnelerini mutate etmez", () => {
  const student = Object.freeze(createMockStudent("s1", "Ahmet", 101, "c1"));
  const schoolClass = Object.freeze(createMockClass("c1", "8-A", [student]));
  const session = Object.freeze(createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete" } }));
  const sessions = Object.freeze([session]);

  assert.doesNotThrow(() => {
    const dto = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
    reportsMod.sortComparisonRows(dto.rows, "name", "asc");
    reportsMod.sortComparisonRowsByDefault(dto.rows);
  });
});

// 35. Class Reports regression
test("35. Class Reports regression: Sınıf raporları fonksiyonları bozulmadan çalışır", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent("s1")]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } })];

  const classReport = reportsMod.calculateClassReportCore(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(classReport.classId, "c1");
  assert.equal(classReport.totalSessions, 1);
  assert.equal(classReport.typeAverages["Ödev"].score, 100);
});

// 36. Student Reports regression
test("36. Student Reports regression: Öğrenci raporları fonksiyonları bozulmadan çalışır", () => {
  const student = createMockStudent("s1");
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } })];

  const studentReport = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(studentReport.studentId, "s1");
  assert.equal(studentReport.totalValidCheckCount, 1);
  assert.equal(studentReport.breakdowns["Ödev"].score, 100);
});
