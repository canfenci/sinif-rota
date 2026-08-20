import type { AppData, SchoolClass, Student } from "./types";

export type BulkStudentAction = "delete" | "activate" | "deactivate" | "move" | "copy";

export function nextStudentNumber(students: Student[]) {
  return students.reduce((highest, student) => Math.max(highest, student.number), 0) + 1;
}

export function classNameExists(classes: SchoolClass[], name: string, exceptId?: string) {
  const normalized = name.trim().toLocaleLowerCase("tr-TR");
  return classes.some((item) => item.id !== exceptId && item.name.trim().toLocaleLowerCase("tr-TR") === normalized);
}

export function studentNumberExists(students: Student[], number: number, exceptId?: string) {
  return students.some((student) => student.id !== exceptId && student.number === number);
}

export function removeClass(data: AppData, classId: string): AppData {
  return {
    classes: data.classes.filter((item) => item.id !== classId),
    sessions: data.sessions.filter((session) => session.classId !== classId),
  };
}

export function removeStudent(data: AppData, classId: string, studentId: string): AppData {
  return {
    classes: data.classes.map((item) => item.id !== classId ? item : {
      ...item,
      students: item.students.filter((student) => student.id !== studentId),
    }),
    sessions: data.sessions.map((session) => {
      if (session.classId !== classId || !(studentId in session.statuses)) return session;
      const { [studentId]: _removed, ...statuses } = session.statuses;
      void _removed;
      return { ...session, statuses };
    }),
  };
}

export function activeStudentCount(schoolClass: SchoolClass) {
  return schoolClass.students.filter((student) => student.active !== false).length;
}

export function transferConflicts(source: SchoolClass, target: SchoolClass, studentIds: string[]) {
  const selected = new Set(studentIds);
  const targetNumbers = new Set(target.students.map((student) => student.number));
  return source.students.filter((student) => selected.has(student.id) && targetNumbers.has(student.number));
}

export function applyBulkStudentAction(data: AppData, sourceClassId: string, studentIds: string[], action: BulkStudentAction, targetClassId: string | undefined, idFactory: () => string) {
  const source = data.classes.find((item) => item.id === sourceClassId);
  if (!source) return { data, processed: 0, skipped: studentIds.length };
  const selectedIds = new Set(studentIds);

  if (action === "delete") {
    const next = studentIds.reduce((current, studentId) => removeStudent(current, sourceClassId, studentId), data);
    return { data: next, processed: studentIds.length, skipped: 0 };
  }

  if (action === "activate" || action === "deactivate") {
    const active = action === "activate";
    return {
      data: { ...data, classes: data.classes.map((item) => item.id !== sourceClassId ? item : { ...item, students: item.students.map((student) => selectedIds.has(student.id) ? { ...student, active } : student) }) },
      processed: studentIds.length,
      skipped: 0,
    };
  }

  const target = data.classes.find((item) => item.id === targetClassId);
  if (!target || target.id === source.id) return { data, processed: 0, skipped: studentIds.length };
  const conflictNumbers = new Set(transferConflicts(source, target, studentIds).map((student) => student.number));
  const transferable = source.students.filter((student) => selectedIds.has(student.id) && !conflictNumbers.has(student.number));
  const transferredIds = new Set(transferable.map((student) => student.id));
  const additions = action === "copy" ? transferable.map((student) => ({ ...student, id: idFactory() })) : transferable;
  return {
    data: {
      ...data,
      classes: data.classes.map((item) => {
        if (item.id === target.id) return { ...item, students: [...item.students, ...additions].sort((a, b) => a.number - b.number) };
        if (item.id === source.id && action === "move") return { ...item, students: item.students.filter((student) => !transferredIds.has(student.id)) };
        return item;
      }),
    },
    processed: transferable.length,
    skipped: studentIds.length - transferable.length,
  };
}

export function duplicateClass(data: AppData, classId: string, idFactory: () => string): { data: AppData; classId?: string } {
  const source = data.classes.find((item) => item.id === classId);
  if (!source) return { data };
  const usedNames = new Set(data.classes.map((item) => item.name.toLocaleLowerCase("tr-TR")));
  let name = `${source.name} Kopya`;
  let suffix = 2;
  while (usedNames.has(name.toLocaleLowerCase("tr-TR"))) name = `${source.name} Kopya ${suffix++}`;
  const newClassId = idFactory();
  const copy: SchoolClass = { id: newClassId, name, students: source.students.map((student) => ({ ...student, id: idFactory() })), archived: false };
  return { data: { ...data, classes: [...data.classes, copy] }, classId: newClassId };
}
