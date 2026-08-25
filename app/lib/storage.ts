import { CURRENT_SCHEMA_VERSION, detectSchemaVersion, migrateData } from "./migrations";
import { seedData } from "./seed";
import type { AppData, VersionedAppData } from "./types";

export const STORAGE_KEY = "sinif-rota-prototype-v1";
export const LEGACY_STORAGE_KEY = "okul-takip-prototype-v1";
export const BACKUP_KEY_PREFIX = "sinif-rota-backup-pre-migration-";
export const QUARANTINE_KEY_PREFIX = "sinif-rota-corrupted-raw-";

// Persisted fields: classes, sessions, workCalendar, annualPlanEntries, unknown fields

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  getAllKeys?(): string[];
}

export type StorageLoadResult =
  | { status: "success"; data: VersionedAppData; sourceKey: string }
  | { status: "migrated"; data: VersionedAppData; backupKey: string; sourceKey: string }
  | { status: "empty"; data: VersionedAppData }
  | { status: "quarantined"; raw: string; quarantineKey?: string; reason: string; sourceKey: string }
  | { status: "future_version"; schemaVersion: number; raw: string; sourceKey: string; parsed?: unknown }
  | { status: "storage_unavailable"; reason: string };


export type StorageSaveResult =
  | { status: "success" }
  | { status: "quota_exceeded"; error: string }
  | { status: "storage_unavailable"; error: string }
  | { status: "error"; error: string };

export interface StorageOptions {
  now?: () => number;
}

export function createVersionedSeedData(): VersionedAppData {
  return {
    ...seedData,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export const browserLocalStorage: KeyValueStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage is not available");
    }
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  },
  getAllKeys(): string[] {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k !== null) keys.push(k);
    }
    return keys;
  },
};


export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const version = detectSchemaVersion(value);
  if (version === null) return false;
  const result = migrateData(value);
  return result.status === "success";
}

export function loadSafe(driver: KeyValueStorage = browserLocalStorage, options?: StorageOptions): StorageLoadResult {
  let rawActive: string | null = null;
  let rawLegacy: string | null = null;

  try {
    rawActive = driver.getItem(STORAGE_KEY);
    rawLegacy = driver.getItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    return {
      status: "storage_unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  let sourceKey = STORAGE_KEY;
  let rawString: string | null = null;

  if (rawActive !== null && rawActive !== undefined) {
    sourceKey = STORAGE_KEY;
    rawString = rawActive;
  } else if (rawLegacy !== null && rawLegacy !== undefined) {
    sourceKey = LEGACY_STORAGE_KEY;
    rawString = rawLegacy;
  } else {
    return {
      status: "empty",
      data: createVersionedSeedData(),
    };
  }

  const nowFn = options?.now ?? Date.now;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawString);
  } catch (parseError) {
    const timestamp = nowFn();
    const quarantineKey = `${QUARANTINE_KEY_PREFIX}${timestamp}`;
    try {
      driver.setItem(quarantineKey, rawString);
    } catch {
      // If writing quarantine copy fails, source raw string is still untouched
    }
    return {
      status: "quarantined",
      raw: rawString,
      quarantineKey,
      reason: `Malformed JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      sourceKey,
    };
  }

  const migration = migrateData(parsed);

  if (migration.status === "unsupported_future_version") {
    return {
      status: "future_version",
      schemaVersion: migration.schemaVersion,
      raw: rawString,
      parsed: migration.raw,
      sourceKey,
    };
  }


  if (migration.status === "invalid_data" || migration.status === "migration_error") {
    const timestamp = nowFn();
    const quarantineKey = `${QUARANTINE_KEY_PREFIX}${timestamp}`;
    try {
      driver.setItem(quarantineKey, rawString);
    } catch {
      // Quarantine write failed, source untouched
    }
    return {
      status: "quarantined",
      raw: rawString,
      quarantineKey,
      reason: migration.status === "invalid_data" ? migration.reason : migration.error,
      sourceKey,
    };
  }

  if (migration.status === "success") {
    if (migration.migratedFrom !== null || sourceKey === LEGACY_STORAGE_KEY) {
      const timestamp = nowFn();
      const backupKey = `${BACKUP_KEY_PREFIX}${timestamp}`;
      let backupSucceeded = false;

      try {
        driver.setItem(backupKey, rawString);
        backupSucceeded = true;
      } catch (backupError) {
        return {
          status: "quarantined",
          raw: rawString,
          reason: `Failed to create pre-migration backup: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
          sourceKey,
        };
      }

      if (backupSucceeded) {
        try {
          driver.setItem(STORAGE_KEY, JSON.stringify(migration.data));
        } catch (writeError) {
          return {
            status: "quarantined",
            raw: rawString,
            reason: `Failed to write migrated data to active storage: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
            sourceKey,
          };
        }

        // Rotation hygiene step (keeps newest 3 backups, failure does NOT rollback active migration)
        try {
          pruneOldBackups(driver, 3);
        } catch {
          // Prune error is non-fatal for migration
        }

        return {
          status: "migrated",
          data: migration.data,
          backupKey,
          sourceKey,
        };
      }
    }

    return {
      status: "success",
      data: migration.data,
      sourceKey,
    };
  }

  return {
    status: "quarantined",
    raw: rawString,
    reason: "Unexpected migration state",
    sourceKey,
  };
}

export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014
    );
  }
  if (error instanceof Error) {
    return (
      error.name === "QuotaExceededError" ||
      error.message.toLowerCase().includes("quota") ||
      error.message.toLowerCase().includes("storage full")
    );
  }
  return false;
}

export function saveSafe(data: AppData, driver: KeyValueStorage = browserLocalStorage): StorageSaveResult {
  try {
    const versioned: VersionedAppData = {
      ...data,
      schemaVersion: data.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    };
    driver.setItem(STORAGE_KEY, JSON.stringify(versioned));
    return { status: "success" };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return {
        status: "quota_exceeded",
        error: error instanceof Error ? error.message : "Storage quota exceeded",
      };
    }
    if (
      error instanceof Error &&
      (error.name === "SecurityError" ||
        error.message.includes("localStorage is not available") ||
        error.message.includes("access is denied"))
    ) {
      return {
        status: "storage_unavailable",
        error: error.message,
      };
    }
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface DataRepository {
  load(): AppData;
  save(data: AppData): void;
  loadSafe(driver?: KeyValueStorage, options?: StorageOptions): StorageLoadResult;
  saveSafe(data: AppData, driver?: KeyValueStorage): StorageSaveResult;
  isLocked?(): boolean;
}

export function createLocalRepository(driver: KeyValueStorage = browserLocalStorage): DataRepository {
  let isWriteLocked = false;
  return {
    load(): AppData {
      if (typeof window === "undefined" && driver === browserLocalStorage) return seedData;
      const result = loadSafe(driver);
      if (result.status === "success" || result.status === "migrated" || result.status === "empty") {
        isWriteLocked = false;
        return result.data;
      }
      isWriteLocked = true;
      return createVersionedSeedData();
    },
    save(data: AppData): void {
      if (isWriteLocked) return;
      if (typeof window === "undefined" && driver === browserLocalStorage) return;
      saveSafe(data, driver);
    },
    loadSafe(overrideDriver?: KeyValueStorage, options?: StorageOptions): StorageLoadResult {
      return loadSafe(overrideDriver ?? driver, options);
    },
    saveSafe(data: AppData, overrideDriver?: KeyValueStorage): StorageSaveResult {
      return saveSafe(data, overrideDriver ?? driver);
    },
    isLocked(): boolean {
      return isWriteLocked;
    },
  };
}

export interface BackupRotationPlan {
  keep: string[];
  delete: string[];
}

export function getBackupRotationPlan(keys: string[], keepCount = 3): BackupRotationPlan {
  const validBackups: { key: string; timestamp: number }[] = [];
  const keep: string[] = [];

  for (const key of keys) {
    if (!key.startsWith(BACKUP_KEY_PREFIX)) {
      continue;
    }
    const suffix = key.slice(BACKUP_KEY_PREFIX.length);
    const timestamp = Number(suffix);

    if (!Number.isFinite(timestamp) || suffix.trim() === "") {
      // Unrecognized/malformed backup suffix is preserved safely
      keep.push(key);
      continue;
    }

    validBackups.push({ key, timestamp });
  }

  // Sort newest first (highest timestamp to lowest)
  validBackups.sort((a, b) => b.timestamp - a.timestamp);

  const safeKeepCount = Math.max(0, keepCount);
  const toKeep = validBackups.slice(0, safeKeepCount).map((b) => b.key);
  const toDelete = validBackups.slice(safeKeepCount).map((b) => b.key);

  return {
    keep: [...keep, ...toKeep],
    delete: toDelete,
  };
}

export type BackupPruneResult =
  | { status: "success"; removedKeys: string[]; keptKeys: string[] }
  | { status: "storage_unavailable"; error: string; removedKeys: string[] }
  | { status: "error"; error: string; removedKeys: string[] };

export function pruneOldBackups(driver: KeyValueStorage = browserLocalStorage, keepCount = 3): BackupPruneResult {
  let allKeys: string[] = [];
  try {
    if (typeof driver.getAllKeys === "function") {
      allKeys = driver.getAllKeys();
    } else if (typeof window !== "undefined" && window.localStorage) {
      allKeys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k !== null) allKeys.push(k);
      }
    }
  } catch (err) {
    return {
      status: "storage_unavailable",
      error: err instanceof Error ? err.message : String(err),
      removedKeys: [],
    };
  }

  const plan = getBackupRotationPlan(allKeys, keepCount);
  const removedKeys: string[] = [];

  for (const keyToDelete of plan.delete) {
    try {
      driver.removeItem(keyToDelete);
      removedKeys.push(keyToDelete);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isUnavailable = errorMsg.includes("SecurityError") || errorMsg.includes("access is denied");
      return {
        status: isUnavailable ? "storage_unavailable" : "error",
        error: errorMsg,
        removedKeys,
      };
    }
  }

  return {
    status: "success",
    removedKeys,
    keptKeys: plan.keep,
  };
}

export interface EmergencyExportDescriptor {
  filename: string;
  mimeType: string;
  content: string;
  isValidJson: boolean;
}

export function prepareEmergencyExport(options: {
  raw: string;
  type: "backup" | "quarantine";
  timestamp?: number | string;
}): EmergencyExportDescriptor {
  const { raw, type, timestamp } = options;
  let isValidJson = false;

  try {
    JSON.parse(raw);
    isValidJson = true;
  } catch {
    isValidJson = false;
  }

  const dateObj = timestamp ? new Date(timestamp) : new Date();
  const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const dateStr = validDate.toISOString().replace(/[:.]/g, "-");

  const extension = isValidJson ? "json" : "txt";
  const mimeType = isValidJson ? "application/json" : "text/plain;charset=utf-8";
  const sanitizedType = type.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `sinif-rota-${sanitizedType}-${dateStr}.${extension}`;

  return {
    filename,
    mimeType,
    content: raw,
    isValidJson,
  };
}

export function downloadEmergencyExport(descriptor: EmergencyExportDescriptor): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([descriptor.content], { type: descriptor.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = descriptor.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export type AppLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "quarantined"; reason: string; sourceKey?: string; raw?: string }
  | { status: "future_version"; schemaVersion: number; sourceKey?: string; raw?: string }
  | { status: "storage_unavailable"; reason: string };

export interface AppLoadDecision {
  loadState: AppLoadState;
  data: AppData;
  writable: boolean;
  migrationNotice?: string;
}

export function resolveAppLoadDecision(result: StorageLoadResult): AppLoadDecision {
  switch (result.status) {
    case "success":
      return {
        loadState: { status: "ready" },
        data: result.data,
        writable: true,
      };
    case "migrated":
      return {
        loadState: { status: "ready" },
        data: result.data,
        writable: true,
        migrationNotice: "Verileriniz yeni veri formatına güvenli şekilde güncellendi.",
      };
    case "empty":
      return {
        loadState: { status: "ready" },
        data: result.data,
        writable: true,
      };
    case "quarantined":
      return {
        loadState: { status: "quarantined", reason: result.reason, sourceKey: result.sourceKey, raw: result.raw },
        data: createVersionedSeedData(),
        writable: false,
      };
    case "future_version":
      return {
        loadState: {
          status: "future_version",
          schemaVersion: result.schemaVersion,
          sourceKey: result.sourceKey,
          raw: result.raw,
        },
        data: createVersionedSeedData(),
        writable: false,
      };

    case "storage_unavailable":
      return {
        loadState: { status: "storage_unavailable", reason: result.reason },
        data: createVersionedSeedData(),
        writable: false,
      };
  }
}

export function determineSaveWarning(saveResult: StorageSaveResult): string | null {
  if (saveResult.status === "success") return null;
  if (saveResult.status === "quota_exceeded") {
    return "Değişiklikler kaydedilemedi. Tarayıcı depolama alanı dolu olabilir.";
  }
  if (saveResult.status === "storage_unavailable") {
    return "Değişiklikler kaydedilemedi. Tarayıcı depolama erişimi kapalı.";
  }
  return "Değişiklikler kaydedilemedi.";
}

export const localRepository: DataRepository = createLocalRepository(browserLocalStorage);
