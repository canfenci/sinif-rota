import type { AppData, TeacherEvaluation } from "./types";

/**
 * Öğretmen Değerlendirmesi (RAPOR-12).
 *
 * Teacher-authored persisted text only. System recommendations, AI servisi veya
 * puan hesaplama motorları ile birleştirilmez; bu modül yalnız persistence ve
 * identity sözleşmesini yönetir.
 */

export const TEACHER_EVALUATION_TEXT_MAX_LENGTH = 2000;

export type TeacherEvaluationIdentity =
  | {
      scope: "student";
      classId: string;
      studentId: string;
      fromWeekStart: string;
      toWeekStart: string;
    }
  | {
      scope: "class_general";
      classId: string;
      fromWeekStart: string;
      toWeekStart: string;
    };

export type TeacherEvaluationUpsertInput =
  | {
      scope: "student";
      classId: string;
      studentId: string;
      fromWeekStart: string;
      toWeekStart: string;
      text: string;
    }
  | {
      scope: "class_general";
      classId: string;
      fromWeekStart: string;
      toWeekStart: string;
      text: string;
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Strict YYYY-MM-DD calendar date kontrolü.
 * Date.parse gevşekliğine izin verilmez (örn. 2026-13-40 geçersizdir).
 */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

/**
 * Report identity'den deterministik evaluation id üretir. UUID kullanılmaz.
 *
 * Student:        eval:student:{classId}:{studentId}:{fromWeekStart}:{toWeekStart}
 * Class general:  eval:class_general:{classId}:{fromWeekStart}:{toWeekStart}
 */
export function buildTeacherEvaluationId(identity: TeacherEvaluationIdentity): string {
  if (identity.scope === "student") {
    return `eval:student:${identity.classId}:${identity.studentId}:${identity.fromWeekStart}:${identity.toWeekStart}`;
  }
  return `eval:class_general:${identity.classId}:${identity.fromWeekStart}:${identity.toWeekStart}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * TeacherEvaluation validator. Geçerli kayıtlarda id, scope/context/range
 * alanlarından beklenen deterministik id ile birebir eşleşmelidir.
 */
export function isValidTeacherEvaluation(entry: unknown): entry is TeacherEvaluation {
  if (!isPlainObject(entry)) return false;
  if (entry.scope !== "student" && entry.scope !== "class_general") return false;
  if (!isNonEmptyString(entry.classId)) return false;
  if (!isValidCalendarDate(entry.fromWeekStart)) return false;
  if (!isValidCalendarDate(entry.toWeekStart)) return false;
  if ((entry.fromWeekStart as string) > (entry.toWeekStart as string)) return false;
  if (typeof entry.text !== "string") return false;
  const trimmed = (entry.text as string).trim();
  if (trimmed === "" || trimmed.length > TEACHER_EVALUATION_TEXT_MAX_LENGTH) return false;
  if (!isValidTimestamp(entry.createdAt)) return false;
  if (!isValidTimestamp(entry.updatedAt)) return false;

  let expectedId: string;
  if (entry.scope === "student") {
    if (!isNonEmptyString(entry.studentId)) return false;
    expectedId = buildTeacherEvaluationId({
      scope: "student",
      classId: entry.classId as string,
      studentId: entry.studentId as string,
      fromWeekStart: entry.fromWeekStart as string,
      toWeekStart: entry.toWeekStart as string,
    });
  } else {
    if (entry.studentId !== undefined) return false;
    expectedId = buildTeacherEvaluationId({
      scope: "class_general",
      classId: entry.classId as string,
      fromWeekStart: entry.fromWeekStart as string,
      toWeekStart: entry.toWeekStart as string,
    });
  }
  if (typeof entry.id !== "string" || entry.id !== expectedId) return false;
  return true;
}

export function deepCloneTeacherEvaluation(entry: TeacherEvaluation): TeacherEvaluation {
  const clone: TeacherEvaluation = {
    ...entry,
    id: entry.id,
    scope: entry.scope,
    classId: entry.classId,
    fromWeekStart: entry.fromWeekStart,
    toWeekStart: entry.toWeekStart,
    text: entry.text,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (entry.studentId !== undefined) {
    clone.studentId = entry.studentId;
  }
  return clone;
}

function readEvaluations(data: AppData): TeacherEvaluation[] {
  return data.teacherEvaluations ?? [];
}

/**
 * Deterministik id üzerinden tek kayıt okur. Bulunamazsa null döner.
 */
export function getTeacherEvaluation(
  evaluations: TeacherEvaluation[] | undefined,
  identity: TeacherEvaluationIdentity
): TeacherEvaluation | null {
  const id = buildTeacherEvaluationId(identity);
  return (evaluations ?? []).find((entry) => entry.id === id) ?? null;
}

/**
 * Print/presentation katmanı için salt evaluation text okur.
 * Saf modül fonksiyonudur; React memo kurallarından etkilenmez.
 */
export function findEvaluationText(
  evaluations: TeacherEvaluation[] | undefined,
  identity: TeacherEvaluationIdentity | null
): string | null {
  if (!identity) return null;
  const id = buildTeacherEvaluationId(identity);
  return (evaluations ?? []).find((entry) => entry.id === id)?.text ?? null;
}

/**
 * Upsert: aynı identity için ikinci record oluşamaz.
 * - Mevcut id: text + updatedAt güncellenir, createdAt korunur.
 * - Yeni: deterministik id ile createdAt/updatedAt atanır.
 * - Whitespace-only / boş text: record oluşturmaz; mevcut kayıt varsa siler.
 * Girdi mutate edilmez.
 */
export function upsertTeacherEvaluation(
  data: AppData,
  input: TeacherEvaluationUpsertInput,
  now: () => string = () => new Date().toISOString()
): AppData {
  const trimmed = typeof input.text === "string" ? input.text.trim() : "";
  const id = buildTeacherEvaluationId(input);
  const evaluations = readEvaluations(data);
  const existing = evaluations.find((entry) => entry.id === id);

  if (trimmed === "") {
    if (!existing) return data;
    return {
      ...data,
      teacherEvaluations: evaluations.filter((entry) => entry.id !== id),
    };
  }

  if (trimmed.length > TEACHER_EVALUATION_TEXT_MAX_LENGTH) {
    return data;
  }

  const timestamp = now();
  if (existing) {
    return {
      ...data,
      teacherEvaluations: evaluations.map((entry) =>
        entry.id === id ? { ...entry, text: trimmed, updatedAt: timestamp } : entry
      ),
    };
  }

  const created: TeacherEvaluation = {
    id,
    scope: input.scope,
    classId: input.classId,
    ...(input.scope === "student" ? { studentId: input.studentId } : {}),
    fromWeekStart: input.fromWeekStart,
    toWeekStart: input.toWeekStart,
    text: trimmed,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...data,
    teacherEvaluations: [...evaluations, created],
  };
}

/**
 * Deterministik identity'ye sahip kaydı kaldırır. Kayıt yoksa data değişmez.
 */
export function deleteTeacherEvaluation(
  data: AppData,
  identity: TeacherEvaluationIdentity
): AppData {
  const id = buildTeacherEvaluationId(identity);
  const evaluations = readEvaluations(data);
  if (!evaluations.some((entry) => entry.id === id)) return data;
  return {
    ...data,
    teacherEvaluations: evaluations.filter((entry) => entry.id !== id),
  };
}
