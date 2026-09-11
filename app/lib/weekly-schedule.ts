import { useSyncExternalStore } from "react";
import type { AppData, ScheduleWeekday, SchoolClass, WeeklyScheduleEntry } from "./types";

/**
 * Sınıf Rota — Haftalık Ders Programı domain helper'ları.
 *
 * Kurallar:
 * - weekday yalnız 1..5 (Pazartesi..Cuma); Cumartesi/Pazar modele giremez.
 * - lessonNumber pozitif tam sayı.
 * - (weekday, lessonNumber) kombinasyonu tüm programda unique'tir
 *   (tek öğretmen varsayımı). Bu doğal olarak (classId, weekday,
 *   lessonNumber) duplicate'ını da engeller.
 * - Aynı sınıf aynı gün farklı ders numaralarında bulunabilir.
 */

export const SCHEDULE_WEEKDAYS: readonly ScheduleWeekday[] = [1, 2, 3, 4, 5];

export const WEEKDAY_LABELS: Record<ScheduleWeekday, string> = {
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
};

/** Ders numarası giriş alanı için makul üst sınır (domain validation'da kullanılmaz). */
export const MAX_SCHEDULE_LESSON_INPUT = 12;

export function isScheduleWeekday(value: unknown): value is ScheduleWeekday {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

export function isValidWeeklyScheduleEntry(entry: unknown): entry is WeeklyScheduleEntry {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
  const item = entry as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.trim() === "") return false;
  if (typeof item.classId !== "string" || item.classId.trim() === "") return false;
  if (!isScheduleWeekday(item.weekday)) return false;
  if (typeof item.lessonNumber !== "number" || !Number.isInteger(item.lessonNumber) || item.lessonNumber < 1) return false;
  return true;
}

export function isValidWeeklyScheduleList(entries: unknown): entries is WeeklyScheduleEntry[] {
  if (!Array.isArray(entries)) return false;
  if (!entries.every(isValidWeeklyScheduleEntry)) return false;
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.weekday}:${entry.lessonNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export interface ScheduleInput {
  classId: string;
  weekday: number;
  lessonNumber: number;
}

/**
 * (weekday, lessonNumber) çakışması varsa çakışan kaydı döndürür.
 * exceptId verilen kaydın kendisi hariç tutulur (düzenleme akışı).
 */
export function findScheduleConflict(
  entries: WeeklyScheduleEntry[],
  input: { weekday: number; lessonNumber: number },
  exceptId?: string
): WeeklyScheduleEntry | undefined {
  return entries.find(
    (entry) =>
      entry.id !== exceptId &&
      entry.weekday === input.weekday &&
      entry.lessonNumber === input.lessonNumber
  );
}

function formatConflictMessage(
  conflict: WeeklyScheduleEntry,
  classes: SchoolClass[]
): string {
  const holder = classes.find((item) => item.id === conflict.classId);
  const holderName = holder ? holder.name : "başka bir sınıf";
  const day = WEEKDAY_LABELS[conflict.weekday as ScheduleWeekday] ?? `${conflict.weekday}. gün`;
  return `${day} ${conflict.lessonNumber}. Ders zaten ${holderName} için kayıtlı`;
}

/**
 * Program kaydı girdisini doğrular. Geçerliyse null, değilse Türkçe hata mesajı döndürür.
 */
export function validateScheduleInput(
  entries: WeeklyScheduleEntry[],
  classes: SchoolClass[],
  input: ScheduleInput,
  exceptId?: string
): string | null {
  const target = classes.find((item) => item.id === input.classId);
  if (!target || target.archived) {
    return "Ders programına yalnız aktif bir sınıf eklenebilir";
  }
  if (!isScheduleWeekday(input.weekday)) {
    return "Ders programı yalnız Pazartesi–Cuma günleri için oluşturulabilir";
  }
  if (!Number.isInteger(input.lessonNumber) || input.lessonNumber < 1) {
    return "Ders numarası pozitif bir tam sayı olmalı";
  }
  const conflict = findScheduleConflict(entries, input, exceptId);
  if (conflict) {
    return formatConflictMessage(conflict, classes);
  }
  return null;
}

export function addWeeklyScheduleEntry(
  data: AppData,
  input: { classId: string; weekday: ScheduleWeekday; lessonNumber: number },
  idFactory: () => string
): AppData {
  const entry: WeeklyScheduleEntry = {
    id: idFactory(),
    classId: input.classId,
    weekday: input.weekday,
    lessonNumber: input.lessonNumber,
  };
  return {
    ...data,
    weeklySchedule: [...(data.weeklySchedule ?? []), entry],
  };
}

export function updateWeeklyScheduleEntry(
  data: AppData,
  id: string,
  patch: { classId: string; weekday: ScheduleWeekday; lessonNumber: number }
): AppData {
  return {
    ...data,
    weeklySchedule: (data.weeklySchedule ?? []).map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry
    ),
  };
}

export function deleteWeeklyScheduleEntry(data: AppData, id: string): AppData {
  return {
    ...data,
    weeklySchedule: (data.weeklySchedule ?? []).filter((entry) => entry.id !== id),
  };
}

export function entriesForWeekday(
  entries: WeeklyScheduleEntry[],
  weekday: ScheduleWeekday
): WeeklyScheduleEntry[] {
  return entries
    .filter((entry) => entry.weekday === weekday)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);
}

export interface TodayLesson {
  entry: WeeklyScheduleEntry;
  schoolClass: SchoolClass;
}

/**
 * Verilen gün için dersleri ders numarasına göre artan sıralar.
 * Arşivlenmiş veya silinmiş sınıflara ait kayıtlar elenir.
 * Öğrenci sayısı her render'da canlı sınıf datasından türetilir (kayıtta tutulmaz).
 */
export function resolveTodayLessons(
  entries: WeeklyScheduleEntry[],
  classes: SchoolClass[],
  weekday: ScheduleWeekday | null
): TodayLesson[] {
  if (weekday === null) return [];
  const byId = new Map(classes.filter((item) => !item.archived).map((item) => [item.id, item]));
  return entriesForWeekday(entries, weekday).flatMap((entry) => {
    const schoolClass = byId.get(entry.classId);
    return schoolClass ? [{ entry, schoolClass }] : [];
  });
}

export function formatLessonLabel(lessonNumber: number): string {
  return `${lessonNumber}. Ders`;
}

/** Cihaz local date'inden JS weekday (0=Pazar..6=Cumartesi). UTC kullanılmaz. */
export function getLocalWeekday(date: Date = new Date()): number {
  return date.getDay();
}

/** 1..5 -> ScheduleWeekday, Cumartesi/Pazar -> null. */
export function toScheduleWeekday(day: number): ScheduleWeekday | null {
  return isScheduleWeekday(day) ? day : null;
}

const noopSubscribe = () => () => {};

export function useClientWeekday(): ScheduleWeekday | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => toScheduleWeekday(getLocalWeekday()),
    () => toScheduleWeekday(getLocalWeekday()),
  );
}
