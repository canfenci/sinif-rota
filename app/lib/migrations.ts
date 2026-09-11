import type { AnnualPlanEntry, AppData, CalendarBreak, CheckSession, CheckStatus, CheckType, SchoolClass, Student, TeacherEvaluation, WeeklyScheduleEntry, WorkCalendar } from "./types";

export const CURRENT_SCHEMA_VERSION = 1;

const VALID_CHECK_TYPES: readonly CheckType[] = ["Ödev", "Defter", "Kitap", "Materyal"] as const;
const VALID_CHECK_STATUSES: readonly CheckStatus[] = ["complete", "partial", "missing", "absent"] as const;

export type MigrationResult =
  | {
      status: "success";
      data: AppData & { schemaVersion: 1 };
      migratedFrom: number | null;
    }
  | {
      status: "unsupported_future_version";
      schemaVersion: number;
      raw: unknown;
    }
  | {
      status: "invalid_data";
      reason: string;
      raw: unknown;
    }
  | {
      status: "migration_error";
      error: string;
      raw: unknown;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStudent(student: unknown): student is Student {
  if (!isPlainObject(student)) return false;
  if (typeof student.id !== "string" || student.id.trim() === "") return false;
  if (typeof student.name !== "string") return false;
  if (typeof student.number !== "number" || !Number.isInteger(student.number)) return false;
  if (student.active !== undefined && typeof student.active !== "boolean") return false;
  return true;
}

function isValidClass(schoolClass: unknown): schoolClass is SchoolClass {
  if (!isPlainObject(schoolClass)) return false;
  if (typeof schoolClass.id !== "string" || schoolClass.id.trim() === "") return false;
  if (typeof schoolClass.name !== "string") return false;
  if (!Array.isArray(schoolClass.students)) return false;
  if (schoolClass.archived !== undefined && typeof schoolClass.archived !== "boolean") return false;
  return schoolClass.students.every(isValidStudent);
}

export function isValidSession(session: unknown): session is CheckSession {
  if (!isPlainObject(session)) return false;
  if (typeof session.id !== "string" || session.id.trim() === "") return false;
  if (typeof session.classId !== "string" || session.classId.trim() === "") return false;
  if (typeof session.className !== "string") return false;
  if (typeof session.type !== "string" || !VALID_CHECK_TYPES.includes(session.type as CheckType)) return false;
  if (typeof session.date !== "string" || Number.isNaN(Date.parse(session.date))) return false;
  if (!isPlainObject(session.statuses)) return false;
  if (!Object.values(session.statuses).every((s) => typeof s === "string" && VALID_CHECK_STATUSES.includes(s as CheckStatus))) return false;
  if (session.weekStart !== undefined) {
    if (typeof session.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(session.weekStart)) return false;
    const [year, month, day] = session.weekStart.split("-").map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() !== month - 1 ||
      dateObj.getUTCDate() !== day
    ) {
      return false;
    }
  }
  if (session.visitIndex !== undefined) {
    if (
      typeof session.visitIndex !== "number" ||
      !Number.isInteger(session.visitIndex) ||
      session.visitIndex < 1
    ) {
      return false;
    }
  }
  return true;
}

function isValidCalendarBreak(item: unknown): item is CalendarBreak {
  if (!isPlainObject(item)) return false;
  if (typeof item.id !== "string" || item.id.trim() === "") return false;
  if (typeof item.title !== "string" || item.title.trim() === "") return false;
  if (typeof item.startDate !== "string" || Number.isNaN(Date.parse(item.startDate))) return false;
  if (typeof item.endDate !== "string" || Number.isNaN(Date.parse(item.endDate))) return false;
  if (item.startDate > item.endDate) return false;
  if (item.grades !== undefined && (!Array.isArray(item.grades) || !item.grades.every((g) => typeof g === "number" && Number.isInteger(g)))) return false;
  return true;
}

function isValidWorkCalendar(calendar: unknown): calendar is WorkCalendar {
  if (!isPlainObject(calendar)) return false;
  if (typeof calendar.schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(calendar.schoolYear)) return false;
  if (typeof calendar.startDate !== "string" || Number.isNaN(Date.parse(calendar.startDate))) return false;
  if (typeof calendar.endDate !== "string" || Number.isNaN(Date.parse(calendar.endDate))) return false;
  if (calendar.startDate > calendar.endDate) return false;
  if (!Array.isArray(calendar.breaks)) return false;
  return calendar.breaks.every(isValidCalendarBreak);
}

function isValidAnnualPlanEntry(entry: unknown): entry is AnnualPlanEntry {
  if (!isPlainObject(entry)) return false;
  if (typeof entry.id !== "string" || entry.id.trim() === "") return false;
  if (typeof entry.classId !== "string" || entry.classId.trim() === "") return false;
  if (typeof entry.schoolYear !== "string") return false;
  if (typeof entry.weekStart !== "string") return false;
  if (typeof entry.topic !== "string") return false;
  if (typeof entry.note !== "string") return false;
  if (typeof entry.completed !== "boolean") return false;
  return true;
}

function isValidCalendarDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

function isValidTimestampString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function buildExpectedTeacherEvaluationId(entry: {
  scope: "student" | "class_general";
  classId: string;
  studentId?: string;
  fromWeekStart: string;
  toWeekStart: string;
}): string {
  if (entry.scope === "student") {
    return `eval:student:${entry.classId}:${entry.studentId}:${entry.fromWeekStart}:${entry.toWeekStart}`;
  }
  return `eval:class_general:${entry.classId}:${entry.fromWeekStart}:${entry.toWeekStart}`;
}

function isValidTeacherEvaluation(entry: unknown): entry is TeacherEvaluation {
  if (!isPlainObject(entry)) return false;
  if (entry.scope !== "student" && entry.scope !== "class_general") return false;
  if (typeof entry.classId !== "string" || entry.classId.trim() === "") return false;
  if (!isValidCalendarDateString(entry.fromWeekStart)) return false;
  if (!isValidCalendarDateString(entry.toWeekStart)) return false;
  if ((entry.fromWeekStart as string) > (entry.toWeekStart as string)) return false;
  if (typeof entry.text !== "string") return false;
  const trimmed = (entry.text as string).trim();
  if (trimmed === "" || trimmed.length > 2000) return false;
  if (!isValidTimestampString(entry.createdAt)) return false;
  if (!isValidTimestampString(entry.updatedAt)) return false;

  let expectedId: string;
  if (entry.scope === "student") {
    if (typeof entry.studentId !== "string" || entry.studentId.trim() === "") return false;
    expectedId = buildExpectedTeacherEvaluationId({
      scope: "student",
      classId: entry.classId as string,
      studentId: entry.studentId as string,
      fromWeekStart: entry.fromWeekStart as string,
      toWeekStart: entry.toWeekStart as string,
    });
  } else {
    if (entry.studentId !== undefined) return false;
    expectedId = buildExpectedTeacherEvaluationId({
      scope: "class_general",
      classId: entry.classId as string,
      fromWeekStart: entry.fromWeekStart as string,
      toWeekStart: entry.toWeekStart as string,
    });
  }
  if (typeof entry.id !== "string" || entry.id !== expectedId) return false;
  return true;
}

function isValidWeeklyScheduleEntry(entry: unknown): entry is WeeklyScheduleEntry {
  if (!isPlainObject(entry)) return false;
  if (typeof entry.id !== "string" || entry.id.trim() === "") return false;
  if (typeof entry.classId !== "string" || entry.classId.trim() === "") return false;
  if (typeof entry.weekday !== "number" || !Number.isInteger(entry.weekday) || entry.weekday < 1 || entry.weekday > 5) return false;
  if (typeof entry.lessonNumber !== "number" || !Number.isInteger(entry.lessonNumber) || entry.lessonNumber < 1) return false;
  return true;
}

function isValidWeeklyScheduleList(entries: unknown): entries is WeeklyScheduleEntry[] {
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

function isValidTeacherEvaluationList(entries: unknown): entries is TeacherEvaluation[] {
  if (!Array.isArray(entries)) return false;
  const seenIds = new Set<string>();
  for (const item of entries) {
    if (!isValidTeacherEvaluation(item)) return false;
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
  }
  return true;
}

function deepCloneStudent(student: Student): Student {
  return {
    ...student,
    id: student.id,
    name: student.name,
    number: student.number,
    ...(student.active !== undefined ? { active: student.active } : {}),
  };
}

function deepCloneClass(schoolClass: SchoolClass): SchoolClass {
  return {
    ...schoolClass,
    id: schoolClass.id,
    name: schoolClass.name,
    students: schoolClass.students.map(deepCloneStudent),
    ...(schoolClass.archived !== undefined ? { archived: schoolClass.archived } : {}),
  };
}

export function deepCloneSession(session: CheckSession): CheckSession {
  return {
    ...session,
    id: session.id,
    classId: session.classId,
    className: session.className,
    type: session.type,
    date: session.date,
    statuses: { ...session.statuses },
    ...(session.weekStart !== undefined ? { weekStart: session.weekStart } : {}),
    ...(session.visitIndex !== undefined ? { visitIndex: session.visitIndex } : {}),
  };
}

function deepCloneCalendarBreak(b: CalendarBreak): CalendarBreak {
  return {
    ...b,
    id: b.id,
    title: b.title,
    startDate: b.startDate,
    endDate: b.endDate,
    ...(b.grades ? { grades: [...b.grades] } : {}),
  };
}

function deepCloneCalendar(calendar: WorkCalendar): WorkCalendar {
  return {
    ...calendar,
    schoolYear: calendar.schoolYear,
    startDate: calendar.startDate,
    endDate: calendar.endDate,
    breaks: calendar.breaks.map(deepCloneCalendarBreak),
  };
}

function deepCloneAnnualPlanEntry(entry: AnnualPlanEntry): AnnualPlanEntry {
  return {
    ...entry,
    id: entry.id,
    classId: entry.classId,
    schoolYear: entry.schoolYear,
    weekStart: entry.weekStart,
    topic: entry.topic,
    note: entry.note,
    completed: entry.completed,
  };
}

function deepCloneWeeklyScheduleEntry(entry: WeeklyScheduleEntry): WeeklyScheduleEntry {
  return {
    ...entry,
    id: entry.id,
    classId: entry.classId,
    weekday: entry.weekday,
    lessonNumber: entry.lessonNumber,
  };
}

function deepCloneTeacherEvaluation(entry: TeacherEvaluation): TeacherEvaluation {
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

export function detectSchemaVersion(raw: unknown): number | null {
  if (!isPlainObject(raw)) return null;

  if (typeof raw.schemaVersion === "number" && Number.isInteger(raw.schemaVersion)) {
    return raw.schemaVersion;
  }

  if (raw.schemaVersion === undefined || raw.schemaVersion === null) {
    if (Array.isArray(raw.classes) || Array.isArray(raw.sessions)) {
      return 0;
    }
  }

  return null;
}

export function migrateV0ToV1(raw: unknown): MigrationResult {
  if (!isPlainObject(raw)) {
    return { status: "invalid_data", reason: "Input must be a valid non-null object", raw };
  }

  if (!Array.isArray(raw.classes)) {
    return { status: "invalid_data", reason: "Missing or invalid \x27classes\x27 array in legacy v0 data", raw };
  }

  for (let i = 0; i < raw.classes.length; i++) {
    const item = raw.classes[i];
    if (!isValidClass(item)) {
      return { status: "invalid_data", reason: `Invalid class structure or missing ID at index ${i}`, raw };
    }
  }

  if (!Array.isArray(raw.sessions)) {
    return { status: "invalid_data", reason: "Missing or invalid \x27sessions\x27 array in legacy v0 data", raw };
  }

  for (let i = 0; i < raw.sessions.length; i++) {
    const item = raw.sessions[i];
    if (!isValidSession(item)) {
      return { status: "invalid_data", reason: `Invalid session structure or missing ID at index ${i}`, raw };
    }
  }

  if (raw.workCalendar !== undefined && raw.workCalendar !== null) {
    if (!isValidWorkCalendar(raw.workCalendar)) {
      return { status: "invalid_data", reason: "Invalid \x27workCalendar\x27 structure in legacy v0 data", raw };
    }
  }

  if (raw.annualPlanEntries !== undefined && raw.annualPlanEntries !== null) {
    if (!Array.isArray(raw.annualPlanEntries)) {
      return { status: "invalid_data", reason: "Invalid \x27annualPlanEntries\x27 (must be array) in legacy v0 data", raw };
    }
    for (let i = 0; i < raw.annualPlanEntries.length; i++) {
      const item = raw.annualPlanEntries[i];
      if (!isValidAnnualPlanEntry(item)) {
        return { status: "invalid_data", reason: `Invalid annualPlanEntry at index ${i}`, raw };
      }
    }
  }

  if (raw.teacherEvaluations !== undefined && raw.teacherEvaluations !== null) {
    if (!isValidTeacherEvaluationList(raw.teacherEvaluations)) {
      return { status: "invalid_data", reason: "Invalid \x27teacherEvaluations\x27 (must be array of valid evaluations with unique deterministic ids) in legacy v0 data", raw };
    }
  }

  if (raw.weeklySchedule !== undefined && raw.weeklySchedule !== null) {
    if (!isValidWeeklyScheduleList(raw.weeklySchedule)) {
      return { status: "invalid_data", reason: "Invalid \x27weeklySchedule\x27 (must be array of valid entries with unique weekday/lesson slots) in legacy v0 data", raw };
    }
  }

  const result: AppData & { schemaVersion: 1 } = {
    ...raw,
    schemaVersion: 1,
    classes: (raw.classes as SchoolClass[]).map(deepCloneClass),
    sessions: (raw.sessions as CheckSession[]).map(deepCloneSession),
    ...(raw.workCalendar ? { workCalendar: deepCloneCalendar(raw.workCalendar as WorkCalendar) } : {}),
    ...(raw.annualPlanEntries ? { annualPlanEntries: (raw.annualPlanEntries as AnnualPlanEntry[]).map(deepCloneAnnualPlanEntry) } : {}),
    ...(raw.teacherEvaluations ? { teacherEvaluations: (raw.teacherEvaluations as TeacherEvaluation[]).map(deepCloneTeacherEvaluation) } : {}),
    ...(raw.weeklySchedule ? { weeklySchedule: (raw.weeklySchedule as WeeklyScheduleEntry[]).map(deepCloneWeeklyScheduleEntry) } : {}),
  };

  return {
    status: "success",
    data: result,
    migratedFrom: 0,
  };
}

export function migrateData(raw: unknown): MigrationResult {
  try {
    if (!isPlainObject(raw)) {
      return { status: "invalid_data", reason: "Input must be a valid non-null object", raw };
    }

    const version = detectSchemaVersion(raw);

    if (version === null) {
      return { status: "invalid_data", reason: "Unrecognized or corrupted data structure", raw };
    }

    if (version < 0) {
      return { status: "invalid_data", reason: `Invalid negative schema version: ${version}`, raw };
    }

    if (version > CURRENT_SCHEMA_VERSION) {
      return { status: "unsupported_future_version", schemaVersion: version, raw };
    }

    if (version === 0) {
      return migrateV0ToV1(raw);
    }

    if (version === 1) {
      if (!Array.isArray(raw.classes) || !raw.classes.every(isValidClass)) {
        return { status: "invalid_data", reason: "Invalid \x27classes\x27 array in v1 data", raw };
      }
      if (!Array.isArray(raw.sessions) || !raw.sessions.every(isValidSession)) {
        return { status: "invalid_data", reason: "Invalid \x27sessions\x27 array in v1 data", raw };
      }
      if (raw.workCalendar !== undefined && raw.workCalendar !== null && !isValidWorkCalendar(raw.workCalendar)) {
        return { status: "invalid_data", reason: "Invalid \x27workCalendar\x27 in v1 data", raw };
      }
      if (raw.annualPlanEntries !== undefined && raw.annualPlanEntries !== null) {
        if (!Array.isArray(raw.annualPlanEntries) || !raw.annualPlanEntries.every(isValidAnnualPlanEntry)) {
          return { status: "invalid_data", reason: "Invalid \x27annualPlanEntries\x27 in v1 data", raw };
        }
      }
      if (raw.teacherEvaluations !== undefined && raw.teacherEvaluations !== null) {
        if (!isValidTeacherEvaluationList(raw.teacherEvaluations)) {
          return { status: "invalid_data", reason: "Invalid \x27teacherEvaluations\x27 in v1 data", raw };
        }
      }
      if (raw.weeklySchedule !== undefined && raw.weeklySchedule !== null) {
        if (!isValidWeeklyScheduleList(raw.weeklySchedule)) {
          return { status: "invalid_data", reason: "Invalid \x27weeklySchedule\x27 in v1 data", raw };
        }
      }

      const result: AppData & { schemaVersion: 1 } = {
        ...raw,
        schemaVersion: 1,
        classes: (raw.classes as SchoolClass[]).map(deepCloneClass),
        sessions: (raw.sessions as CheckSession[]).map(deepCloneSession),
        ...(raw.workCalendar ? { workCalendar: deepCloneCalendar(raw.workCalendar as WorkCalendar) } : {}),
        ...(raw.annualPlanEntries ? { annualPlanEntries: (raw.annualPlanEntries as AnnualPlanEntry[]).map(deepCloneAnnualPlanEntry) } : {}),
        ...(raw.teacherEvaluations ? { teacherEvaluations: (raw.teacherEvaluations as TeacherEvaluation[]).map(deepCloneTeacherEvaluation) } : {}),
        ...(raw.weeklySchedule ? { weeklySchedule: (raw.weeklySchedule as WeeklyScheduleEntry[]).map(deepCloneWeeklyScheduleEntry) } : {}),
      };

      return {
        status: "success",
        data: result,
        migratedFrom: null,
      };
    }

    return { status: "invalid_data", reason: `Unhandled schema version: ${version}`, raw };
  } catch (error) {
    return {
      status: "migration_error",
      error: error instanceof Error ? error.message : String(error),
      raw,
    };
  }
}
