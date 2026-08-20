import { seedData } from "./seed";
import type { AppData } from "./types";

const STORAGE_KEY = "okul-takip-prototype-v1";
export interface DataRepository { load(): AppData; save(data: AppData): void; }

export const localRepository: DataRepository = {
  load() {
    if (typeof window === "undefined") return seedData;
    try { const saved = window.localStorage.getItem(STORAGE_KEY); return saved ? JSON.parse(saved) : seedData; }
    catch { return seedData; }
  },
  save(data) {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
};
