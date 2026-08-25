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
  getBackupRotationPlan,
  pruneOldBackups,
  prepareEmergencyExport,
  loadSafe,
  resolveAppLoadDecision,
} = await importTypeScript("app/lib/storage.ts");

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
    getAllKeys() {
      return Array.from(store.keys());
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
const legacyV0Data = {
  classes: [validClass],
  sessions: [validSession],
};

test("A. 0 backups -> nothing removed", () => {
  const plan = getBackupRotationPlan([], 3);
  assert.deepEqual(plan.keep, []);
  assert.deepEqual(plan.delete, []);
});

test("B. <=3 backups -> none removed", () => {
  const keys = [
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}200`,
    `${BACKUP_KEY_PREFIX}300`,
  ];
  const plan = getBackupRotationPlan(keys, 3);
  assert.equal(plan.delete.length, 0);
  assert.equal(plan.keep.length, 3);
});

test("C. 4 backups -> oldest removed", () => {
  const keys = [
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}200`,
    `${BACKUP_KEY_PREFIX}300`,
    `${BACKUP_KEY_PREFIX}400`,
  ];
  const plan = getBackupRotationPlan(keys, 3);
  assert.deepEqual(plan.delete, [`${BACKUP_KEY_PREFIX}100`]);
  assert.deepEqual(plan.keep, [
    `${BACKUP_KEY_PREFIX}400`,
    `${BACKUP_KEY_PREFIX}300`,
    `${BACKUP_KEY_PREFIX}200`,
  ]);
});

test("D. 5 backups -> oldest two removed", () => {
  const keys = [
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}200`,
    `${BACKUP_KEY_PREFIX}300`,
    `${BACKUP_KEY_PREFIX}400`,
    `${BACKUP_KEY_PREFIX}500`,
  ];
  const plan = getBackupRotationPlan(keys, 3);
  assert.deepEqual(plan.delete, [`${BACKUP_KEY_PREFIX}200`, `${BACKUP_KEY_PREFIX}100`]);
  assert.deepEqual(plan.keep, [
    `${BACKUP_KEY_PREFIX}500`,
    `${BACKUP_KEY_PREFIX}400`,
    `${BACKUP_KEY_PREFIX}300`,
  ]);
});

test("E. numeric timestamp sorting is correct", () => {
  const keys = [
    `${BACKUP_KEY_PREFIX}90`,
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}10`,
    `${BACKUP_KEY_PREFIX}20`,
  ];
  const plan = getBackupRotationPlan(keys, 2);
  assert.deepEqual(plan.keep, [`${BACKUP_KEY_PREFIX}100`, `${BACKUP_KEY_PREFIX}90`]);
  assert.deepEqual(plan.delete, [`${BACKUP_KEY_PREFIX}20`, `${BACKUP_KEY_PREFIX}10`]);
});

test("F. unrelated localStorage keys ignored", () => {
  const keys = [
    "theme-settings",
    "user-profile",
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}200`,
  ];
  const plan = getBackupRotationPlan(keys, 3);
  assert.deepEqual(plan.delete, []);
  assert.deepEqual(plan.keep, [`${BACKUP_KEY_PREFIX}200`, `${BACKUP_KEY_PREFIX}100`]);
});

test("G. active STORAGE_KEY never removed", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: "{ active: true }",
    [`${BACKUP_KEY_PREFIX}100`]: "b1",
    [`${BACKUP_KEY_PREFIX}200`]: "b2",
    [`${BACKUP_KEY_PREFIX}300`]: "b3",
    [`${BACKUP_KEY_PREFIX}400`]: "b4",
  });
  const result = pruneOldBackups(storage, 3);
  assert.equal(result.status, "success");
  assert.ok(storage.store.has(STORAGE_KEY));
  assert.equal(storage.store.get(STORAGE_KEY), "{ active: true }");
});

test("H. legacy key never removed", () => {
  const storage = createMockStorage({
    [LEGACY_STORAGE_KEY]: "{ legacy: true }",
    [`${BACKUP_KEY_PREFIX}100`]: "b1",
    [`${BACKUP_KEY_PREFIX}200`]: "b2",
    [`${BACKUP_KEY_PREFIX}300`]: "b3",
    [`${BACKUP_KEY_PREFIX}400`]: "b4",
  });
  const result = pruneOldBackups(storage, 3);
  assert.equal(result.status, "success");
  assert.ok(storage.store.has(LEGACY_STORAGE_KEY));
});

test("I. quarantine keys never removed", () => {
  const qKey = `${QUARANTINE_KEY_PREFIX}123456`;
  const storage = createMockStorage({
    [qKey]: "corrupted data",
    [`${BACKUP_KEY_PREFIX}100`]: "b1",
    [`${BACKUP_KEY_PREFIX}200`]: "b2",
    [`${BACKUP_KEY_PREFIX}300`]: "b3",
    [`${BACKUP_KEY_PREFIX}400`]: "b4",
  });
  const result = pruneOldBackups(storage, 3);
  assert.equal(result.status, "success");
  assert.ok(storage.store.has(qKey));
  assert.equal(storage.store.get(qKey), "corrupted data");
});

test("J. malformed backup suffix not accidentally deleted", () => {
  const malformedKey = `${BACKUP_KEY_PREFIX}invalid-timestamp`;
  const plan = getBackupRotationPlan([
    malformedKey,
    `${BACKUP_KEY_PREFIX}100`,
    `${BACKUP_KEY_PREFIX}200`,
    `${BACKUP_KEY_PREFIX}300`,
    `${BACKUP_KEY_PREFIX}400`,
  ], 3);
  assert.ok(plan.keep.includes(malformedKey), "Malformed backup suffix must be safely preserved in keep list");
  assert.ok(!plan.delete.includes(malformedKey));
});

test("K. newest backup always retained", () => {
  const keys = [
    `${BACKUP_KEY_PREFIX}10`,
    `${BACKUP_KEY_PREFIX}20`,
    `${BACKUP_KEY_PREFIX}30`,
    `${BACKUP_KEY_PREFIX}999999`,
  ];
  const plan = getBackupRotationPlan(keys, 1);
  assert.deepEqual(plan.keep, [`${BACKUP_KEY_PREFIX}999999`]);
});

test("L. removeItem failure returns explicit failure", () => {
  const store = new Map([
    [`${BACKUP_KEY_PREFIX}100`, "b1"],
    [`${BACKUP_KEY_PREFIX}200`, "b2"],
    [`${BACKUP_KEY_PREFIX}300`, "b3"],
    [`${BACKUP_KEY_PREFIX}400`, "b4"],
  ]);
  const failingStorage = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) {
      if (k === `${BACKUP_KEY_PREFIX}100`) {
        throw new Error("Disk lock preventing removal");
      }
      store.delete(k);
    },
    getAllKeys() { return Array.from(store.keys()); },
  };

  const result = pruneOldBackups(failingStorage, 3);
  assert.equal(result.status, "error");
  assert.ok(result.error.includes("Disk lock preventing removal"));
});

test("M. successful migration can invoke rotation after active write", () => {
  const storage = createMockStorage({
    [`${BACKUP_KEY_PREFIX}100`]: "old-b1",
    [`${BACKUP_KEY_PREFIX}200`]: "old-b2",
    [`${BACKUP_KEY_PREFIX}300`]: "old-b3",
    [STORAGE_KEY]: JSON.stringify(legacyV0Data),
  });

  const result = loadSafe(storage, { now: () => 400 });
  assert.equal(result.status, "migrated");
  assert.equal(result.backupKey, `${BACKUP_KEY_PREFIX}400`);

  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}400`));
  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}300`));
  assert.ok(storage.store.has(`${BACKUP_KEY_PREFIX}200`));
  assert.ok(!storage.store.has(`${BACKUP_KEY_PREFIX}100`));
});

test("N. rotation failure does not rollback migrated active data", () => {
  const store = new Map([
    [`${BACKUP_KEY_PREFIX}100`, "b1"],
    [`${BACKUP_KEY_PREFIX}200`, "b2"],
    [`${BACKUP_KEY_PREFIX}300`, "b3"],
    [STORAGE_KEY, JSON.stringify(legacyV0Data)],
  ]);

  const storageWithFailingPrune = {
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) {
      if (k.startsWith(BACKUP_KEY_PREFIX)) {
        throw new Error("Cannot delete old backup");
      }
      store.delete(k);
    },
    getAllKeys() { return Array.from(store.keys()); },
  };

  const result = loadSafe(storageWithFailingPrune, { now: () => 400 });
  assert.equal(result.status, "migrated");
  const activeSaved = JSON.parse(store.get(STORAGE_KEY));
  assert.equal(activeSaved.schemaVersion, 1);
});

test("O. prepareEmergencyExport preserves exact raw string", () => {
  const raw = JSON.stringify({ classes: ["exact whitespace test"] }, null, 2);
  const desc = prepareEmergencyExport({ raw, type: "backup" });
  assert.equal(desc.content, raw);
});

test("P. valid JSON export gets .json", () => {
  const raw = JSON.stringify({ valid: true });
  const desc = prepareEmergencyExport({ raw, type: "backup", timestamp: 1700000000000 });
  assert.ok(desc.filename.endsWith(".json"));
  assert.equal(desc.isValidJson, true);
  assert.equal(desc.mimeType, "application/json");
});

test("Q. malformed raw export gets .txt", () => {
  const raw = "{ broken json syntax :::";
  const desc = prepareEmergencyExport({ raw, type: "quarantine", timestamp: 1700000000000 });
  assert.ok(desc.filename.endsWith(".txt"));
  assert.equal(desc.isValidJson, false);
  assert.equal(desc.mimeType, "text/plain;charset=utf-8");
});

test("R. filename sanitized", () => {
  const raw = "test";
  const desc = prepareEmergencyExport({ raw, type: "quarantine/evil:test\\name", timestamp: 1700000000000 });
  assert.doesNotMatch(desc.filename, /[:/\\]/);
});

test("S. export helper does not mutate storage/source data", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: "{ raw: 123 }" });
  prepareEmergencyExport({ raw: storage.store.get(STORAGE_KEY), type: "backup" });
  assert.equal(storage.store.get(STORAGE_KEY), "{ raw: 123 }");
});

test("T. quarantine export preserves malformed raw bytes/string exactly", () => {
  const weirdRaw = "\u0000\u001f broken \n\t raw";
  const desc = prepareEmergencyExport({ raw: weirdRaw, type: "quarantine" });
  assert.equal(desc.content, weirdRaw);
});

test("U. future-version raw can be exported without migration/downgrade", () => {
  const futureRaw = JSON.stringify({ schemaVersion: 99, customFutureKey: [1, 2, 3] });
  const desc = prepareEmergencyExport({ raw: futureRaw, type: "backup" });
  assert.equal(desc.content, futureRaw);
  assert.equal(desc.isValidJson, true);
});

test("V. export descriptor has expected mime type", () => {
  const jsonDesc = prepareEmergencyExport({ raw: "{}", type: "backup" });
  assert.equal(jsonDesc.mimeType, "application/json");
  const txtDesc = prepareEmergencyExport({ raw: "NOT JSON", type: "quarantine" });
  assert.equal(txtDesc.mimeType, "text/plain;charset=utf-8");
});

test("W. loadSafe future_version preserves exact source raw string", () => {
  const customRaw = "{\n  \"schemaVersion\": 99,\n  \"someKey\": [1, 2, 3]\n}";
  const storage = createMockStorage({ [STORAGE_KEY]: customRaw });
  const result = loadSafe(storage);
  assert.equal(result.status, "future_version");
  assert.equal(result.raw, customRaw);
});

test("X. future_version raw with indentation/whitespace survives loadSafe unchanged", () => {
  const oddWhitespaceRaw = "{\n    \"schemaVersion\": 99,\n    \"futureField\": [ 1, 2, 3 ]\n}";
  const storage = createMockStorage({ [STORAGE_KEY]: oddWhitespaceRaw });
  const result = loadSafe(storage);
  assert.equal(result.status, "future_version");
  assert.equal(result.raw, oddWhitespaceRaw);
});

test("Y. resolveAppLoadDecision preserves exact future raw string", () => {
  const oddWhitespaceRaw = "{\n    \"schemaVersion\": 99,\n    \"futureField\": [ 1, 2, 3 ]\n}";
  const storage = createMockStorage({ [STORAGE_KEY]: oddWhitespaceRaw });
  const loadResult = loadSafe(storage);
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "future_version");
  if (decision.loadState.status === "future_version") {
    assert.equal(decision.loadState.raw, oddWhitespaceRaw);
  }
});

test("Z. future-version emergency export content exactly equals original storage raw", () => {
  const oddWhitespaceRaw = "{\n    \"schemaVersion\": 99,\n    \"futureField\": [ 1, 2, 3 ]\n}";
  const storage = createMockStorage({ [STORAGE_KEY]: oddWhitespaceRaw });
  const loadResult = loadSafe(storage);
  const decision = resolveAppLoadDecision(loadResult);
  const exported = prepareEmergencyExport({ raw: decision.loadState.raw ?? "", type: "backup" });
  assert.equal(exported.content, oddWhitespaceRaw);
});

test("AA. export path does not JSON.stringify/reformat future-version raw", () => {
  const unformattedRaw = "{\"schemaVersion\":99,\"a\":   1,\"b\":\n[2,3]}";
  const storage = createMockStorage({ [STORAGE_KEY]: unformattedRaw });
  const loadResult = loadSafe(storage);
  const decision = resolveAppLoadDecision(loadResult);
  const exported = prepareEmergencyExport({ raw: decision.loadState.raw ?? "", type: "backup" });
  assert.equal(exported.content, unformattedRaw);
  assert.notEqual(exported.content, JSON.stringify(JSON.parse(unformattedRaw)));
});

test("AB. future_version remains non-writable after export", () => {
  const futureRaw = "{\n  \"schemaVersion\": 99\n}";
  const storage = createMockStorage({ [STORAGE_KEY]: futureRaw });
  const loadResult = loadSafe(storage);
  const decision = resolveAppLoadDecision(loadResult);
  prepareEmergencyExport({ raw: decision.loadState.raw ?? "", type: "backup" });
  assert.equal(decision.writable, false);
  assert.equal(storage.store.get(STORAGE_KEY), futureRaw);
});
