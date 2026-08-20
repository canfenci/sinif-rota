import type { AppData, SchoolClass, Student } from "./types";

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
