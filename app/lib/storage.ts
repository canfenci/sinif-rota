import { seedData } from "./seed";
import type { AppData, CheckStatus, CheckType } from "./types";

const STORAGE_KEY = "sinif-rota-prototype-v1";
const LEGACY_STORAGE_KEY = "okul-takip-prototype-v1";
export interface DataRepository { load(): AppData; save(data: AppData): void; }

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppData>;
  const types: CheckType[] = ["Ödev", "Defter", "Kitap", "Materyal"];
  const statuses: CheckStatus[] = ["complete", "partial", "missing", "absent"];
  const calendar = candidate.workCalendar;
  const entries = candidate.annualPlanEntries;
  return Array.isArray(candidate.classes) && Array.isArray(candidate.sessions)
    && candidate.classes.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.students)
      && (item.archived == null || typeof item.archived === "boolean")
      && item.students.every((student) => student && typeof student.id === "string" && typeof student.name === "string" && Number.isInteger(student.number) && (student.active == null || typeof student.active === "boolean")))
    && candidate.sessions.every((session) => session && typeof session.id === "string" && typeof session.classId === "string"
      && typeof session.className === "string" && types.includes(session.type) && !Number.isNaN(Date.parse(session.date))
      && session.statuses && typeof session.statuses === "object" && Object.values(session.statuses).every((status) => statuses.includes(status)))
    && (calendar == null || (typeof calendar.schoolYear === "string" && typeof calendar.startDate === "string" && typeof calendar.endDate === "string" && Array.isArray(calendar.breaks)
      && calendar.breaks.every((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.startDate === "string" && typeof item.endDate === "string")))
    && (entries == null || (Array.isArray(entries) && entries.every((entry) => entry && typeof entry.id === "string" && typeof entry.classId === "string" && typeof entry.schoolYear === "string"
      && typeof entry.weekStart === "string" && typeof entry.topic === "string" && typeof entry.note === "string" && typeof entry.completed === "boolean")));
}

export const localRepository: DataRepository = {
  load() {
    if (typeof window === "undefined") return seedData;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!saved) return seedData;
      const parsed: unknown = JSON.parse(saved);
      return isAppData(parsed) ? parsed : seedData;
    }
    catch { return seedData; }
  },
  save(data) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { /* Depolama dolu veya kullanılamıyorsa arayüz çalışmaya devam eder. */ }
  },
};
