import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const moduleCache = new Map();

async function importTypeScript(relPath) {
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const filePath = fileUrl.pathname;
  if (moduleCache.has(filePath)) {
    return moduleCache.get(filePath);
  }

  const source = fs.readFileSync(filePath, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const importRegex = /import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(importRegex)];

  for (const match of matches) {
    const importPath = match[2];
    const targetRelPath = `app/lib/${importPath.replace(/^\.\//, "")}.ts`;
    await importTypeScript(targetRelPath);
    const targetSource = fs.readFileSync(new URL(`../${targetRelPath}`, import.meta.url).pathname, "utf8");
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

const { emptyAppData, demoSeedData } = await importTypeScript("app/lib/seed.ts");
const {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  loadSafe,
  resolveAppLoadDecision,
  createLocalRepository,
} = await importTypeScript("app/lib/storage.ts");
const { CURRENT_SCHEMA_VERSION } = await importTypeScript("app/lib/migrations.ts");

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    getAllKeys() { return Array.from(store.keys()); },
  };
}

test("A. localStorage completely empty -> load status = empty, classes === 0, sessions === 0", () => {
  const storage = createMockStorage();
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "empty");
  assert.equal(loadResult.data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loadResult.data.classes.length, 0);
  assert.equal(loadResult.data.sessions.length, 0);
  assert.equal(storage.store.size, 0, "Empty load must not touch storage");

  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.loadState.status, "ready");
  assert.equal(decision.writable, true);
  assert.equal(decision.data.classes.length, 0);
  assert.equal(decision.data.sessions.length, 0);
});

test("B. existing active storage data is preserved and not overwritten with empty data", () => {
  const existingV1 = {
    schemaVersion: 1,
    classes: [
      { id: "teacher-class-1", name: "6-C Fen", students: [{ id: "s1", name: "Zeynep Kaya", number: 105 }] },
    ],
    sessions: [
      { id: "sess-1", classId: "teacher-class-1", className: "6-C Fen", type: "Ödev", date: "2026-08-20T10:00:00Z", statuses: { s1: "complete" } },
    ],
  };
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(existingV1),
  });

  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "success");
  assert.equal(loadResult.data.classes.length, 1);
  assert.equal(loadResult.data.classes[0].name, "6-C Fen");
  assert.equal(loadResult.data.sessions.length, 1);
});

test("C. legacy storage migration path continues to work flawlessly", () => {
  const legacyV0 = {
    classes: [
      { id: "legacy-class", name: "7-A", students: [{ id: "ls1", name: "Ahmet Kurt", number: 12 }] },
    ],
    sessions: [],
  };
  const storage = createMockStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify(legacyV0),
  });

  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "migrated");
  assert.equal(loadResult.data.schemaVersion, 1);
  assert.equal(loadResult.data.classes[0].name, "7-A");
});

test("D. quarantined / invalid JSON retains writable=false with empty fallback", () => {
  const storage = createMockStorage({
    [STORAGE_KEY]: "invalid json data {",
  });
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "quarantined");

  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.writable, false);
  assert.equal(decision.loadState.status, "quarantined");
  assert.equal(decision.data.classes.length, 0);
});

test("E. future schema version retains writable=false with empty fallback", () => {
  const futureData = {
    schemaVersion: 999,
    classes: [{ id: "future-c", name: "Future 99", students: [] }],
    sessions: [],
  };
  const storage = createMockStorage({
    [STORAGE_KEY]: JSON.stringify(futureData),
  });
  const loadResult = loadSafe(storage);
  assert.equal(loadResult.status, "future_version");

  const decision = resolveAppLoadDecision(loadResult);
  assert.equal(decision.writable, false);
  assert.equal(decision.loadState.status, "future_version");
  assert.equal(decision.data.classes.length, 0);
});

test("F. app/page.tsx initial state uses emptyAppData with 0 classes and safe navigation", () => {
  const pagePath = path.resolve("app/page.tsx");
  const content = fs.readFileSync(pagePath, "utf8");

  assert.ok(content.includes('import { emptyAppData } from "./lib/seed";'), "Must import emptyAppData");
  assert.ok(content.includes("useState<AppData>(emptyAppData)"), "Initial state must be emptyAppData");
  assert.ok(content.includes('emptyAppData.classes[0]?.id ?? ""'), "Must safely navigate empty classes");
  assert.ok(!content.includes("seedData.classes[0].id"), "Must not perform unsafe access on seedData");
});

test("G. emptyAppData model structure is verified", () => {
  assert.deepEqual(emptyAppData, { classes: [], sessions: [] });
  assert.equal(emptyAppData.classes.length, 0);
  assert.equal(emptyAppData.sessions.length, 0);
  assert.ok(Array.isArray(demoSeedData.classes));
  assert.ok(demoSeedData.classes.length > 0, "demoSeedData is preserved as non-default asset");
});

test("H. adding first real class saves only user created class to storage without demo leak", () => {
  const storage = createMockStorage();
  const repo = createLocalRepository(storage);

  const initial = repo.load();
  assert.equal(initial.classes.length, 0);

  // User adds first class
  const newClass = { id: "user-class-101", name: "5-A Bilişim", students: [] };
  const userAppData = { ...initial, classes: [newClass] };
  repo.save(userAppData);

  const savedRaw = storage.getItem(STORAGE_KEY);
  assert.ok(savedRaw);
  const parsed = JSON.parse(savedRaw);
  assert.equal(parsed.classes.length, 1);
  assert.equal(parsed.classes[0].name, "5-A Bilişim");
  assert.equal(parsed.sessions.length, 0);
  assert.equal(JSON.stringify(parsed).includes("seed-session"), false, "No demo session leaked");
  assert.equal(JSON.stringify(parsed).includes("c1-s1"), false, "No demo student leaked");
});
