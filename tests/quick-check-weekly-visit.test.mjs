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
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".tsx") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
        targetRel = `${targetRel}.ts`;
      } catch {
        try {
          await readFile(new URL(`../${targetRel}.tsx`, import.meta.url));
          targetRel = `${targetRel}.tsx`;
        } catch {
          targetRel = `${targetRel}/index.ts`;
        }
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

const { createCheckSession } = await importTypeScript("app/lib/data.ts");
const { resolveSessionWeekStart } = await importTypeScript("app/lib/session-week.ts");
const {
  createInitialCheckStatuses,
  updateCheckStatus,
  getStatusPresentation,
  getExistingVisitsForWeek,
  getNextVisitIndex,
  isDuplicateSession,
} = await importTypeScript("app/lib/quick-check.ts");
const { resolveDefaultWorkCalendar } = await importTypeScript("app/lib/academic-year.ts");
const { isValidSession, deepCloneSession } = await importTypeScript("app/lib/migrations.ts");

const calendar = resolveDefaultWorkCalendar().calendar;

const mockClass8A = {
  id: "class-8a",
  name: "8-A",
  students: [
    { id: "s1", name: "Ahmet Kaya", number: 10, active: true },
    { id: "s2", name: "Zeynep Demir", number: 20, active: true },
  ],
};

const mockClass8B = {
  id: "class-8b",
  name: "8-B",
  students: [
    { id: "s3", name: "Can Yılmaz", number: 15, active: true },
  ],
};

// -----------------------------------------------------------------------------
// A: current week doğru weekStart ile seçilir
// -----------------------------------------------------------------------------
test("A. current week doğru weekStart ile seçilir", () => {
  // Okul haftası Pazartesi: 2026-09-28T10:00:00.000Z -> 2026-09-28
  const weekStart = resolveSessionWeekStart("2026-09-28T10:00:00.000Z", calendar);
  assert.equal(weekStart, "2026-09-28");
});

// -----------------------------------------------------------------------------
// B, C, D: visitIndex 1, 2, 3+ seçilebilir ve kaydedilebilir
// -----------------------------------------------------------------------------
test("B. ilk yeni kayıt visitIndex=1 ile kaydedilebilir", () => {
  const session = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete", s2: "complete" },
    "2026-09-28T09:00:00.000Z",
    () => "uuid-1",
    "2026-09-28",
    1
  );
  assert.equal(session.weekStart, "2026-09-28");
  assert.equal(session.visitIndex, 1);
  assert.equal(isValidSession(session), true);
});

test("C. visitIndex=2 seçilebilir ve kaydedilebilir", () => {
  const session = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete", s2: "partial" },
    "2026-09-30T10:00:00.000Z",
    () => "uuid-2",
    "2026-09-28",
    2
  );
  assert.equal(session.visitIndex, 2);
  assert.equal(isValidSession(session), true);
});

test("D. visitIndex 3+ desteklenir (sistem 2 girişe kilitlenmez)", () => {
  const session = createCheckSession(
    mockClass8A,
    "Kitap",
    { s1: "complete" },
    "2026-10-02T11:00:00.000Z",
    () => "uuid-3",
    "2026-09-28",
    5
  );
  assert.equal(session.visitIndex, 5);
  assert.equal(isValidSession(session), true);
});

// -----------------------------------------------------------------------------
// E & F: Aynı visit içinde birden fazla kontrol türü ve visit index izolasyonu
// -----------------------------------------------------------------------------
test("E. aynı visit içinde Ödev + Defter aynı visitIndex taşır", () => {
  const odevSession = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete" },
    "2026-09-28T09:00:00.000Z",
    () => "uuid-odev",
    "2026-09-28",
    1
  );
  const defterSession = createCheckSession(
    mockClass8A,
    "Defter",
    { s1: "complete" },
    "2026-09-28T09:05:00.000Z",
    () => "uuid-defter",
    "2026-09-28",
    1
  );

  assert.equal(odevSession.visitIndex, 1);
  assert.equal(defterSession.visitIndex, 1);

  const { visits } = getExistingVisitsForWeek([odevSession, defterSession], mockClass8A.id, "2026-09-28", calendar);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].visitIndex, 1);
  assert.deepEqual(visits[0].types, ["Ödev", "Defter"]);
});

test("F. Ödev kaydı sonrası Defter seçildiğinde otomatik visit 2'ye geçmez", () => {
  const odevSession = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete" },
    "2026-09-28T09:00:00.000Z",
    () => "uuid-odev",
    "2026-09-28",
    1
  );

  // Ziyaret 1 seçiliyken Defter duplicate değildir
  const isDuplicate = isDuplicateSession([odevSession], mockClass8A.id, "2026-09-28", 1, "Defter", calendar);
  assert.equal(isDuplicate, false);
});

// -----------------------------------------------------------------------------
// G: Sınıf değişiminde visit state güvenli resetlenir
// -----------------------------------------------------------------------------
test("G. sınıf değişiminde mevcut visitler ilgili sınıfa göre izole edilir", () => {
  const session8A = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete" },
    "2026-09-28T09:00:00.000Z",
    () => "uuid-8a",
    "2026-09-28",
    1
  );

  const visits8A = getExistingVisitsForWeek([session8A], mockClass8A.id, "2026-09-28", calendar);
  assert.equal(visits8A.visits.length, 1);

  // 8-B için henüz kayıt yok
  const visits8B = getExistingVisitsForWeek([session8A], mockClass8B.id, "2026-09-28", calendar);
  assert.equal(visits8B.visits.length, 0);
  assert.equal(getNextVisitIndex(visits8B.visits), 1);
});

// -----------------------------------------------------------------------------
// H: Aynı class/week/visit/type duplicate tespiti
// -----------------------------------------------------------------------------
test("H. aynı class/week/visit/type duplicate tespit edilir ve engellenir", () => {
  const existingSession = createCheckSession(
    mockClass8A,
    "Ödev",
    { s1: "complete" },
    "2026-09-28T09:00:00.000Z",
    () => "uuid-dup",
    "2026-09-28",
    1
  );

  const isDup = isDuplicateSession([existingSession], mockClass8A.id, "2026-09-28", 1, "Ödev", calendar);
  assert.equal(isDup, true);

  // Farklı tür duplicate değildir
  assert.equal(isDuplicateSession([existingSession], mockClass8A.id, "2026-09-28", 1, "Defter", calendar), false);

  // Farklı visit duplicate değildir
  assert.equal(isDuplicateSession([existingSession], mockClass8A.id, "2026-09-28", 2, "Ödev", calendar), false);

  // Farklı hafta duplicate değildir
  assert.equal(isDuplicateSession([existingSession], mockClass8A.id, "2026-10-05", 1, "Ödev", calendar), false);
});

// -----------------------------------------------------------------------------
// I & J: Legacy session visitIndex davranışı ve duplicate izolasyonu
// -----------------------------------------------------------------------------
test("I. legacy visitIndex undefined olduğu gibi kalır (yapay visit atanmaz)", () => {
  const legacySession = {
    id: "legacy-session-1",
    classId: mockClass8A.id,
    className: mockClass8A.name,
    type: "Ödev",
    date: "2026-09-28T09:00:00.000Z",
    statuses: { s1: "complete" },
  };

  const { visits, hasLegacySessions } = getExistingVisitsForWeek([legacySession], mockClass8A.id, "2026-09-28", calendar);
  assert.equal(visits.length, 0);
  assert.equal(hasLegacySessions, true);
});

test("J. legacy session duplicate new visit olarak sayılmaz", () => {
  const legacySession = {
    id: "legacy-session-1",
    classId: mockClass8A.id,
    className: mockClass8A.name,
    type: "Ödev",
    date: "2026-09-28T09:00:00.000Z",
    statuses: { s1: "complete" },
  };

  // Yeni 1. Giriş Ödev kaydı oluşturulurken legacy session duplicate yaratmaz
  const isDup = isDuplicateSession([legacySession], mockClass8A.id, "2026-09-28", 1, "Ödev", calendar);
  assert.equal(isDup, false);
});

// -----------------------------------------------------------------------------
// K, L, M, N: createCheckSession contract ve technical status values
// -----------------------------------------------------------------------------
test("K. createCheckSession weekStart yazar", () => {
  const session = createCheckSession(mockClass8A, "Kitap", {}, "2026-09-28T09:00:00.000Z", () => "id-1", "2026-09-28", 1);
  assert.equal(session.weekStart, "2026-09-28");
});

test("L. createCheckSession visitIndex yazar", () => {
  const session = createCheckSession(mockClass8A, "Materyal", {}, "2026-09-28T09:00:00.000Z", () => "id-1", "2026-09-28", 2);
  assert.equal(session.visitIndex, 2);
});

test("M. date ISO timestamp korunur", () => {
  const nowIso = new Date().toISOString();
  const session = createCheckSession(mockClass8A, "Ödev", {}, nowIso, () => "id-1", "2026-09-28", 1);
  assert.equal(session.date, nowIso);
});

test("N. technical status values complete, partial, missing, absent değişmez", () => {
  const statuses = createInitialCheckStatuses(mockClass8A.students);
  assert.equal(statuses.s1, "complete");
  assert.equal(statuses.s2, "complete");

  const updated = updateCheckStatus(statuses, "s1", "missing");
  assert.equal(updated.s1, "missing");
  assert.equal(updated.s2, "complete");

  const partialUpdated = updateCheckStatus(updated, "s2", "partial");
  assert.equal(partialUpdated.s2, "partial");

  const absentUpdated = updateCheckStatus(partialUpdated, "s1", "absent");
  assert.equal(absentUpdated.s1, "absent");
});

// -----------------------------------------------------------------------------
// O & P: Status presentation labels
// -----------------------------------------------------------------------------
test("O. homework labels: Yaptı, Eksik, Yapmadı, Gelmedi", () => {
  assert.deepEqual(getStatusPresentation("Ödev", "complete"), { label: "✓", title: "Yaptı" });
  assert.deepEqual(getStatusPresentation("Ödev", "partial"), { label: "~", title: "Eksik" });
  assert.deepEqual(getStatusPresentation("Ödev", "missing"), { label: "×", title: "Yapmadı" });
  assert.deepEqual(getStatusPresentation("Ödev", "absent"), { label: "G", title: "Gelmedi" });
});

test("P. notebook, book, material labels: Getirdi, Eksik, Getirmedi, Gelmedi", () => {
  for (const checkType of ["Defter", "Kitap", "Materyal"]) {
    assert.deepEqual(getStatusPresentation(checkType, "complete"), { label: "✓", title: "Getirdi" });
    assert.deepEqual(getStatusPresentation(checkType, "partial"), { label: "~", title: "Eksik" });
    assert.deepEqual(getStatusPresentation(checkType, "missing"), { label: "×", title: "Getirmedi" });
    assert.deepEqual(getStatusPresentation(checkType, "absent"), { label: "G", title: "Gelmedi" });
  }
});

// -----------------------------------------------------------------------------
// Q: Quick Check içinde istatistik/participation score gösterilmez
// -----------------------------------------------------------------------------
test("Q. quick-check modülü hiçbir oran, istatistik veya katılım notu üretmez", () => {
  const quickExports = Object.keys({
    createInitialCheckStatuses,
    updateCheckStatus,
    getStatusPresentation,
    getExistingVisitsForWeek,
    getNextVisitIndex,
    isDuplicateSession,
  });
  assert.equal(quickExports.includes("studentStats"), false);
  assert.equal(quickExports.includes("participationScore"), false);
});

// -----------------------------------------------------------------------------
// R: Annual Plan davranışı değişmez
// -----------------------------------------------------------------------------
test("R. Annual Plan calendar ve week yapısı değişmez", () => {
  assert.equal(calendar.schoolYear, "2026-2027");
  assert.equal(typeof calendar.startDate, "string");
  assert.equal(typeof calendar.endDate, "string");
});

// -----------------------------------------------------------------------------
// S: Persistence / deep-clone data safety testleri geçer
// -----------------------------------------------------------------------------
test("S. weekly session deepCloneSession ve validation koruması altındadır", () => {
  const session = createCheckSession(mockClass8A, "Ödev", { s1: "complete" }, "2026-09-28T09:00:00.000Z", () => "s-id", "2026-09-28", 2);
  const cloned = deepCloneSession(session);
  assert.equal(cloned.weekStart, "2026-09-28");
  assert.equal(cloned.visitIndex, 2);
  assert.equal(isValidSession(cloned), true);
});

// -----------------------------------------------------------------------------
// T: Week resolver RAPOR-01 helper'ını kullanır
// -----------------------------------------------------------------------------
test("T. resolveSessionWeekStart doğrudan takvimden Pazartesi çözer", () => {
  const resolved = resolveSessionWeekStart("2026-10-01T10:00:00.000Z", calendar);
  assert.equal(resolved, "2026-09-28");
});
