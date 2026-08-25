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
  createVersionedSeedData,
  loadSafe,
  saveSafe,
  createLocalRepository,
  resolveAppLoadDecision,
  prepareEmergencyExport,
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
      calls.push({ method: "setItem", key, value: String(value) });
      store.set(key, String(value));
    },
    removeItem(key) {
      calls.push({ method: "removeItem", key });
      store.delete(key);
    },
    getAllKeys() {
      return Array.from(store.keys());
    },
  };
}

const sampleStudent = { id: "s1", name: "Zeynep Çelik", number: 101, active: true };
const sampleClass = { id: "c1", name: "6-B", students: [sampleStudent], archived: false };
const sampleSession = {
  id: "sess1",
  classId: "c1",
  className: "6-B",
  type: "Ödev",
  date: "2026-10-12T08:30:00.000Z",
  statuses: { s1: "complete" },
};
const sampleAnnualPlan = [
  {
    id: "plan-1",
    classId: "c1",
    schoolYear: "2026-2027",
    weekStart: "2026-09-08",
    topic: "Güneş Sistemi ve Tutulmalar",
    note: "Öğrencilere teleskop tanıtıldı.",
    completed: true,
  },
];

// ==========================================
// SCENARIOS A through R
// ==========================================

test("SCENARIO A — First Install: empty storage initializes safely, saves, and reloads", () => {
  const storage = createMockStorage();

  // 1. Initial load on clean machine
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "empty");
  assert.equal(loadResult.data.schemaVersion, CURRENT_SCHEMA_VERSION);

  // 2. Resolve UI state
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "ready");
  assert.equal(decision.writable, true);

  // 3. User modifies data and saves
  const modifiedData = {
    ...decision.data,
    classes: [sampleClass],
    sessions: [sampleSession],
  };
  const saveResult = saveSafe(modifiedData, storage);
  assert.equal(saveResult.status, "success");
  assert.ok(storage.store.has(STORAGE_KEY));

  // 4. Subsequent reload
  const reloadResult = loadSafe(storage);
  assert.equal(reloadResult.status, "success");
  assert.equal(reloadResult.data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(reloadResult.data.classes.length, 1);
  assert.equal(reloadResult.data.classes[0].name, "6-B");
});

test("SCENARIO B — Current V1 Normal Session: load, edit, save, reload with complete fidelity", () => {
  const initialData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    classes: [sampleClass],
    sessions: [sampleSession],
    annualPlanEntries: sampleAnnualPlan,
    extraCustomMeta: "custom-meta-value",
  };
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(initialData),
  });

  // 1. Load
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "success");
  assert.equal(loadResult.data.extraCustomMeta, "custom-meta-value");

  // 2. Edit
  const updatedData = {
    ...loadResult.data,
    classes: [
      {
        ...sampleClass,
        students: [
          sampleStudent,
          { id: "s2", name: "Can Demir", number: 102, active: true },
        ],
      },
    ],
  };

  // 3. Save
  const saveResult = saveSafe(updatedData, storage);
  assert.equal(saveResult.status, "success");

  // 4. Reload
  const reloadResult = loadSafe(storage);
  assert.equal(reloadResult.status, "success");
  assert.equal(reloadResult.data.classes[0].students.length, 2);
  assert.equal(reloadResult.data.extraCustomMeta, "custom-meta-value");
  assert.deepEqual(reloadResult.data.annualPlanEntries, sampleAnnualPlan);
});

test("SCENARIO C — Active V0 Migration: exact raw pre-migration backup before active overwrite", () => {
  const v0Raw = JSON.stringify({
    classes: [sampleClass],
    sessions: [sampleSession],
    customV0Field: "survives-migration",
  });
  const storage = createMockStorage({
    [STORAGE_KEY]: v0Raw,
  });

  const nowTimestamp = 1700000001000;
  const loadResult = loadSafe(storage, { now: () => nowTimestamp });

  // 1. Verify migration result
  assert.equal(loadResult.status, "migrated");
  assert.equal(loadResult.backupKey, `${BACKUP_KEY_PREFIX}${nowTimestamp}`);

  // 2. Verify backup is EXACT v0 raw string
  assert.equal(storage.store.get(loadResult.backupKey), v0Raw);

  // 3. Verify active storage is now v1 with schemaVersion 1
  const activeSaved = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(activeSaved.schemaVersion, 1);
  assert.equal(activeSaved.customV0Field, "survives-migration");
  assert.equal(activeSaved.classes[0].name, "6-B");

  // 4. Reload succeeds without re-migrating
  const reloadResult = loadSafe(storage);
  assert.equal(reloadResult.status, "success");
  assert.equal(reloadResult.data.classes[0].students[0].name, "Zeynep Çelik");
});

test("SCENARIO D — Legacy Key Migration: migrates from legacy key, creates v1 active key, preserves legacy key", () => {
  const legacyRaw = JSON.stringify({
    classes: [sampleClass],
    sessions: [sampleSession],
    legacyNote: "from-okul-takip",
  });
  const storage = createMockStorage({
    [LEGACY_STORAGE_KEY]: legacyRaw,
  });

  const nowTimestamp = 1700000002000;
  const loadResult = loadSafe(storage, { now: () => nowTimestamp });

  assert.equal(loadResult.status, "migrated");
  // Legacy key must remain untouched
  assert.equal(storage.store.get(LEGACY_STORAGE_KEY), legacyRaw);
  // Pre-migration backup must be created
  assert.equal(storage.store.get(loadResult.backupKey), legacyRaw);
  // Active key must now have v1 data
  assert.ok(storage.store.has(STORAGE_KEY));
  const activeSaved = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(activeSaved.schemaVersion, 1);
  assert.equal(activeSaved.legacyNote, "from-okul-takip");

  // Subsequent load must prefer active key directly
  const secondLoad = loadSafe(storage);
  assert.equal(secondLoad.status, "success");
  assert.equal(secondLoad.sourceKey, STORAGE_KEY);
});

test("SCENARIO E — Malformed JSON: quarantined, untouched source, write-locked UI, emergency export preserves malformed raw", () => {
  const malformedRaw = "{\n  \"classes\": [ INVALID_JSON_CONTENT :::";
  const storage = createMockStorage({
    [STORAGE_KEY]: malformedRaw,
  });

  const nowTimestamp = 1700000003000;
  const loadResult = loadSafe(storage, { now: () => nowTimestamp });

  // 1. Quarantined status
  assert.equal(loadResult.status, "quarantined");
  assert.equal(loadResult.raw, malformedRaw);

  // 2. Source is 100% untouched
  assert.equal(storage.store.get(STORAGE_KEY), malformedRaw);

  // 3. Quarantine copy created with exact raw
  assert.equal(storage.store.get(loadResult.quarantineKey), malformedRaw);

  // 4. UI load decision is non-writable
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "quarantined");
  assert.equal(decision.writable, false);

  // 5. Emergency export generates .txt with exact raw content
  const exportDesc = prepareEmergencyExport({ raw: decision.loadState.raw ?? "", type: "quarantine" });
  assert.equal(exportDesc.content, malformedRaw);
  assert.equal(exportDesc.isValidJson, false);
  assert.ok(exportDesc.filename.endsWith(".txt"));

  // 6. Source remains unmodified after export
  assert.equal(storage.store.get(STORAGE_KEY), malformedRaw);
});

test("SCENARIO F — Structurally Invalid Data: quarantined, source untouched, no fake data or seed synthesized", () => {
  const invalidStructuralRaw = JSON.stringify({
    classes: "this-should-be-an-array-not-a-string",
    sessions: null,
  });
  const storage = createMockStorage({
    [STORAGE_KEY]: invalidStructuralRaw,
  });

  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "quarantined");
  // Source is 100% untouched and NOT replaced with seed data
  assert.equal(storage.store.get(STORAGE_KEY), invalidStructuralRaw);

  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.writable, false);
});

test("SCENARIO G — Future Version: preserves odd whitespace, locks writes, creates no backup, exports exact string without reformatting", () => {
  const oddFutureRaw = `{\n    "schemaVersion": 999,\n    "futureCapabilities": [ "quantum", 42 ]\n}`;
  const storage = createMockStorage({
    [STORAGE_KEY]: oddFutureRaw,
  });

  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "future_version");
  assert.equal(loadResult.schemaVersion, 999);
  assert.equal(loadResult.raw, oddFutureRaw);

  // Source untouched, no backup overwritten or created
  assert.equal(storage.store.get(STORAGE_KEY), oddFutureRaw);
  const backupKeys = storage.getAllKeys().filter((k) => k.startsWith(BACKUP_KEY_PREFIX));
  assert.equal(backupKeys.length, 0, "No backup key should be created for future-version data");

  // Decision carries exact raw and is non-writable
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "future_version");
  assert.equal(decision.writable, false);
  if (decision.loadState.status === "future_version") {
    assert.equal(decision.loadState.raw, oddFutureRaw);
  }

  // Emergency export produces exact string without JSON.stringify reformatting
  const exportDesc = prepareEmergencyExport({ raw: decision.loadState.raw ?? "", type: "backup" });
  assert.equal(exportDesc.content, oddFutureRaw);
  assert.equal(exportDesc.isValidJson, true);
  assert.ok(exportDesc.filename.endsWith(".json"));
});

test("SCENARIO H — Backup Rotation: retains newest 3 backups, removes older ones, preserves other keys", () => {
  const storage = createMockStorage({
    [`${BACKUP_KEY_PREFIX}100`]: "backup-1",
    [`${BACKUP_KEY_PREFIX}200`]: "backup-2",
    [`${BACKUP_KEY_PREFIX}300`]: "backup-3",
    [`${QUARANTINE_KEY_PREFIX}999`]: "quarantined-item",
    [LEGACY_STORAGE_KEY]: "legacy-data",
    [STORAGE_KEY]: JSON.stringify({ classes: [sampleClass], sessions: [] }),
  });

  // Migrating triggers 4th backup at timestamp 400
  const loadResult = loadSafe(storage, { now: () => 400 });
  assert.equal(loadResult.status, "migrated");

  // Newest 3 (400, 300, 200) kept, oldest (100) pruned
  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}400`));
  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}300`));
  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}200`));
  assert.ok(!storage.store.has(`${BACKUP_KEY_PREFIX}100`));

  // Quarantine, legacy, and active keys must never be pruned
  assert.ok(storage.store.has(`${QUARANTINE_KEY_PREFIX}999`));
  assert.ok(storage.store.has(LEGACY_STORAGE_KEY));
  assert.ok(storage.store.has(STORAGE_KEY));
});

test("SCENARIO I — Rotation Failure: prune error does NOT rollback active migrated data", () => {
  const store = new Map([
    [`${BACKUP_KEY_PREFIX}100`, "b1"],
    [`${BACKUP_KEY_PREFIX}200`, "b2"],
    [`${BACKUP_KEY_PREFIX}300`, "b3"],
    [STORAGE_KEY, JSON.stringify({ classes: [sampleClass], sessions: [] })],
  ]);

  const storageWithFailingRemove = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) {
      if (k.startsWith(BACKUP_KEY_PREFIX)) {
        throw new Error("Cannot delete backup file");
      }
      store.delete(k);
    },
    getAllKeys() { return Array.from(store.keys()); },
  };

  const loadResult = loadSafe(storageWithFailingRemove, { now: () => 400 });
  assert.equal(loadResult.status, "migrated");

  // Active v1 data MUST be saved and intact
  const activeSaved = JSON.parse(store.get(STORAGE_KEY));
  assert.equal(activeSaved.schemaVersion, 1);
  assert.equal(activeSaved.classes[0].name, "6-B");
});

test("SCENARIO J — Backup Write Failure: throws on backup setItem, active source is NOT overwritten", () => {
  const v0Raw = JSON.stringify({ classes: [sampleClass], sessions: [] });
  const store = new Map([[STORAGE_KEY, v0Raw]]);
  const writtenKeys = [];

  const storageWithFailingBackup = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) {
      writtenKeys.push(k);
      if (k.startsWith(BACKUP_KEY_PREFIX)) {
        throw new Error("Quota full when creating backup");
      }
      store.set(k, v);
    },
    removeItem(k) { store.delete(k); },
    getAllKeys() { return Array.from(store.keys()); },
  };

  const loadResult = loadSafe(storageWithFailingBackup);
  assert.equal(loadResult.status, "quarantined");
  assert.ok(loadResult.reason.includes("Failed to create pre-migration backup"));

  // Active source MUST remain exact original v0 raw string
  assert.equal(store.get(STORAGE_KEY), v0Raw);
  assert.ok(!writtenKeys.includes(STORAGE_KEY), "Active storage key must never be written if backup fails");
});

test("SCENARIO K — Active Write Failure After Backup: failure is explicitly returned and data loss is prevented", () => {
  const v0Raw = JSON.stringify({ classes: [sampleClass], sessions: [] });
  const store = new Map([[STORAGE_KEY, v0Raw]]);

  const storageWithFailingActiveWrite = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) {
      if (k === STORAGE_KEY && v.includes(`"schemaVersion":1`)) {
        throw new Error("Disk write failure during active save");
      }
      store.set(k, v);
    },
    removeItem(k) { store.delete(k); },
    getAllKeys() { return Array.from(store.keys()); },
  };

  const nowTimestamp = 1700000005000;
  const loadResult = loadSafe(storageWithFailingActiveWrite, { now: () => nowTimestamp });

  // Failure is explicitly quarantined, NOT falsely marked as migrated
  assert.equal(loadResult.status, "quarantined");
  assert.ok(loadResult.reason.includes("Failed to write migrated data to active storage"));

  // Backup was created, so user has safe exact raw copy preserved
  assert.equal(store.get(`${BACKUP_KEY_PREFIX}${nowTimestamp}`), v0Raw);

  // Original active v0 source remains intact in storage
  assert.equal(store.get(STORAGE_KEY), v0Raw);
});


test("SCENARIO L — Quota Exceeded Save: explicit quota_exceeded returned, last valid data preserved", () => {
  const initialData = {
    schemaVersion: 1,
    classes: [sampleClass],
    sessions: [],
  };
  const initialRaw = JSON.stringify(initialData);
  const store = new Map([[STORAGE_KEY, initialRaw]]);

  const quotaFullStorage = {
    getItem(k) { return store.get(k) ?? null; },
    setItem() {
      const quotaErr = new Error("Quota exceeded");
      quotaErr.name = "QuotaExceededError";
      quotaErr.code = 22;
      throw quotaErr;
    },
    removeItem(k) { store.delete(k); },
  };

  const saveResult = saveSafe({ ...initialData, classes: [] }, quotaFullStorage);
  assert.equal(saveResult.status, "quota_exceeded");
  // Storage remains in previous good state
  assert.equal(store.get(STORAGE_KEY), initialRaw);
});

test("SCENARIO M — Generic Save Failure: exception is not swallowed, previous data preserved", () => {
  const initialRaw = JSON.stringify({ schemaVersion: 1, classes: [sampleClass], sessions: [] });
  const store = new Map([[STORAGE_KEY, initialRaw]]);

  const failingStorage = {
    getItem(k) { return store.get(k) ?? null; },
    setItem() { throw new Error("Unexpected I/O error"); },
    removeItem(k) { store.delete(k); },
  };

  const saveResult = saveSafe({ schemaVersion: 1, classes: [], sessions: [] }, failingStorage);
  assert.equal(saveResult.status, "error");
  assert.ok(saveResult.error.includes("Unexpected I/O error"));
  assert.equal(store.get(STORAGE_KEY), initialRaw);
});

test("SCENARIO N — Storage Unavailable: SecurityError on load causes non-writable safe state without crash", () => {
  const blockedStorage = {
    getItem() {
      const err = new Error("The operation is insecure");
      err.name = "SecurityError";
      throw err;
    },
    setItem() { throw new Error("Access denied"); },
    removeItem() {},
  };

  const loadResult = loadSafe(blockedStorage);
  assert.equal(loadResult.status, "storage_unavailable");

  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "storage_unavailable");
  assert.equal(decision.writable, false);
});

test("SCENARIO O — Unknown Field Survival: root and deep nested unknown fields survive migration, save, and reload", () => {
  const v0DataWithUnknowns = {
    rootCustomMetadata: { author: "Teacher", build: 42 },
    classes: [
      {
        ...sampleClass,
        customClassFlag: "vip-class",
        students: [
          {
            ...sampleStudent,
            customStudentTag: "prefers-front-row",
          },
        ],
      },
    ],
    sessions: [
      {
        ...sampleSession,
        customSessionTelemetry: { durationMinutes: 45 },
      },
    ],
    workCalendar: {
      schoolYear: "2026-2027",
      startDate: "2026-09-08",
      endDate: "2027-06-18",
      customCalendarConfig: { useMaarif: true },
      breaks: [
        {
          id: "b1",
          title: "Ara Tatil",
          startDate: "2026-11-09",
          endDate: "2026-11-13",
          customBreakFlag: true,
        },
      ],
    },
    annualPlanEntries: [
      {
        ...sampleAnnualPlan[0],
        customPlanField: "extra-pedagogical-note",
      },
    ],
  };

  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(v0DataWithUnknowns),
  });

  // 1. Migrate
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "migrated");

  // 2. Save
  const saveResult = saveSafe(loadResult.data, storage);
  assert.equal(saveResult.status, "success");

  // 3. Reload and verify deep preservation
  const reloadResult = loadSafe(storage);
  assert.equal(reloadResult.status, "success");
  const reloaded = reloadResult.data;

  assert.deepEqual(reloaded.rootCustomMetadata, { author: "Teacher", build: 42 });
  assert.equal(reloaded.classes[0].customClassFlag, "vip-class");
  assert.equal(reloaded.classes[0].students[0].customStudentTag, "prefers-front-row");
  assert.deepEqual(reloaded.sessions[0].customSessionTelemetry, { durationMinutes: 45 });
  assert.deepEqual(reloaded.workCalendar.customCalendarConfig, { useMaarif: true });
  assert.equal(reloaded.workCalendar.breaks[0].customBreakFlag, true);
  assert.equal(reloaded.annualPlanEntries[0].customPlanField, "extra-pedagogical-note");
});

test("SCENARIO P — Manual Annual Plan Data: manual entries survive migration, save, and reload intact", () => {
  const manualPlanEntry = {
    id: "plan-manual-1",
    classId: "c1",
    schoolYear: "2026-2027",
    weekStart: "2026-10-05",
    topic: "Kuvvet ve Hareket Deneyi",
    note: "Öğrenciler dinamometre ile ölçüm yaptı.",
    completed: true,
  };

  const v0Data = {
    classes: [sampleClass],
    sessions: [],
    annualPlanEntries: [manualPlanEntry],
  };

  const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify(v0Data) });
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "migrated");

  const saveResult = saveSafe(loadResult.data, storage);
  assert.equal(saveResult.status, "success");

  const reloadResult = loadSafe(storage);
  assert.equal(reloadResult.status, "success");
  assert.equal(reloadResult.data.annualPlanEntries.length, 1);
  assert.equal(reloadResult.data.annualPlanEntries[0].topic, "Kuvvet ve Hareket Deneyi");
  assert.equal(reloadResult.data.annualPlanEntries[0].note, "Öğrenciler dinamometre ile ölçüm yaptı.");
  assert.equal(reloadResult.data.annualPlanEntries[0].completed, true);
});

test("SCENARIO Q — Repository Write Lock: malformed load locks writes, subsequent valid load unlocks safely", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: "{ malformed json :::",
  });
  const repo = createLocalRepository(storage);

  // 1. Malformed load locks repository
  repo.load();
  assert.equal(repo.isLocked(), true);

  // 2. Save attempt is blocked, does NOT overwrite source
  repo.save(createVersionedSeedData());
  assert.equal(storage.store.get(STORAGE_KEY), "{ malformed json :::");

  // 3. Inject valid v1 data and reload
  const validV1 = { schemaVersion: 1, classes: [sampleClass], sessions: [] };
  storage.store.set(STORAGE_KEY, JSON.stringify(validV1));
  const validLoad = repo.load();
  assert.equal(validLoad.classes.length, 1);
  assert.equal(repo.isLocked(), false);

  // 4. Save is now allowed
  const updatedData = { ...validLoad, classes: [] };
  repo.save(updatedData);
  const reloaded = JSON.parse(storage.store.get(STORAGE_KEY));
  assert.equal(reloaded.classes.length, 0);
});

test("SCENARIO R — Repeated Reload Stability: multiple load/save/reload cycles maintain schema and data determinism", () => {
  const initialData = {
    schemaVersion: 1,
    classes: [sampleClass],
    sessions: [sampleSession],
    annualPlanEntries: sampleAnnualPlan,
  };
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(initialData),
  });

  for (let cycle = 1; cycle <= 5; cycle++) {
    const loaded = loadSafe(storage);
    assert.equal(loaded.status, "success");
    assert.equal(loaded.data.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(loaded.data.classes.length, 1);
    assert.equal(loaded.data.sessions.length, 1);
    assert.equal(loaded.data.annualPlanEntries.length, 1);

    const saved = saveSafe(loaded.data, storage);
    assert.equal(saved.status, "success");
  }

  // Backup count must not increase during regular v1 cycles
  const allKeys = storage.getAllKeys();
  const backupKeys = allKeys.filter((k) => k.startsWith(BACKUP_KEY_PREFIX));
  assert.equal(backupKeys.length, 0, "No backup should be created on standard v1 reads/saves");
});

// ==========================================
// 10 EXPLICIT INVARIANT TESTS
// ==========================================

test("INVARIANT 1: Invalid source data must never be replaced by seed data in storage", () => {
  const corrupted = "corrupted string";
  const storage = createMockStorage({ [STORAGE_KEY]: corrupted });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), corrupted);
});

test("INVARIANT 2: Future-version data must never be downgraded", () => {
  const futureRaw = JSON.stringify({ schemaVersion: 200 });
  const storage = createMockStorage({ [STORAGE_KEY]: futureRaw });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), futureRaw);
});

test("INVARIANT 3: Migration source must be backed up before overwrite", () => {
  const v0Raw = JSON.stringify({ classes: [sampleClass], sessions: [] });
  const log = [];
  const trackedStorage = {
    store: new Map([[STORAGE_KEY, v0Raw]]),
    getItem(k) { return this.store.get(k) ?? null; },
    setItem(k, v) {
      log.push({ key: k, value: v });
      this.store.set(k, v);
    },
    removeItem(k) { this.store.delete(k); },
    getAllKeys() { return Array.from(this.store.keys()); },
  };
  loadSafe(trackedStorage, { now: () => 12345 });
  const backupIndex = log.findIndex((item) => item.key.startsWith(BACKUP_KEY_PREFIX));
  const activeWriteIndex = log.findIndex((item) => item.key === STORAGE_KEY);
  assert.ok(backupIndex !== -1 && activeWriteIndex !== -1);
  assert.ok(backupIndex < activeWriteIndex, "Backup MUST precede active storage overwrite");
});

test("INVARIANT 4: Failed backup prevents migration overwrite", () => {
  const v0Raw = JSON.stringify({ classes: [sampleClass], sessions: [] });
  const store = new Map([[STORAGE_KEY, v0Raw]]);
  const failingBackupStorage = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) {
      if (k.startsWith(BACKUP_KEY_PREFIX)) throw new Error("Disk write protected");
      store.set(k, v);
    },
    removeItem(k) { store.delete(k); },
    getAllKeys() { return Array.from(store.keys()); },
  };
  loadSafe(failingBackupStorage);
  assert.equal(store.get(STORAGE_KEY), v0Raw);
});

test("INVARIANT 5: Quarantine source remains untouched", () => {
  const malformed = "{ broken";
  const storage = createMockStorage({ [STORAGE_KEY]: malformed });
  loadSafe(storage);
  assert.equal(storage.store.get(STORAGE_KEY), malformed);
});

test("INVARIANT 6: Unknown fields survive supported migration", () => {
  const v0 = { classes: [sampleClass], sessions: [], futureTelemetry: 999 };
  const storage = createMockStorage({ [STORAGE_KEY]: JSON.stringify(v0) });
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.data.futureTelemetry, 999);
});

test("INVARIANT 7: Non-writable UI states cannot persist data", () => {
  const result = { status: "quarantined", raw: "{ broken", reason: "err", sourceKey: STORAGE_KEY };
  const decision = resolveAppLoadDecision(result);
  assert.equal(decision.writable, false);
});

test("INVARIANT 8: Export never mutates source storage", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: "test-raw" });
  prepareEmergencyExport({ raw: storage.store.get(STORAGE_KEY), type: "backup" });
  assert.equal(storage.store.get(STORAGE_KEY), "test-raw");
});

test("INVARIANT 9: Rotation never deletes active, legacy, quarantine, or unrelated keys", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: "act",
    [LEGACY_STORAGE_KEY]: "leg",
    [`${QUARANTINE_KEY_PREFIX}1`]: "q1",
    "unrelated-key": "unrelated",
    [`${BACKUP_KEY_PREFIX}100`]: "b1",
    [`${BACKUP_KEY_PREFIX}200`]: "b2",
    [`${BACKUP_KEY_PREFIX}300`]: "b3",
  });
  loadSafe(storage, { now: () => 400 });
  assert.ok(storage.store.has(STORAGE_KEY));
  assert.ok(storage.store.has(LEGACY_STORAGE_KEY));
  assert.ok(storage.store.has(`${QUARANTINE_KEY_PREFIX}1`));
  assert.ok(storage.store.has("unrelated-key"));
});

test("INVARIANT 10: Save errors are explicit and never fake success", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("Storage IO error"); },
    removeItem() {},
  };
  const result = saveSafe(createVersionedSeedData(), storage);
  assert.notEqual(result.status, "success");
  assert.equal(result.status, "error");
});
