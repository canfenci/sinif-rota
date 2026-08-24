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
  resolveAppLoadDecision,
  determineSaveWarning,
  loadSafe,
  saveSafe,
  createVersionedSeedData,
} = await importTypeScript("app/lib/storage.ts");

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
}

const validV1Data = {
  schemaVersion: 1,
  classes: [{ id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali", number: 1, active: true }], archived: false }],
  sessions: [],
};

test("A. success -> editable ready state", () => {
  const loadResult = { status: "success", data: validV1Data, sourceKey: STORAGE_KEY };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "ready");
  assert.equal(decision.writable, true);
  assert.deepEqual(decision.data, validV1Data);
});

test("B. migrated -> editable ready state with user-friendly notice", () => {
  const loadResult = { status: "migrated", data: validV1Data, backupKey: "backup-123", sourceKey: STORAGE_KEY };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "ready");
  assert.equal(decision.writable, true);
  assert.ok(decision.migrationNotice);
  assert.match(decision.migrationNotice, /güvenli şekilde güncellendi/);
  assert.doesNotMatch(decision.migrationNotice, /schemaVersion/);
});

test("C. empty -> editable ready state", () => {
  const loadResult = { status: "empty", data: createVersionedSeedData() };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "ready");
  assert.equal(decision.writable, true);
  assert.ok(decision.data.classes.length > 0);
});

test("D. quarantined -> non-editable safe state", () => {
  const loadResult = { status: "quarantined", raw: "{ broken", reason: "Malformed JSON", sourceKey: STORAGE_KEY };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "quarantined");
  assert.equal(decision.writable, false);
});

test("E. quarantined does not expose fallback seed as normal ready data", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: "{ invalid json" });
  const rawLoad = loadSafe(storage);
  const decision = resolveAppLoadDecision(rawLoad);
  assert.equal(decision.loadState.status, "quarantined");
  assert.notEqual(decision.loadState.status, "ready");
  assert.equal(decision.writable, false);
});

test("F. future_version -> non-editable safe state", () => {
  const loadResult = { status: "future_version", schemaVersion: 99, raw: {}, sourceKey: STORAGE_KEY };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "future_version");
  assert.equal(decision.writable, false);
  if (decision.loadState.status === "future_version") {
    assert.equal(decision.loadState.schemaVersion, 99);
  }
});

test("G. storage_unavailable -> selected safe policy", () => {
  const loadResult = { status: "storage_unavailable", reason: "Access denied" };
  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "storage_unavailable");
  assert.equal(decision.writable, false);
});

test("H. save effect disabled for quarantined", () => {
  const storage = createMockStorage({ [STORAGE_KEY]: "{ invalid json" });
  const decision = resolveAppLoadDecision(loadSafe(storage));
  assert.equal(decision.writable, false);
  let saved = false;
  if (decision.writable) {
    saveSafe(decision.data, storage);
    saved = true;
  }
  assert.equal(saved, false);
  assert.equal(storage.store.get(STORAGE_KEY), "{ invalid json");
});

test("I. save effect disabled for future_version", () => {
  const futureRaw = JSON.stringify({ schemaVersion: 99, classes: [] });
  const storage = createMockStorage({ [STORAGE_KEY]: futureRaw });
  const decision = resolveAppLoadDecision(loadSafe(storage));
  assert.equal(decision.writable, false);
  let saved = false;
  if (decision.writable) {
    saveSafe(decision.data, storage);
    saved = true;
  }
  assert.equal(saved, false);
  assert.equal(storage.store.get(STORAGE_KEY), futureRaw);
});

test("J. save failure quota -> visible warning state", () => {
  const warning = determineSaveWarning({ status: "quota_exceeded", error: "Quota exceeded" });
  assert.ok(warning);
  assert.match(warning, /depolama alanı dolu/);
});

test("K. generic save error -> visible warning state", () => {
  const warning = determineSaveWarning({ status: "error", error: "Disk write error" });
  assert.ok(warning);
  assert.match(warning, /kaydedilemedi/);
});

test("L. successful save does not show warning", () => {
  const warning = determineSaveWarning({ status: "success" });
  assert.equal(warning, null);
});

test("M. loading state does not save", () => {
  const loadState = { status: "loading" };
  const canSave = loadState.status === "ready";
  assert.equal(canSave, false);
});

test("N. successful/migrated/empty state remains backward compatible", () => {
  const results = [
    { status: "success", data: validV1Data, sourceKey: STORAGE_KEY },
    { status: "migrated", data: validV1Data, backupKey: "bk", sourceKey: STORAGE_KEY },
    { status: "empty", data: createVersionedSeedData() },
  ];
  for (const res of results) {
    const dec = resolveAppLoadDecision(res);
    assert.equal(dec.loadState.status, "ready");
    assert.equal(dec.writable, true);
    assert.ok(Array.isArray(dec.data.classes));
  }
});
