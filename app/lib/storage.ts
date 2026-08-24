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
}

export type StorageLoadResult =
  | { status: "success"; data: VersionedAppData; sourceKey: string }
  | { status: "migrated"; data: VersionedAppData; backupKey: string; sourceKey: string }
  | { status: "empty"; data: VersionedAppData }
  | { status: "quarantined"; raw: string; quarantineKey?: string; reason: string; sourceKey: string }
  | { status: "future_version"; schemaVersion: number; raw: unknown; sourceKey: string }
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
      raw: migration.raw,
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

export const localRepository: DataRepository = createLocalRepository(browserLocalStorage);
