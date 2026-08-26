import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleCache = new Map();

async function importTypeScript(relPath) {
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const filePath = fileUrl.pathname;
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);

  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const importRegex = /import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  for (const match of [...transpiled.matchAll(importRegex)]) {
    const targetRelPath = `app/lib/${match[2].replace(/^\.\//, "")}.ts`;
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
  APP_DATA_LOCK_NAME,
  BACKUP_KEY_PREFIX,
  createCoordinatedSaveQueue,
  loadCoordinated,
  saveCoordinated,
} = await importTypeScript("app/lib/storage.ts");

function createMockStorage(initial = {}, options = {}) {
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
      if (key === STORAGE_KEY && options.failActiveWrite === "quota") {
        const error = new Error("storage quota full");
        error.name = "QuotaExceededError";
        throw error;
      }
      store.set(key, String(value));
    },
    removeItem(key) {
      calls.push({ method: "removeItem", key });
      store.delete(key);
    },
    getAllKeys() {
      return [...store.keys()];
    },
  };
}

function createExclusiveCoordinator() {
  let tail = Promise.resolve();
  let active = 0;
  let maximumActive = 0;
  let requests = 0;
  return {
    coordinator: {
      runExclusive(operation) {
        requests += 1;
        const pending = tail.then(async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          try {
            return await operation();
          } finally {
            active -= 1;
          }
        });
        tail = pending.then(() => undefined, () => undefined);
        return pending;
      },
    },
    stats() {
      return { maximumActive, requests };
    },
  };
}

function appData(label, extra = {}) {
  return {
    schemaVersion: 1,
    classes: [{ id: "c1", name: label, students: [] }],
    sessions: [],
    ...extra,
  };
}

test("1. normal single-tab coordinated save succeeds", async () => {
  const storage = createMockStorage();
  const { coordinator } = createExclusiveCoordinator();
  const result = await saveCoordinated(appData("5-A"), null, storage, coordinator);
  assert.equal(result.status, "success");
  assert.equal(JSON.parse(storage.store.get(STORAGE_KEY)).classes[0].name, "5-A");
});

test("2. successful save returns the exact newly persisted raw token", async () => {
  const storage = createMockStorage();
  const { coordinator } = createExclusiveCoordinator();
  const result = await saveCoordinated(appData("5-B"), null, storage, coordinator);
  assert.equal(result.status, "success");
  assert.equal(result.nextToken, storage.store.get(STORAGE_KEY));
});

test("3. two tabs load the identical exact token", async () => {
  const raw = JSON.stringify(appData("6-A"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const { coordinator } = createExclusiveCoordinator();
  const [tabA, tabB] = await Promise.all([
    loadCoordinated(storage, coordinator),
    loadCoordinated(storage, coordinator),
  ]);
  assert.equal(tabA.token, raw);
  assert.equal(tabB.token, raw);
  assert.equal(tabA.decision.writable, true);
  assert.equal(tabB.decision.writable, true);
});

test("4. Tab A save succeeds from the shared token", async () => {
  const raw = JSON.stringify(appData("6-A"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const { coordinator } = createExclusiveCoordinator();
  const result = await saveCoordinated(appData("6-A / A değişikliği"), raw, storage, coordinator);
  assert.equal(result.status, "success");
});

test("5. stale Tab B save returns conflict", async () => {
  const raw = JSON.stringify(appData("7-A"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const { coordinator } = createExclusiveCoordinator();
  await saveCoordinated(appData("7-A / A"), raw, storage, coordinator);
  const stale = await saveCoordinated(appData("7-A / B"), raw, storage, coordinator);
  assert.equal(stale.status, "conflict");
});

test("6. stale conflict performs zero active-data setItem calls", async () => {
  const raw = JSON.stringify(appData("7-B"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const { coordinator } = createExclusiveCoordinator();
  const saved = await saveCoordinated(appData("7-B / A"), raw, storage, coordinator);
  assert.equal(saved.status, "success");
  const before = storage.calls.filter((call) => call.method === "setItem" && call.key === STORAGE_KEY).length;
  const stale = await saveCoordinated(appData("7-B / B"), raw, storage, coordinator);
  const after = storage.calls.filter((call) => call.method === "setItem" && call.key === STORAGE_KEY).length;
  assert.equal(stale.status, "conflict");
  assert.equal(after, before);
});

test("7. Tab A persisted data survives rejected Tab B save unchanged", async () => {
  const raw = JSON.stringify(appData("8-A"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const { coordinator } = createExclusiveCoordinator();
  const saved = await saveCoordinated(appData("8-A / A", { marker: "keep-a" }), raw, storage, coordinator);
  assert.equal(saved.status, "success");
  await saveCoordinated(appData("8-A / B", { marker: "replace-a" }), raw, storage, coordinator);
  assert.equal(storage.store.get(STORAGE_KEY), saved.nextToken);
  assert.equal(JSON.parse(saved.nextToken).marker, "keep-a");
});

test("8. three consecutive same-tab queue saves remain ordered", async () => {
  const storage = createMockStorage();
  const lock = createExclusiveCoordinator();
  const queue = createCoordinatedSaveQueue(null, storage, lock.coordinator);
  const results = await Promise.all([
    queue.enqueue(appData("save-1")),
    queue.enqueue(appData("save-2")),
    queue.enqueue(appData("save-3")),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["success", "success", "success"]);
  assert.equal(JSON.parse(storage.store.get(STORAGE_KEY)).classes[0].name, "save-3");
  assert.equal(queue.getExpectedToken(), storage.store.get(STORAGE_KEY));
});

test("9. empty-storage concurrent initialization cannot overwrite first writer", async () => {
  const storage = createMockStorage();
  const { coordinator } = createExclusiveCoordinator();
  const [tabA, tabB] = await Promise.all([
    loadCoordinated(storage, coordinator),
    loadCoordinated(storage, coordinator),
  ]);
  assert.equal(tabA.token, null);
  assert.equal(tabB.token, null);
  const first = await saveCoordinated(appData("first-writer"), tabA.token, storage, coordinator);
  const second = await saveCoordinated(appData("stale-second-writer"), tabB.token, storage, coordinator);
  assert.equal(first.status, "success");
  assert.equal(second.status, "conflict");
  assert.equal(JSON.parse(storage.store.get(STORAGE_KEY)).classes[0].name, "first-writer");
});

test("10. future-schema data receives no writable token", async () => {
  const futureRaw = JSON.stringify({ schemaVersion: 99, classes: [], sessions: [] });
  const storage = createMockStorage({ [STORAGE_KEY]: futureRaw });
  const { coordinator } = createExclusiveCoordinator();
  const result = await loadCoordinated(storage, coordinator);
  assert.equal(result.decision.loadState.status, "future_version");
  assert.equal(result.decision.writable, false);
  assert.equal(result.token, null);
  assert.equal(storage.store.get(STORAGE_KEY), futureRaw);
});

test("11. quota failure keeps existing error semantics and does not advance queue token", async () => {
  const raw = JSON.stringify(appData("quota-base"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw }, { failActiveWrite: "quota" });
  const { coordinator } = createExclusiveCoordinator();
  const queue = createCoordinatedSaveQueue(raw, storage, coordinator);
  const result = await queue.enqueue(appData("quota-change"));
  assert.equal(result.status, "quota_exceeded");
  assert.equal(queue.getExpectedToken(), raw);
  assert.equal(storage.store.get(STORAGE_KEY), raw);
});

test("12. normal reload receives latest successful token", async () => {
  const storage = createMockStorage();
  const { coordinator } = createExclusiveCoordinator();
  const saved = await saveCoordinated(appData("latest"), null, storage, coordinator);
  assert.equal(saved.status, "success");
  const reloaded = await loadCoordinated(storage, coordinator);
  assert.equal(reloaded.token, saved.nextToken);
  assert.equal(reloaded.decision.data.classes[0].name, "latest");
});

test("13. injected exclusive-lock coordinator serializes competing writes", async () => {
  const raw = JSON.stringify(appData("shared"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const lock = createExclusiveCoordinator();
  const results = await Promise.all([
    saveCoordinated(appData("winner"), raw, storage, lock.coordinator),
    saveCoordinated(appData("rejected"), raw, storage, lock.coordinator),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["success", "conflict"]);
  assert.equal(lock.stats().maximumActive, 1);
  assert.equal(APP_DATA_LOCK_NAME, "sinif-rota-appdata-write");
});

test("14. page storage listener blocks stale writes and is cleaned up", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /addEventListener\("storage", handleStorageChange\)/);
  assert.match(pageSource, /removeEventListener\("storage", handleStorageChange\)/);
  assert.match(pageSource, /event\.key !== STORAGE_KEY/);
  assert.match(pageSource, /queue\.block\(\)/);
  assert.match(pageSource, /Sayfayı yenile/);
});

test("15. unavailable Web Locks fails closed without reading or writing AppData", async () => {
  const raw = JSON.stringify(appData("protected"));
  const storage = createMockStorage({ [STORAGE_KEY]: raw });
  const result = await loadCoordinated(storage, null);
  assert.equal(result.decision.loadState.status, "coordination_unavailable");
  assert.equal(result.decision.writable, false);
  assert.equal(result.token, null);
  assert.equal(storage.calls.length, 0);
  assert.equal(storage.store.get(STORAGE_KEY), raw);
});

test("16. coordinated migration retains backup-before-active ordering inside one lock", async () => {
  const legacyRaw = JSON.stringify({ classes: [], sessions: [] });
  const storage = createMockStorage({ [STORAGE_KEY]: legacyRaw });
  const lock = createExclusiveCoordinator();
  const result = await loadCoordinated(storage, lock.coordinator, { now: () => 1700000000000 });
  const writes = storage.calls.filter((call) => call.method === "setItem");
  assert.equal(result.decision.loadState.status, "ready");
  assert.equal(result.decision.writable, true);
  assert.equal(result.token, storage.store.get(STORAGE_KEY));
  assert.equal(writes[0].key, `${BACKUP_KEY_PREFIX}1700000000000`);
  assert.equal(writes[1].key, STORAGE_KEY);
  assert.equal(lock.stats().requests, 1);
});
