import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleCache = new Map();

async function importTypeScript(relPath) {
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const filePath = fileUrl.pathname;
  if (moduleCache.has(filePath)) {
    return moduleCache.get(filePath);
  }

  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const importRegex = /import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(importRegex)];

  for (const match of matches) {
    const importPath = match[2];
    const targetRelPath = `app/lib/${importPath.replace(/^\.\//, "")}.ts`;
    await importTypeScript(targetRelPath);
    const targetSource = await readFile(new URL(`../${targetRelPath}`, import.meta.url), "utf8");
    const targetTranspiled = ts.transpileModule(targetSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const targetDataUri = "data:text/javascript;base64," + Buffer.from(targetTranspiled).toString("base64");
    transpiled = transpiled.replace(match[0], `import ${match[1]} from "${targetDataUri}"`);
  }

  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  const mod = await import(dataUri);
  moduleCache.set(filePath, mod);
  return mod;
}

const {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  BACKUP_KEY_PREFIX,
  QUARANTINE_KEY_PREFIX,
  loadSafe,
  saveSafe,
  createVersionedSeedData,
  createLocalRepository,
  isAppData,
} = await importTypeScript("app/lib/storage.ts");

const { CURRENT_SCHEMA_VERSION } = await importTypeScript("app/lib/migrations.ts");

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = [];
  return {
    store,
    calls,
    getItem(key) {
      calls.push({ method: "getItem", key });
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      calls.push({ method: "setItem", key, value });
      store.set(key, String(value));
    },
    removeItem(key) {
      calls.push({ method: "removeItem", key });
      store.delete(key);
    },
  };
}

const validStudent = { id: "s1", name: "Ali Yılmaz", number: 10, active: true };
const validClass = { id: "c1", name: "5-A", students: [validStudent], archived: false };
const validSession = {
  id: "sess1",
  classId: "c1",
  className: "5-A",
  type: "Ödev",
  date: "2026-09-20T09:00:00.000Z",
  statuses: { s1: "complete" },
};
const validV1Data = {
  schemaVersion: 1,
  classes: [validClass],
  sessions: [validSession],
};
const legacyV0Data = {
  classes: [validClass],
  sessions: [validSession],
};

test("A. no active/legacy data -> status empty + versioned seed", () => {
  const storage = createMockStorage();
  const result = loadSafe(storage);
  assert.equal(result.status, "empty");
  assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(Array.isArray(result.data.classes));
  assert.equal(storage.store.size, 0, "empty load must not write anything to storage");
});

test("B. valid current v1 active data -> success", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(validV1Data),
  });
  const result = loadSafe(storage);
  assert.equal(result.status, "success");
  assert.equal(result.sourceKey, STORAGE_KEY);
  assert.equal(result.data.schemaVersion, 1);
  assert.deepEqual(result.data.classes, validV1Data.classes);
});

test("C. legacy v0 active data -> migrated", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(legacyV0Data),
  });
  const result = loadSafe(storage, { now: () => 1700000000000 });
  assert.equal(result.status, "migrated");
  assert.equal(result.data.schemaVersion, 1);
  assert.equal(result.backupKey, `${BACKUP_KEY_PREFIX}1700000000000`);
});

test("D. migrated data gets schemaVersion 1 in active storage", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(legacyV0Data),
  });
  loadSafe(storage, { now: () => 1700000000001 });
  const savedActive = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(savedActive.schemaVersion, 1);
  assert.deepEqual(savedActive.classes, legacyV0Data.classes);
});

test("E. pre-migration exact raw backup created", () => {
  const rawString = JSON.stringify(legacyV0Data);
  const storage = createMockStorage({
    [STORAGE_KEY]: rawString,
  });
  const result = loadSafe(storage, { now: () => 1700000000002 });
  assert.equal(result.status, "migrated");
  const backup = storage.store.get(result.backupKey);
  assert.equal(backup, rawString, "backup must be exact raw string without re-serialization differences");
});

test("F. backup occurs before active overwrite", () => {
  const rawString = JSON.stringify(legacyV0Data);
  const storage = createMockStorage({
    [STORAGE_KEY]: rawString,
  });
  loadSafe(storage, { now: () => 1700000000003 });
  const setItemCalls = storage.calls.filter((c) => c.method === "setItem");
  assert.equal(setItemCalls.length, 2);
  assert.ok(setItemCalls[0].key.startsWith(BACKUP_KEY_PREFIX), "First setItem must be backup");
  assert.equal(setItemCalls[1].key, STORAGE_KEY, "Second setItem must be active key overwrite");
});

test("G. malformed JSON -> quarantined", () => {
  const malformed = "{ invalid json data, missing brackets";
  const storage = createMockStorage({
    [STORAGE_KEY]: malformed,
  });
  const result = loadSafe(storage, { now: () => 1700000000004 });
  assert.equal(result.status, "quarantined");
  assert.equal(result.raw, malformed);
  assert.ok(result.reason.includes("Malformed JSON"));
  assert.equal(storage.store.get(`${QUARANTINE_KEY_PREFIX}1700000000004`), malformed);
});

test("H. malformed raw source remains unchanged", () => {
  const malformed = "{ invalid json syntax !!";
  const storage = createMockStorage({
    [STORAGE_KEY]: malformed,
  });
  loadSafe(storage, { now: () => 1700000000005 });
  assert.equal(storage.store.get(STORAGE_KEY), malformed, "malformed source must not be overwritten or modified");
});

test("I. malformed JSON never writes seedData into active storage", () => {
  const malformed = "BROKEN";
  const storage = createMockStorage({
    [STORAGE_KEY]: malformed,
  });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), "BROKEN");
  assert.doesNotMatch(storage.store.get(STORAGE_KEY), /seed/);
});

test("J. structurally invalid parsed data -> quarantined/failure", () => {
  const invalidData = JSON.stringify({ classes: "not-an-array", sessions: [] });
  const storage = createMockStorage({
    [STORAGE_KEY]: invalidData,
  });
  const result = loadSafe(storage, { now: () => 1700000000006 });
  assert.equal(result.status, "quarantined");
  assert.equal(result.raw, invalidData);
});

test("K. structurally invalid source remains unchanged", () => {
  const invalidData = JSON.stringify({ classes: [{ name: "Missing ID" }], sessions: [] });
  const storage = createMockStorage({
    [STORAGE_KEY]: invalidData,
  });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), invalidData, "invalid data source key must remain unchanged");
});

test("L. future schemaVersion -> future_version", () => {
  const futureData = JSON.stringify({
    schemaVersion: 99,
    classes: [validClass],
    sessions: [validSession],
    futureField: 123,
  });
  const storage = createMockStorage({
    [STORAGE_KEY]: futureData,
  });
  const result = loadSafe(storage);
  assert.equal(result.status, "future_version");
  assert.equal(result.schemaVersion, 99);
});

test("M. future version source is not overwritten", () => {
  const futureData = JSON.stringify({ schemaVersion: 42, classes: [] });
  const storage = createMockStorage({
    [STORAGE_KEY]: futureData,
  });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), futureData);
});

test("N. legacy key is used only when active key absent", () => {
  const activeV1 = { schemaVersion: 1, classes: [{ id: "active", name: "Active", students: [] }], sessions: [] };
  const legacyV0 = { classes: [{ id: "legacy", name: "Legacy", students: [] }], sessions: [] };
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(activeV1),
    [LEGACY_STORAGE_KEY]: JSON.stringify(legacyV0),
  });
  const result = loadSafe(storage);
  assert.equal(result.status, "success");
  assert.equal(result.sourceKey, STORAGE_KEY);
  assert.equal(result.data.classes[0].id, "active");
});

test("O. valid legacy key can migrate to active key", () => {
  const storage = createMockStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify(legacyV0Data),
  });
  const result = loadSafe(storage, { now: () => 1700000000007 });
  assert.equal(result.status, "migrated");
  assert.equal(result.sourceKey, LEGACY_STORAGE_KEY);
  assert.ok(storage.store.has(STORAGE_KEY), "active key must now exist with migrated data");
  const savedActive = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(savedActive.schemaVersion, 1);
});

test("P. legacy source key remains intact after successful migration", () => {
  const rawLegacy = JSON.stringify(legacyV0Data);
  const storage = createMockStorage({
    [LEGACY_STORAGE_KEY]: rawLegacy,
  });
  loadSafe(storage, { now: () => 1700000000008 });
  assert.equal(storage.store.get(LEGACY_STORAGE_KEY), rawLegacy, "legacy source key must not be deleted or modified");
});

test("Q. save success returns success", () => {
  const storage = createMockStorage();
  const result = saveSafe(validV1Data, storage);
  assert.equal(result.status, "success");
  assert.ok(storage.store.has(STORAGE_KEY));
});

test("R. quota failure returns quota_exceeded", () => {
  const failingStorage = {
    getItem() { return null; },
    setItem() {
      const err = new Error("Quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    },
    removeItem() {},
  };
  const result = saveSafe(validV1Data, failingStorage);
  assert.equal(result.status, "quota_exceeded");
  assert.ok(result.error.includes("Quota exceeded"));
});

test("S. generic storage failure is not swallowed", () => {
  const failingStorage = {
    getItem() { return null; },
    setItem() {
      throw new Error("Disk hardware error");
    },
    removeItem() {},
  };
  const result = saveSafe(validV1Data, failingStorage);
  assert.equal(result.status, "error");
  assert.equal(result.error, "Disk hardware error");
});

test("T. migration failure does not overwrite active source", () => {
  const brokenData = JSON.stringify({ classes: [{ id: "" }] });
  const storage = createMockStorage({
    [STORAGE_KEY]: brokenData,
  });
  const result = loadSafe(storage);
  assert.equal(result.status, "quarantined");
  assert.equal(storage.store.get(STORAGE_KEY), brokenData);
});

test("U. failed backup prevents migration overwrite", () => {
  const store = new Map([[STORAGE_KEY, JSON.stringify(legacyV0Data)]]);
  const storageWithFailingBackup = {
    store,
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) {
      if (key.startsWith(BACKUP_KEY_PREFIX)) {
        throw new Error("Cannot write backup to disk");
      }
      store.set(key, value);
    },
    removeItem(key) { store.delete(key); },
  };

  const result = loadSafe(storageWithFailingBackup);
  assert.equal(result.status, "quarantined");
  assert.ok(result.reason.includes("Failed to create pre-migration backup"));
  assert.equal(store.get(STORAGE_KEY), JSON.stringify(legacyV0Data), "Active key must NOT be overwritten when backup fails");
});

test("V. unknown fields still survive storage migration round-trip", () => {
  const legacyWithCustomFields = {
    classes: [
      {
        id: "c1",
        name: "5-A",
        students: [
          { id: "s1", name: "Ali", number: 1, studentCustomProp: "keep-student-prop" },
        ],
        classCustomProp: "keep-class-prop",
      },
    ],
    sessions: [
      {
        id: "sess1",
        classId: "c1",
        className: "5-A",
        type: "Ödev",
        date: "2026-09-20T09:00:00.000Z",
        statuses: { s1: "complete" },
        sessionCustomProp: "keep-session-prop",
      },
    ],
    rootCustomProp: "keep-root-prop",
  };

  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(legacyWithCustomFields),
  });

  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "migrated");
  assert.equal(loadResult.data.rootCustomProp, "keep-root-prop");
  assert.equal(loadResult.data.classes[0].classCustomProp, "keep-class-prop");
  assert.equal(loadResult.data.classes[0].students[0].studentCustomProp, "keep-student-prop");
  assert.equal(loadResult.data.sessions[0].sessionCustomProp, "keep-session-prop");

  // Verify stored JSON round-trip
  const savedActive = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(savedActive.rootCustomProp, "keep-root-prop");
  assert.equal(savedActive.classes[0].classCustomProp, "keep-class-prop");
  assert.equal(savedActive.classes[0].students[0].studentCustomProp, "keep-student-prop");
  assert.equal(savedActive.sessions[0].sessionCustomProp, "keep-session-prop");
});

test("W. isAppData correctly validates v0 and v1 app data", () => {
  assert.equal(isAppData(validV1Data), true);
  assert.equal(isAppData(legacyV0Data), true);
  assert.equal(isAppData({ classes: "invalid" }), false);
});

test("X. createVersionedSeedData returns seed data with CURRENT_SCHEMA_VERSION", () => {
  const seed = createVersionedSeedData();
  assert.equal(seed.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(seed.classes.length > 0);
});

test("Y. quarantined localRepository load activates write-lock", () => {
  const malformed = "{ broken json";
  const storage = createMockStorage({ [STORAGE_KEY]: malformed });
  const repo = createLocalRepository(storage);
  const data = repo.load();
  assert.ok(data);
  assert.equal(repo.isLocked?.(), true, "Repository must be write-locked");
});

test("Z. save after quarantined load does not overwrite source", () => {
  const malformed = "{ broken json";
  const storage = createMockStorage({ [STORAGE_KEY]: malformed });
  const repo = createLocalRepository(storage);
  const fallback = repo.load();
  repo.save(fallback);
  assert.equal(storage.store.get(STORAGE_KEY), malformed, "Source in storage must remain malformed without being overwritten");
});

test("AA. future_version localRepository load activates write-lock", () => {
  const futureData = JSON.stringify({ schemaVersion: 99, classes: [] });
  const storage = createMockStorage({ [STORAGE_KEY]: futureData });
  const repo = createLocalRepository(storage);
  repo.load();
  assert.equal(repo.isLocked?.(), true, "Future version must activate write-lock");
});

test("AB. save after future_version does not overwrite source", () => {
  const futureData = JSON.stringify({ schemaVersion: 99, classes: [] });
  const storage = createMockStorage({ [STORAGE_KEY]: futureData });
  const repo = createLocalRepository(storage);
  const fallback = repo.load();
  repo.save(fallback);
  assert.equal(storage.store.get(STORAGE_KEY), futureData, "Future version source must not be overwritten");
});

test("AC. storage_unavailable activates write-lock", () => {
  const failingStorage = {
    getItem() { throw new Error("SecurityError: Access Denied"); },
    setItem() {},
    removeItem() {},
  };
  const repo = createLocalRepository(failingStorage);
  repo.load();
  assert.equal(repo.isLocked?.(), true, "Unavailable storage must activate write-lock");
});

test("AD. successful load clears previous write-lock", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: "{ malformed" });
  const repo = createLocalRepository(storage);
  repo.load();
  assert.equal(repo.isLocked?.(), true, "Initially locked on malformed data");

  storage.store.set(STORAGE_KEY, JSON.stringify(validV1Data));
  repo.load();
  assert.equal(repo.isLocked?.(), false, "Lock must be cleared after successful load");

  const updatedData = { ...validV1Data, classes: [{ id: "new-c", name: "6-A", students: [] }] };
  repo.save(updatedData);
  const saved = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(saved.classes[0].id, "new-c");
});

test("AE. migrated load allows subsequent safe save", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify(legacyV0Data) });
  const repo = createLocalRepository(storage);
  const data = repo.load();
  assert.equal(repo.isLocked?.(), false, "Migrated load must NOT be locked");

  const modified = { ...data, classes: [...data.classes, { id: "c-added", name: "7-A", students: [] }] };
  repo.save(modified);
  const saved = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(saved.classes.length, 2);
  assert.equal(saved.schemaVersion, 1);
});

test("AF. empty/new-install load allows first save", () => {
  const storage = createMockStorage();
  const repo = createLocalRepository(storage);
  const data = repo.load();
  assert.equal(repo.isLocked?.(), false, "Empty load must NOT be locked");

  repo.save(data);
  assert.ok(storage.store.has(STORAGE_KEY), "Empty install must allow saving initial data");
  const saved = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(saved.schemaVersion, 1);
});

test("AG. write-lock state does not leak incorrectly across successful reload", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 99 }) });
  const repo = createLocalRepository(storage);
  repo.load();
  assert.equal(repo.isLocked?.(), true);

  storage.store.set(STORAGE_KEY, JSON.stringify(validV1Data));
  const data = repo.load();
  assert.equal(repo.isLocked?.(), false);
  assert.deepEqual(data.classes, validV1Data.classes);
});
