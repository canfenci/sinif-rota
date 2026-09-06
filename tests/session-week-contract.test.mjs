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

  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  codeCache.set(relPath, dataUri);
  return dataUri;
}

async function importTypeScript(relPath) {
  const dataUri = await getTranspiledDataUri(relPath);
  return import(dataUri);
}

const { CURRENT_SCHEMA_VERSION, isValidSession, deepCloneSession, migrateData } =
  await importTypeScript("app/lib/migrations.ts");
const { resolveSessionWeekStart, findCalendarMonday, extractCalendarDate, SESSION_TIME_ZONE } =
  await importTypeScript("app/lib/session-week.ts");
const { resolveDefaultWorkCalendar } =
  await importTypeScript("app/lib/academic-year.ts");

const defaultCalendar = resolveDefaultWorkCalendar().calendar;

const baseLegacySession = {
  id: "session-legacy-1",
  classId: "class-5a",
  className: "5-A",
  type: "Ödev",
  date: "2026-09-16T09:00:00.000Z",
  statuses: { "student-1": "complete", "student-2": "partial" },
};

// -----------------------------------------------------------------------------
// A & B: CheckSession weekStart/visitIndex optional ve legacy session geçerli
// -----------------------------------------------------------------------------
test("A. CheckSession weekStart ve visitIndex opsiyoneldir", () => {
  assert.equal(baseLegacySession.weekStart, undefined);
  assert.equal(baseLegacySession.visitIndex, undefined);
  assert.equal(isValidSession(baseLegacySession), true);
});

test("B. Legacy session opsiyonel alanlar olmadan geçerlidir ve migrate edilir", () => {
  const v1Data = {
    schemaVersion: 1,
    classes: [
      {
        id: "class-5a",
        name: "5-A",
        students: [
          { id: "student-1", name: "Ali", number: 10, active: true },
          { id: "student-2", name: "Ayşe", number: 20, active: true },
        ],
      },
    ],
    sessions: [baseLegacySession],
  };

  const result = migrateData(v1Data);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.data.sessions.length, 1);
    assert.equal(result.data.sessions[0].weekStart, undefined);
    assert.equal(result.data.sessions[0].visitIndex, undefined);
  }
});

// -----------------------------------------------------------------------------
// C & D: weekStart geçerli ve geçersiz durumlar
// -----------------------------------------------------------------------------
test("C. weekStart geçerli YYYY-MM-DD olduğunda session kabul edilir", () => {
  const sessionWithWeek = {
    ...baseLegacySession,
    weekStart: "2026-09-14",
  };
  assert.equal(isValidSession(sessionWithWeek), true);
});

test("D. invalid weekStart durumları reddedilir", () => {
  const invalidCases = [
    "invalid-date",
    "2026-13-01",      // Geçersiz ay (13)
    "2026-02-30",      // Geçersiz gün (28/29 çeker)
    "2026/09/14",      // Yanlış ayraç
    "14-09-2026",      // Yanlış sıra
    12345,             // String değil
    null,              // null
    "",                // Boş string
  ];

  for (const badWeek of invalidCases) {
    const session = { ...baseLegacySession, weekStart: badWeek };
    assert.equal(isValidSession(session), false, `Hatalı weekStart kabul edilmemeli: ${String(badWeek)}`);
  }
});

// -----------------------------------------------------------------------------
// E, F, G, H, I: visitIndex geçerli ve geçersiz durumlar
// -----------------------------------------------------------------------------
test("E. visitIndex 1 kabul edilir", () => {
  const session = { ...baseLegacySession, visitIndex: 1 };
  assert.equal(isValidSession(session), true);
});

test("F. visitIndex 2 ve daha büyük tam sayılar kabul edilir (2 ziyarete kilitlenmez)", () => {
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: 2 }), true);
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: 3 }), true);
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: 5 }), true);
});

test("G. visitIndex 0 reddedilir (>= 1 olmalı)", () => {
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: 0 }), false);
});

test("H. visitIndex negatif sayılar reddedilir", () => {
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: -1 }), false);
  assert.equal(isValidSession({ ...baseLegacySession, visitIndex: -5 }), false);
});

test("I. visitIndex ondalıklı, NaN, sonsuz ve tip dışı değerler reddedilir", () => {
  const invalidVisitIndices = [1.5, 2.1, NaN, Infinity, -Infinity, "1", null, true];
  for (const badVisit of invalidVisitIndices) {
    const session = { ...baseLegacySession, visitIndex: badVisit };
    assert.equal(isValidSession(session), false, `Hatalı visitIndex kabul edilmemeli: ${String(badVisit)}`);
  }
});

// -----------------------------------------------------------------------------
// J, K, L, M, N: resolveSessionWeekStart ve takvim/timezone kuralları
// -----------------------------------------------------------------------------
test("J. resolveSessionWeekStart normal okul haftasında doğru Pazartesi döndürür", () => {
  // 2026-09-14 Pazartesi okul açılışı.
  // Çarşamba 2026-09-16 09:30
  const monday = resolveSessionWeekStart("2026-09-16T09:30:00.000Z", defaultCalendar);
  assert.equal(monday, "2026-09-14");

  // Cuma 2026-09-18 14:00
  const friday = resolveSessionWeekStart("2026-09-18T14:00:00.000Z", defaultCalendar);
  assert.equal(friday, "2026-09-14");

  // Pazar 2026-09-20 18:00 (hafta sonu kaydı)
  const sunday = resolveSessionWeekStart("2026-09-20T18:00:00.000Z", defaultCalendar);
  assert.equal(sunday, "2026-09-14");
});

test("K. cross-month hafta doğru Pazartesi gününü üretir", () => {
  // 1 Ekim 2026 Perşembe -> Ait olduğu haftanın Pazartesi günü 28 Eylül 2026'dır
  const weekStart = resolveSessionWeekStart("2026-10-01T10:00:00.000Z", defaultCalendar);
  assert.equal(weekStart, "2026-09-28");
});

test("L. tatil haftasında aynı weekStart identity korunur", () => {
  // 1. Dönem Ara Tatili: 2026-11-16 Pazartesi - 2026-11-20 Cuma
  // Ara tatil Çarşamba günü kaydedilen bir oturum:
  const breakSessionMonday = resolveSessionWeekStart("2026-11-18T11:00:00.000Z", defaultCalendar);
  assert.equal(breakSessionMonday, "2026-11-16");

  // Yarıyıl Tatili: 2027-01-25 Pazartesi
  const semesterBreakMonday = resolveSessionWeekStart("2027-01-27T10:00:00.000Z", defaultCalendar);
  assert.equal(semesterBreakMonday, "2027-01-25");
});

test("M. calendar dışı fallback doğru Pazartesi üretir", () => {
  // findCalendarMonday doğrudan takvim gününün Pazartesi gününü üretir
  assert.equal(findCalendarMonday("2026-08-20"), "2026-08-17");
  assert.equal(findCalendarMonday("2026-08-23"), "2026-08-17");

  // Takvim dışı yaz dönemi: 20 Ağustos 2026 Perşembe
  // 2026-08-20'nin ait olduğu Pazartesi: 2026-08-17
  const summerWithCal = resolveSessionWeekStart("2026-08-20T10:00:00.000Z", defaultCalendar);
  assert.equal(summerWithCal, "2026-08-17");

  // Takvim sağlanmadığında da aynı fallback çalışır
  const withoutCal = resolveSessionWeekStart("2026-08-20T10:00:00.000Z");
  assert.equal(withoutCal, "2026-08-17");

  // YYYY-MM-DD formatında takvim dışı doğrudan tarih
  assert.equal(resolveSessionWeekStart("2026-08-23"), "2026-08-17"); // Pazar -> 17 Ağustos
});

test("N. timezone edge-case: gece yarısı kayıtları Europe/Istanbul ile doğru haftaya düşer", () => {
  assert.equal(SESSION_TIME_ZONE, "Europe/Istanbul");

  // extractCalendarDate deterministik gün dönüşümü doğrulanır
  assert.equal(extractCalendarDate("2026-09-20T21:30:00.000Z"), "2026-09-21");
  assert.equal(extractCalendarDate("2026-09-20T20:45:00.000Z"), "2026-09-20");

  // Türkiye yerel saatinde Pazartesi 00:30 (2026-09-21 00:30 TRT, UTC karşılığı 2026-09-20T21:30:00.000Z)
  // Bu kayıt 2. Hafta'ya (2026-09-21) ait olmalıdır; önceki haftaya (2026-09-14) kaymamalıdır.
  const lateNightMonday = resolveSessionWeekStart("2026-09-20T21:30:00.000Z", defaultCalendar);
  assert.equal(lateNightMonday, "2026-09-21");

  // Türkiye yerel saatinde Pazar 23:45 (2026-09-20 23:45 TRT, UTC karşılığı 2026-09-20T20:45:00.000Z)
  // Bu kayıt 1. Hafta Pazar gecesidir; haftanın başlangıcı 2026-09-14 olmalıdır.
  const lateSundayNight = resolveSessionWeekStart("2026-09-20T20:45:00.000Z", defaultCalendar);
  assert.equal(lateSundayNight, "2026-09-14");

  // Explicit timezone offset içeren ISO formatı
  const explicitOffset = resolveSessionWeekStart("2026-09-21T00:30:00+03:00", defaultCalendar);
  assert.equal(explicitOffset, "2026-09-21");
});

// -----------------------------------------------------------------------------
// O, P, Q, R: deepCloneSession, visitIndex ve unknown fields preservation
// -----------------------------------------------------------------------------
test("O. deepCloneSession weekStart alanını korur", () => {
  const session = {
    ...baseLegacySession,
    weekStart: "2026-09-14",
  };
  const cloned = deepCloneSession(session);
  assert.equal(cloned.weekStart, "2026-09-14");
  assert.notEqual(cloned, session);
});

test("P. deepCloneSession visitIndex alanını korur", () => {
  const session = {
    ...baseLegacySession,
    visitIndex: 3,
  };
  const cloned = deepCloneSession(session);
  assert.equal(cloned.visitIndex, 3);
});

test("Q. legacy session visitIndex alanı undefined kalır (tahmin/uydurma yapılmaz)", () => {
  const cloned = deepCloneSession(baseLegacySession);
  assert.equal(cloned.visitIndex, undefined);
  assert.equal("visitIndex" in cloned, false);
});

test("R. CheckSession üzerindeki bilinmeyen/ek alanlar (unknown fields) korunur", () => {
  const sessionWithUnknown = {
    ...baseLegacySession,
    weekStart: "2026-09-14",
    visitIndex: 2,
    customFieldA: "meta-value-1",
    customFieldB: 999,
  };

  const cloned = deepCloneSession(sessionWithUnknown);
  assert.equal(cloned.customFieldA, "meta-value-1");
  assert.equal(cloned.customFieldB, 999);

  const v1Data = {
    schemaVersion: 1,
    classes: [
      {
        id: "class-5a",
        name: "5-A",
        students: [{ id: "student-1", name: "Ali", number: 10 }],
      },
    ],
    sessions: [sessionWithUnknown],
  };

  const result = migrateData(v1Data);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    const migratedSession = result.data.sessions[0];
    assert.equal(migratedSession.weekStart, "2026-09-14");
    assert.equal(migratedSession.visitIndex, 2);
    assert.equal(migratedSession.customFieldA, "meta-value-1");
    assert.equal(migratedSession.customFieldB, 999);
  }
});

// -----------------------------------------------------------------------------
// S & T: schemaVersion ve persistence/data safety koruması
// -----------------------------------------------------------------------------
test("S. CURRENT_SCHEMA_VERSION hâlâ 1'dir (şema versiyonu artırılmamıştır)", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1);
});

test("T. Hem legacy hem yeni oturumları içeren veri seti başarıyla migrate ve validate edilir", () => {
  const mixedData = {
    schemaVersion: 1,
    classes: [
      {
        id: "class-5a",
        name: "5-A",
        students: [
          { id: "student-1", name: "Ali", number: 10 },
          { id: "student-2", name: "Ayşe", number: 20 },
        ],
      },
    ],
    sessions: [
      baseLegacySession, // weekStart/visitIndex yok
      {
        id: "session-new-1",
        classId: "class-5a",
        className: "5-A",
        type: "Defter",
        date: "2026-09-21T10:00:00.000Z",
        weekStart: "2026-09-21",
        visitIndex: 1,
        statuses: { "student-1": "complete" },
      },
      {
        id: "session-new-2",
        classId: "class-5a",
        className: "5-A",
        type: "Kitap",
        date: "2026-09-21T10:15:00.000Z",
        weekStart: "2026-09-21",
        visitIndex: 1,
        statuses: { "student-1": "complete", "student-2": "missing" },
      },
      {
        id: "session-new-3",
        classId: "class-5a",
        className: "5-A",
        type: "Ödev",
        date: "2026-09-23T11:00:00.000Z",
        weekStart: "2026-09-21",
        visitIndex: 2,
        statuses: { "student-1": "partial", "student-2": "complete" },
      },
    ],
  };

  const result = migrateData(mixedData);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.data.sessions.length, 4);
    assert.equal(result.data.sessions[0].weekStart, undefined);
    assert.equal(result.data.sessions[0].visitIndex, undefined);
    assert.equal(result.data.sessions[1].weekStart, "2026-09-21");
    assert.equal(result.data.sessions[1].visitIndex, 1);
    assert.equal(result.data.sessions[2].visitIndex, 1);
    assert.equal(result.data.sessions[3].visitIndex, 2);
  }
});
