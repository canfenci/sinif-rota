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

const scheduleMod = await importTypeScript("app/lib/weekly-schedule.ts");
const dataMod = await importTypeScript("app/lib/data.ts");
const migrationsMod = await importTypeScript("app/lib/migrations.ts");
const scheduleViewMod = await importTypeScript("app/components/ScheduleView.tsx");

const scheduleSource = await readFile(new URL("../app/lib/weekly-schedule.ts", import.meta.url), "utf8");
const scheduleViewSource = await readFile(new URL("../app/components/ScheduleView.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const annualPlanSource = await readFile(new URL("../app/components/AnnualPlan.tsx", import.meta.url), "utf8");
const quickCheckSource = await readFile(new URL("../app/lib/quick-check.ts", import.meta.url), "utf8");

function makeClass(id, name, studentCount, archived) {
  const students = Array.from({ length: studentCount }, (_, i) => ({
    id: `${id}-s${i + 1}`,
    name: `Öğrenci ${i + 1}`,
    number: i + 1,
  }));
  return { id, name, students, ...(archived ? { archived: true } : {}) };
}

function baseData(overrides = {}) {
  return {
    schemaVersion: 1,
    classes: [makeClass("c1", "8-A", 32), makeClass("c2", "6-B", 28)],
    sessions: [],
    ...overrides,
  };
}

function validEntry(overrides = {}) {
  return { id: "e1", classId: "c1", weekday: 1, lessonNumber: 2, ...overrides };
}

// 1. Legacy AppData schedule alanı olmadan yüklenir
test("1. legacy data without weeklySchedule loads successfully", () => {
  const result = migrationsMod.migrateData({ classes: [], sessions: [] });
  assert.equal(result.status, "success");
  assert.equal(result.data.weeklySchedule, undefined);
});

// 2. Default schedule = []
test("2. missing schedule defaults to an empty list", () => {
  const data = baseData();
  assert.deepEqual(data.weeklySchedule ?? [], []);
  const added = scheduleMod.addWeeklyScheduleEntry(data, { classId: "c1", weekday: 1, lessonNumber: 1 }, () => "n1");
  assert.equal(added.weeklySchedule.length, 1);
});

// 3. Pazartesi–Cuma kabul edilir
test("3. weekdays Monday to Friday are accepted", () => {
  for (const day of [1, 2, 3, 4, 5]) {
    assert.equal(scheduleMod.isValidWeeklyScheduleEntry(validEntry({ weekday: day })), true);
  }
  assert.deepEqual(scheduleMod.SCHEDULE_WEEKDAYS, [1, 2, 3, 4, 5]);
});

// 4. Cumartesi/Pazar kayıt oluşturulamaz
test("4. weekend days are rejected", () => {
  for (const day of [0, 6, 7, "1", 1.5, null, undefined]) {
    assert.equal(scheduleMod.isValidWeeklyScheduleEntry(validEntry({ weekday: day })), false);
  }
  assert.equal(scheduleMod.toScheduleWeekday(0), null);
  assert.equal(scheduleMod.toScheduleWeekday(6), null);
});

// 5. lessonNumber pozitif tam sayı olmalı
test("5. lessonNumber must be a positive integer", () => {
  for (const n of [1, 2, 8]) {
    assert.equal(scheduleMod.isValidWeeklyScheduleEntry(validEntry({ lessonNumber: n })), true);
  }
  for (const n of [0, -1, 1.5, "3", null, undefined, NaN]) {
    assert.equal(scheduleMod.isValidWeeklyScheduleEntry(validEntry({ lessonNumber: n })), false);
  }
});

// 6. aynı weekday + lessonNumber ikinci kez eklenemez
test("6. duplicate weekday and lessonNumber is rejected", () => {
  const entries = [validEntry({ id: "e1", classId: "c1", weekday: 1, lessonNumber: 3 })];
  const classes = baseData().classes;
  const error = scheduleMod.validateScheduleInput(entries, classes, { classId: "c2", weekday: 1, lessonNumber: 3 });
  assert.ok(typeof error === "string" && error.length > 0);
  assert.ok(!scheduleMod.isValidWeeklyScheduleList([...entries, validEntry({ id: "e2", classId: "c2", weekday: 1, lessonNumber: 3 })]));
});

// 7. aynı sınıf farklı ders numaralarında aynı gün bulunabilir
test("7. same class may appear in different lessons on the same day", () => {
  const entries = [validEntry({ id: "e1", classId: "c1", weekday: 1, lessonNumber: 2 })];
  const classes = baseData().classes;
  assert.equal(scheduleMod.validateScheduleInput(entries, classes, { classId: "c1", weekday: 1, lessonNumber: 7 }), null);
  assert.equal(
    scheduleMod.isValidWeeklyScheduleList([...entries, validEntry({ id: "e2", classId: "c1", weekday: 1, lessonNumber: 7 })]),
    true
  );
});

// 8. program lessonNumber ASC sıralanır
test("8. entries sort by lessonNumber ascending", () => {
  const entries = [
    validEntry({ id: "e3", weekday: 1, lessonNumber: 6 }),
    validEntry({ id: "e1", weekday: 1, lessonNumber: 1 }),
    validEntry({ id: "e2", weekday: 1, lessonNumber: 3 }),
  ];
  assert.deepEqual(scheduleMod.entriesForWeekday(entries, 1).map((e) => e.lessonNumber), [1, 3, 6]);
});

// 9. bugün yalnız yerel weekday'e ait kayıtlar gelir
test("9. only the given weekday entries resolve", () => {
  const classes = baseData().classes;
  const entries = [
    validEntry({ id: "e1", weekday: 1, lessonNumber: 1 }),
    validEntry({ id: "e2", weekday: 2, lessonNumber: 1 }),
  ];
  const monday = scheduleMod.resolveTodayLessons(entries, classes, 1);
  assert.equal(monday.length, 1);
  assert.equal(monday[0].entry.id, "e1");
  const tuesday = scheduleMod.resolveTodayLessons(entries, classes, 2);
  assert.equal(tuesday.length, 1);
  assert.equal(tuesday[0].entry.id, "e2");
});

// 10. UTC gün kayması oluşturulmaz
test("10. weekday comes from local date without UTC shift", () => {
  assert.equal(scheduleMod.getLocalWeekday(new Date(2026, 8, 14)), 1);
  assert.equal(scheduleMod.getLocalWeekday(new Date(2026, 8, 13)), 0);
  assert.equal(scheduleMod.getLocalWeekday(new Date(2026, 8, 19)), 6);
  assert.equal(scheduleMod.toScheduleWeekday(scheduleMod.getLocalWeekday(new Date(2026, 8, 14))), 1);
  assert.ok(!scheduleSource.includes("getUTCDay"));
  assert.ok(!scheduleSource.includes("toISOString"));
});

// 11. inactive/archived class Bugünün Dersleri'nde görünmez
test("11. archived or deleted classes are excluded from today", () => {
  const classes = [makeClass("c1", "8-A", 3), makeClass("c2", "6-B", 2, true)];
  const entries = [
    validEntry({ id: "e1", classId: "c1", weekday: 1, lessonNumber: 1 }),
    validEntry({ id: "e2", classId: "c2", weekday: 1, lessonNumber: 2 }),
    validEntry({ id: "e3", classId: "gone", weekday: 1, lessonNumber: 3 }),
  ];
  const lessons = scheduleMod.resolveTodayLessons(entries, classes, 1);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].schoolClass.id, "c1");
  assert.equal(scheduleMod.resolveTodayLessons(entries, classes, null).length, 0);
});

// 12. hard delete class → schedule kayıtları temizlenir
test("12. removing a class cascades its schedule entries", () => {
  const data = baseData({ weeklySchedule: [validEntry({ id: "e1", classId: "c1" }), validEntry({ id: "e2", classId: "c2" })] });
  const next = dataMod.removeClass(data, "c1");
  assert.deepEqual(next.weeklySchedule.map((e) => e.id), ["e2"]);
});

// 13. rename → schedule bozulmaz
test("13. renaming a class preserves schedule entries", () => {
  const data = baseData({ weeklySchedule: [validEntry({ id: "e1", classId: "c1" })] });
  const next = dataMod.renameClass(data, "c1", "8-B");
  assert.equal(next.classes[0].name, "8-B");
  assert.deepEqual(next.weeklySchedule, data.weeklySchedule);
});

// 14. class copy/duplicate → schedule kopyalanmaz
test("14. duplicating a class does not copy schedule entries", () => {
  const data = baseData({ weeklySchedule: [validEntry({ id: "e1", classId: "c1" })] });
  let counter = 0;
  const result = dataMod.duplicateClass(data, "c1", () => `new-${++counter}`);
  assert.ok(result.classId);
  assert.deepEqual(result.data.weeklySchedule, data.weeklySchedule);
  assert.ok(!result.data.weeklySchedule.some((e) => e.classId === result.classId));
});

// 15. karta tıklama doğru classId'ye gider
test("15. today cards navigate with the resolved classId", () => {
  assert.ok(pageSource.includes("onClick={() => onClass(schoolClass.id)}"));
});

// 16. hafta sonu empty-state
test("16. weekend shows the empty state", () => {
  assert.ok(pageSource.includes("Bugün planlanmış ders yok."));
});

// 17. hafta içi program yoksa empty-state
test("17. weekdays without lessons show the same empty state", () => {
  const matches = pageSource.match(/Bugün planlanmış ders yok\./g) ?? [];
  assert.ok(matches.length >= 1);
  const lessons = scheduleMod.resolveTodayLessons([], baseData().classes, 3);
  assert.deepEqual(lessons, []);
});

// 18. aynı sınıf iki farklı derste iki kart olarak görünür
test("18. one class in two lessons yields two entries", () => {
  const classes = baseData().classes;
  const entries = [
    validEntry({ id: "e1", weekday: 1, lessonNumber: 2 }),
    validEntry({ id: "e2", weekday: 1, lessonNumber: 7 }),
  ];
  const lessons = scheduleMod.resolveTodayLessons(entries, classes, 1);
  assert.equal(lessons.length, 2);
  assert.deepEqual(lessons.map((l) => l.entry.lessonNumber), [2, 7]);
  assert.ok(lessons.every((l) => l.schoolClass.id === "c1"));
  assert.ok(pageSource.includes("lessons.map(({ entry, schoolClass })"));
});

// 19. active student count canlı class datasından gelir
test("19. student counts derive from live class data", () => {
  assert.ok(pageSource.includes("activeStudentCount(schoolClass)} öğrenci"));
  const full = makeClass("c1", "8-A", 3);
  const reduced = { ...full, students: full.students.slice(0, 1) };
  assert.equal(dataMod.activeStudentCount(full), 3);
  assert.equal(dataMod.activeStudentCount(reduced), 1);
});

// 20. schedule persistence AppData içinde
test("20. schedule persists inside AppData through migration", () => {
  const raw = baseData({ weeklySchedule: [validEntry()] });
  delete raw.schemaVersion;
  const result = migrationsMod.migrateData(raw);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.weeklySchedule, [validEntry()]);
  const v1 = migrationsMod.migrateData({ ...baseData(), weeklySchedule: [validEntry({ lessonNumber: 5 })] });
  assert.equal(v1.status, "success");
  assert.equal(v1.data.weeklySchedule[0].lessonNumber, 5);
});

// 21. ayrı localStorage key oluşmaz
test("21. no separate localStorage key is introduced", () => {
  assert.ok(!storageSource.includes("weeklySchedule"));
  assert.ok(!/SCHEDULE_.*KEY|NEW_STORAGE_KEY/.test(scheduleSource));
});

// 22. mevcut Reports/Annual Plan/Quick Check davranışı değişmez
test("22. reports, annual plan and quick check modules stay untouched", () => {
  assert.ok(!reportsSource.includes("weeklySchedule"));
  assert.ok(!annualPlanSource.includes("weeklySchedule"));
  assert.ok(!quickCheckSource.includes("weeklySchedule"));
});

// 23. Ders Programı UI metinleri mevcut
test("23. schedule management UI strings exist", () => {
  assert.ok(scheduleViewSource.includes("Ders Programı"));
  assert.ok(scheduleViewSource.includes("WEEKDAY_LABELS"));
  assert.ok(scheduleViewSource.includes("SCHEDULE_WEEKDAYS"));
  assert.deepEqual(
    ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"].map((_, i) => scheduleMod.WEEKDAY_LABELS[(i + 1)]),
    ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]
  );
  assert.ok(!scheduleViewSource.includes("Cumartesi"));
  assert.ok(!scheduleViewSource.includes("Pazar"));
  assert.ok(pageSource.includes("Ders Programı"));
});

// 24. Bugünün Dersleri UI metinleri ve format mevcut
test("24. today lessons UI strings and row format exist", () => {
  assert.ok(pageSource.includes("BUGÜNÜN DERSLERİ"));  assert.ok(pageSource.includes("aria-label=\"Bugünün dersleri\""));
  assert.ok(scheduleMod.formatLessonLabel(2) === "2. Ders");
  assert.ok(scheduleViewMod.formatScheduleRowLabel(validEntry({ lessonNumber: 2 }), baseData().classes) === "2. Ders · 8-A");
  assert.ok(cssSource.includes("today-lesson"));
  assert.ok(cssSource.includes("schedule-day-tabs"));
});

// 25. Arşivli sınıfa bağlı schedule reload'da geçerli kalır
test("25. archived class schedule survives migration reload", () => {
  const raw = {
    classes: [makeClass("c1", "8-A", 32, true)],
    sessions: [],
    weeklySchedule: [validEntry({ id: "e1", classId: "c1", weekday: 1, lessonNumber: 2 })],
  };
  delete raw.schemaVersion;
  const result = migrationsMod.migrateData(raw);
  assert.equal(result.status, "success");
  assert.deepEqual(result.data.weeklySchedule, [validEntry({ id: "e1", classId: "c1", weekday: 1, lessonNumber: 2 })]);
  const v1 = migrationsMod.migrateData({ ...baseData(), classes: [makeClass("c1", "8-A", 32, true)], weeklySchedule: [validEntry()] });
  assert.equal(v1.status, "success");
  assert.equal(v1.data.weeklySchedule.length, 1);
  assert.equal(scheduleMod.resolveTodayLessons(v1.data.weeklySchedule, v1.data.classes, 1).length, 0);
});
