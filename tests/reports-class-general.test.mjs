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
    weekStart: args.weekStart ?? "2026-09-14",
  };
}

// 1. general DTO produced
test("1. general DTO produced: calculateClassGeneralReport geçerli bir ClassGeneralReportDTO üretir", () => {
  assert.ok(typeof reportsMod.calculateClassGeneralReport === "function");
  assert.ok(typeof reportsViewMod.ReportsView === "function");
  const s1 = createMockStudent("s1", "Ahmet Yılmaz", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(dto);
  assert.equal(dto.classId, "c1");
  assert.equal(dto.className, "8-A");
  assert.equal(typeof dto.activeStudentCount, "number");
  assert.ok(dto.typeMetrics);
  assert.ok(Array.isArray(dto.weeklyTrend));
});

// 2. range required
test("2. range required: range alanı zorunludur ve fromWeekStart/toWeekStart içerir", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [createMockSession({ id: "ses-1", classId: "c1" })];

  const explicitRange = { fromWeekStart: "2026-09-14", toWeekStart: "2026-09-28" };
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { range: explicitRange, calendar: demoCalendar });

  assert.ok(dto.range, "range alanı mevcut olmalıdır");
  assert.equal(typeof dto.range, "object");
  assert.equal(dto.range.fromWeekStart, "2026-09-14");
  assert.equal(dto.range.toWeekStart, "2026-09-28");
});

// 3. selected class isolation
test("3. selected class isolation: başka bir sınıfa ait oturumlar aggregate rapora katılmaz", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101, "c1");
  const s2 = createMockStudent("s2", "Mehmet", 102, "c2");
  const class1 = createMockClass("c1", "8-A", [s1]);
  const class2 = createMockClass("c2", "8-B", [s2]);
  assert.equal(class2.students.length, 1);

  const sessions = [
    createMockSession({ id: "ses-c1", classId: "c1", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-c2", classId: "c2", type: "Ödev", statuses: { s2: "missing" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(class1, sessions, { calendar: demoCalendar });
  assert.equal(dto.totalControlSessionCount, 1);
  assert.equal(dto.typeMetrics["Ödev"].evaluatedCount, 1);
  assert.equal(dto.typeMetrics["Ödev"].score, 100);
});

// 4. selected range filtering
test("4. selected range filtering: yalnız seçili aralıktaki oturumlar hesaplamaya katılır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14", type: "Ödev", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-2", date: "2026-09-21", weekStart: "2026-09-21", type: "Ödev", statuses: { s1: "missing" } }),
    createMockSession({ id: "ses-3", date: "2026-10-05", weekStart: "2026-10-05", type: "Ödev", statuses: { s1: "partial" } }),
  ];

  const range = { fromWeekStart: "2026-09-14", toWeekStart: "2026-09-21" };
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { range, calendar: demoCalendar });

  assert.equal(dto.totalControlSessionCount, 2);
  assert.equal(dto.typeMetrics["Ödev"].evaluatedCount, 2);
  // ses-1 (complete=100) + ses-2 (missing=0) -> 50
  assert.equal(dto.typeMetrics["Ödev"].score, 50);
});

// 5. activeStudentCount correct
test("5. activeStudentCount correct: aktif öğrencilerin sayısı doğru hesaplanır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101, "c1", true);
  const s2 = createMockStudent("s2", "Mehmet", 102, "c1", true);
  const s3 = createMockStudent("s3", "Ayşe", 103, "c1", true);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2, s3]);

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.activeStudentCount, 3);
});

// 6. archived student excluded from active count
test("6. archived student excluded from active count: aktif olmayan (active: false) öğrenci activeStudentCount'a katılmaz", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101, "c1", true);
  const s2 = createMockStudent("s2", "Mehmet", 102, "c1", false);
  const s3 = createMockStudent("s3", "Ayşe", 103, "c1", true);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2, s3]);

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });
  assert.equal(dto.activeStudentCount, 2);
});

// 7. four type metrics exist
test("7. four type metrics exist: typeMetrics 4 temel kontrol türünü içerir", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent()]);
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });

  assert.ok("Ödev" in dto.typeMetrics);
  assert.ok("Defter" in dto.typeMetrics);
  assert.ok("Kitap" in dto.typeMetrics);
  assert.ok("Materyal" in dto.typeMetrics);
});

// 8. type score correct
test("8. type score correct: tür puanı doğru hesaplanır (%100, %50 vb.)", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete", s2: "partial" } }), // 100 + 50 = 150 / 2 = 75
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.typeMetrics["Ödev"].score, 75);
  assert.equal(dto.typeMetrics["Ödev"].evaluatedCount, 2);
});

// 9. null metric remains null
test("9. null metric remains null: kontrolü olmayan türde score null kalır (sahte %0 yok)", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent()]);
  const sessions = [createMockSession({ type: "Ödev", statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.typeMetrics["Defter"].score, null);
  assert.equal(dto.typeMetrics["Defter"].evaluatedCount, 0);
  assert.notEqual(dto.typeMetrics["Defter"].score, 0);
});

// 10. evaluatedCount correct
test("10. evaluatedCount correct: evaluatedCount geçerli gözlem sayısını verir", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Kitap", statuses: { s1: "complete", s2: "missing" } }),
    createMockSession({ id: "ses-2", type: "Kitap", statuses: { s1: "partial", s2: "complete" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.typeMetrics["Kitap"].evaluatedCount, 4);
});

// 11. absent excluded from score
test("11. absent excluded from score: absent kayıtları tür puanından ve evaluatedCount paydasından hariç tutulur", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Materyal", statuses: { s1: "complete", s2: "absent" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  // s1 complete=100, s2 absent=hariç -> evaluatedCount=1, score=100
  assert.equal(dto.typeMetrics["Materyal"].evaluatedCount, 1);
  assert.equal(dto.typeMetrics["Materyal"].score, 100);
});

// 12. absentCount correct
test("12. absentCount correct: her tür için absentCount doğru sayılır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Defter", statuses: { s1: "absent", s2: "absent" } }),
    createMockSession({ id: "ses-2", type: "Defter", statuses: { s1: "complete", s2: "absent" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.typeMetrics["Defter"].absentCount, 3);
});

// 13. totalObservedAbsenceCount correct
test("13. totalObservedAbsenceCount correct: tüm türlerdeki gelmedi kayıtlarının toplamı doğru döner", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "absent" } }),
    createMockSession({ id: "ses-2", type: "Defter", statuses: { s1: "absent" } }),
    createMockSession({ id: "ses-3", type: "Kitap", statuses: { s1: "complete" } }),
    createMockSession({ id: "ses-4", type: "Materyal", statuses: { s1: "absent" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.totalObservedAbsenceCount, 3);
});

// 14. totalControlSessionCount correct
test("14. totalControlSessionCount correct: toplam kontrol oturum sayısı doğru döner", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev" }),
    createMockSession({ id: "ses-2", type: "Defter" }),
    createMockSession({ id: "ses-3", type: "Kitap" }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.totalControlSessionCount, 3);
});

// 15. sufficient count correct
test("15. sufficient count correct: veri yeterliliği sağlanan öğrenci sayısı doğru hesaplanır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  // s1 gets 3 types, >=2 checks each, >=8 checks total (sufficient)
  // s2 gets only 1 check (insufficient)
  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete", s2: "complete" }, date: "2026-09-14", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-2", type: "Ödev", statuses: { s1: "complete" }, date: "2026-09-14", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-3", type: "Defter", statuses: { s1: "complete" }, date: "2026-09-15", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-4", type: "Defter", statuses: { s1: "complete" }, date: "2026-09-15", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-5", type: "Kitap", statuses: { s1: "complete" }, date: "2026-09-16", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-6", type: "Kitap", statuses: { s1: "complete" }, date: "2026-09-16", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-7", type: "Materyal", statuses: { s1: "complete" }, date: "2026-09-17", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-8", type: "Materyal", statuses: { s1: "complete" }, date: "2026-09-17", weekStart: "2026-09-14" }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.dataCoverage.studentsWithSufficientData, 1);
});

// 16. insufficient count correct
test("16. insufficient count correct: veri yetersiz olan öğrenci sayısı doğru hesaplanır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", type: "Ödev", statuses: { s1: "complete", s2: "complete" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.dataCoverage.studentsWithInsufficientData, 2);
  assert.equal(dto.dataCoverage.studentsWithSufficientData, 0);
});

// 17. no studentId in DTO
test("17. no studentId in DTO: DTO ve alt nesnelerinde asla studentId bulunmaz", () => {
  const s1 = createMockStudent("s1-unique-id", "Ahmet Yılmaz", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [createMockSession({ statuses: { "s1-unique-id": "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes("s1-unique-id"), "DTO içeriğinde studentId geçmemelidir");
  assert.ok(!("studentId" in dto));
});

// 18. no studentName in DTO
test("18. no studentName in DTO: DTO ve alt nesnelerinde asla studentName bulunmaz", () => {
  const s1 = createMockStudent("s1", "UniqueStudentNameXYZ", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [createMockSession({ statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes("UniqueStudentNameXYZ"), "DTO içeriğinde öğrenci adı bulunmamalıdır");
  assert.ok(!("studentName" in dto));
});

// 19. no studentNumber in DTO
test("19. no studentNumber in DTO: DTO ve alt nesnelerinde asla studentNumber bulunmaz", () => {
  const s1 = createMockStudent("s1", "Ahmet", 98765);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [createMockSession({ statuses: { s1: "complete" } })];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes("98765"), "DTO içeriğinde öğrenci numarası bulunmamalıdır");
  assert.ok(!("studentNumber" in dto));
});

// 20. no student array in DTO
test("20. no student array in DTO: DTO içinde student listesi, students veya rows bulunmaz", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });

  assert.ok(!("students" in dto), "DTO students dizisi taşımamalıdır");
  assert.ok(!("rows" in dto), "DTO comparison rows taşımamalıdır");
  assert.ok(!("studentList" in dto), "DTO studentList taşımamalıdır");
});

// 21. no suggestedParticipationScore per student
test("21. no suggestedParticipationScore per student: DTO bireysel öneri notu haritası taşımaz", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });

  assert.ok(!("suggestedParticipationScore" in dto));
  assert.ok(!("studentScores" in dto));
});

// 22. weekly trend produced
test("22. weekly trend produced: weeklyTrend dizisi üretilir", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);
  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14", type: "Ödev", statuses: { s1: "complete" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(Array.isArray(dto.weeklyTrend));
  assert.equal(dto.weeklyTrend.length, 1);
  assert.equal(dto.weeklyTrend[0].weekStart, "2026-09-14");
});

// 23. weekly trend chronological ascending
test("23. weekly trend chronological ascending: haftalık trend en eskiden en yeniye kronolojik sıralanır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-3", date: "2026-10-05", weekStart: "2026-10-05" }),
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14" }),
    createMockSession({ id: "ses-2", date: "2026-09-21", weekStart: "2026-09-21" }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.weeklyTrend.length, 3);
  assert.equal(dto.weeklyTrend[0].weekStart, "2026-09-14");
  assert.equal(dto.weeklyTrend[1].weekStart, "2026-09-21");
  assert.equal(dto.weeklyTrend[2].weekStart, "2026-10-05");
});

// 24. weekly type scores correct
test("24. weekly type scores correct: haftalık trendde tür skorları doğru hesaplanır", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14", type: "Defter", statuses: { s1: "partial" } }), // 50
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.weeklyTrend[0].typeScores["Defter"], 50);
  assert.equal(dto.weeklyTrend[0].typeScores["Ödev"], null);
});

// 25. weekly observed absence correct
test("25. weekly observed absence correct: haftalık trendde observedAbsenceCount doğru döner", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const s2 = createMockStudent("s2", "Mehmet", 102);
  const schoolClass = createMockClass("c1", "8-A", [s1, s2]);

  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14", type: "Ödev", statuses: { s1: "absent", s2: "absent" } }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.weeklyTrend[0].observedAbsenceCount, 2);
});

// 26. weekly session count correct
test("26. weekly session count correct: haftalık trendde sessionCount doğru döner", () => {
  const s1 = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [s1]);

  const sessions = [
    createMockSession({ id: "ses-1", date: "2026-09-14", weekStart: "2026-09-14", type: "Ödev" }),
    createMockSession({ id: "ses-2", date: "2026-09-15", weekStart: "2026-09-14", type: "Defter" }),
  ];

  const dto = reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.equal(dto.weeklyTrend[0].sessionCount, 2);
});

// 27. current_week range
test("27. current_week range: resolveReportRange('current_week') ile doğru tek hafta filtrelenir", () => {
  const range = reportsMod.resolveReportRange("current_week", demoCalendar, new Date("2026-09-16T10:00:00Z"));
  assert.equal(range.fromWeekStart, range.toWeekStart);
  assert.equal(range.fromWeekStart, "2026-09-14");
});

// 28. last_4_weeks range
test("28. last_4_weeks range: resolveReportRange('last_4_weeks') ile en fazla 4 gerçek PlanWeek filtrelenir", () => {
  const range = reportsMod.resolveReportRange("last_4_weeks", demoCalendar, new Date("2026-10-14T10:00:00Z"));
  assert.ok(range.fromWeekStart);
  assert.ok(range.toWeekStart);
  assert.ok(range.fromWeekStart <= range.toWeekStart);
});

// 29. term range
test("29. term range: resolveReportRange('term') ile dönem haftaları filtrelenir", () => {
  const range = reportsMod.resolveReportRange("term", demoCalendar, new Date("2026-09-16T10:00:00Z"));
  assert.ok(range.fromWeekStart);
  assert.ok(range.toWeekStart);
  assert.equal(range.fromWeekStart, "2026-09-14");
});

// 30. year range
test("30. year range: resolveReportRange('year') ile tüm akademik yıl filtrelenir", () => {
  const range = reportsMod.resolveReportRange("year", demoCalendar);
  assert.equal(range.fromWeekStart, "2026-09-14");
  assert.ok(range.toWeekStart >= "2027-06-01");
});

// 31. empty data behavior
test("31. empty data behavior: oturumu olmayan sınıf için sıfır oturum ve null skorlar güvenle döner", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent()]);
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });

  assert.equal(dto.totalControlSessionCount, 0);
  assert.equal(dto.totalObservedAbsenceCount, 0);
  assert.equal(dto.weeklyTrend.length, 0);
  assert.equal(dto.typeMetrics["Ödev"].score, null);
  assert.equal(dto.typeMetrics["Ödev"].evaluatedCount, 0);
});

// 32. UI no student names in general section
test("32. UI no student names in general section: Sınıf Genel Raporu görünümünde öğrenci isimleri yer almaz", () => {
  assert.ok(reportsViewSource.includes("reports-general-section"));
  assert.ok(reportsViewSource.includes("general-report-card"));
  assert.ok(cssSource.includes("reports-general-section"));
  const genSecStart = reportsViewSource.indexOf('className="reports-general-section"');
  const compSecStart = reportsViewSource.indexOf('className="reports-comparison-section"');
  assert.ok(genSecStart > 0 && compSecStart > genSecStart);
  const genSectionCode = reportsViewSource.substring(genSecStart, compSecStart);
  assert.ok(!genSectionCode.includes("student.name"), "Genel raporda student.name bulunamaz");
  assert.ok(!genSectionCode.includes("student.number"), "Genel raporda student.number bulunamaz");
  assert.ok(!genSectionCode.includes("studentName"), "Genel raporda studentName bulunamaz");
});

// 33. no class final participation score
test("33. no class final participation score: sınıf düzeyinde tek bir katılım veya başarı puanı üretilmez", () => {
  const schoolClass = createMockClass("c1", "8-A", [createMockStudent()]);
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { calendar: demoCalendar });
  assert.ok(!("classParticipationScore" in dto));
  assert.ok(!("finalScore" in dto));
  assert.ok(!("generalScore" in dto));
});

// 34. no chart dependency
test("34. no chart dependency: harici veya dahili grafik kütüphanesi kullanılmaz", () => {
  assert.ok(!reportsViewSource.includes("recharts"));
  assert.ok(!reportsViewSource.includes("chart.js"));
  assert.ok(!reportsViewSource.includes("<canvas"));
  assert.ok(!reportsViewSource.includes("<svg className=\"chart"));
});

// 35. no PDF/share
test("35. no PDF/share: PDF kütüphanesi veya paylaşım butonu bulunmaz", () => {
  assert.ok(!reportsViewSource.includes("jspdf"));
  assert.ok(!reportsViewSource.includes("html2canvas"));
  assert.ok(!reportsViewSource.includes("PDF İndir"));
  assert.ok(!reportsViewSource.includes("Paylaş"));
});

// 36. no AI
test("36. no AI: yapay zeka veya LLM entegrasyonu bulunmaz", () => {
  assert.ok(!reportsSource.includes("generateText"));
  assert.ok(!reportsSource.includes("openai"));
  assert.ok(!reportsSource.includes("gemini"));
  assert.ok(!reportsViewSource.includes("Yapay Zeka"));
});

// 37. no teacher notes
test("37. no teacher notes: öğretmen notu veya serbest metin tavsiye motoru bulunmaz", () => {
  assert.ok(!reportsSource.includes("teacherNotes"));
  assert.ok(!reportsSource.includes("recommendationEngine"));
  assert.ok(!reportsViewSource.includes("Öğretmen Notu"));
});

// 38. no schema/persistence change
test("38. no schema/persistence change: AppData şeması ve persistence katmanı değiştirilmez", async () => {
  const migrationsSource = await readFile(new URL("../app/lib/migrations.ts", import.meta.url), "utf8");
  assert.ok(migrationsSource.includes("CURRENT_SCHEMA_VERSION = 1"));
  const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storageSource, /ClassGeneral/);
});

// 39. input immutability
test("39. input immutability: hesaplama fonksiyonları girdi nesnelerini mutate etmez", () => {
  const student = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", statuses: { s1: "complete" } })];

  const classBefore = JSON.stringify(schoolClass);
  const sessionsBefore = JSON.stringify(sessions);

  reportsMod.calculateClassGeneralReport(schoolClass, sessions, { calendar: demoCalendar });

  assert.equal(JSON.stringify(schoolClass), classBefore);
  assert.equal(JSON.stringify(sessions), sessionsBefore);
});

// 40. Class Report regression
test("40. Class Report regression: calculateClassReportCore fonksiyonu bozulmadan çalışır", () => {
  const student = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", statuses: { s1: "complete" } })];

  const res = reportsMod.calculateClassReportCore(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(res);
  assert.equal(res.classId, "c1");
  assert.equal(res.totalSessions, 1);
});

// 41. Student Report regression
test("41. Student Report regression: calculateStudentReportCore fonksiyonu bozulmadan çalışır", () => {
  const student = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", statuses: { s1: "complete" } })];

  const res = reportsMod.calculateStudentReportCore(student, schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(res);
  assert.equal(res.studentId, "s1");
});

// 42. Comparison Report regression
test("42. Comparison Report regression: calculateClassComparisonReport fonksiyonu bozulmadan çalışır", () => {
  const student = createMockStudent("s1", "Ahmet", 101);
  const schoolClass = createMockClass("c1", "8-A", [student]);
  const sessions = [createMockSession({ id: "ses-1", statuses: { s1: "complete" } })];

  const res = reportsMod.calculateClassComparisonReport(schoolClass, sessions, { calendar: demoCalendar });
  assert.ok(res);
  assert.equal(res.classId, "c1");
  assert.equal(res.rows.length, 1);
  assert.ok(res.range);
});
