import type { CheckSession, CheckStatus, CheckType, Student, WorkCalendar } from "./types";
import { resolveSessionWeekStart } from "./session-week";

export function createInitialCheckStatuses(students: Student[]): Record<string, CheckStatus> {
  return Object.fromEntries(students.filter((student) => student.active !== false).map((student) => [student.id, "complete"]));
}

export function updateCheckStatus(statuses: Record<string, CheckStatus>, studentId: string, status: CheckStatus): Record<string, CheckStatus> {
  return { ...statuses, [studentId]: status };
}

export function getStatusPresentation(type: CheckType, status: CheckStatus): { label: string; title: string } {
  const isHomework = type === "Ödev";
  switch (status) {
    case "complete":
      return { label: "✓", title: isHomework ? "Yaptı" : "Getirdi" };
    case "partial":
      return { label: "~", title: "Eksik" };
    case "missing":
      return { label: "×", title: isHomework ? "Yapmadı" : "Getirmedi" };
    case "absent":
      return { label: "G", title: "Gelmedi" };
  }
}

export interface ExistingVisitSummary {
  visitIndex: number;
  types: CheckType[];
}

export function getExistingVisitsForWeek(
  sessions: CheckSession[],
  classId: string,
  weekStart: string,
  calendar?: WorkCalendar
): {
  visits: ExistingVisitSummary[];
  hasLegacySessions: boolean;
} {
  const matchingSessions = sessions.filter((session) => {
    if (session.classId !== classId) return false;
    const sessionWeek = session.weekStart ?? resolveSessionWeekStart(session.date, calendar);
    return sessionWeek === weekStart;
  });

  let hasLegacySessions = false;
  const visitsMap = new Map<number, Set<CheckType>>();

  for (const session of matchingSessions) {
    if (session.visitIndex === undefined) {
      hasLegacySessions = true;
      continue;
    }
    if (!visitsMap.has(session.visitIndex)) {
      visitsMap.set(session.visitIndex, new Set());
    }
    visitsMap.get(session.visitIndex)!.add(session.type);
  }

  const visits: ExistingVisitSummary[] = Array.from(visitsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([visitIndex, typeSet]) => ({
      visitIndex,
      types: Array.from(typeSet),
    }));

  return { visits, hasLegacySessions };
}

export function getNextVisitIndex(existingVisits: ExistingVisitSummary[]): number {
  if (!existingVisits.length) return 1;
  const maxIndex = Math.max(...existingVisits.map((v) => v.visitIndex));
  return maxIndex + 1;
}

export function isDuplicateSession(
  sessions: CheckSession[],
  classId: string,
  weekStart: string,
  visitIndex: number,
  type: CheckType,
  calendar?: WorkCalendar
): boolean {
  return sessions.some((session) => {
    if (session.classId !== classId || session.type !== type) return false;
    if (session.visitIndex !== visitIndex) return false;
    const sessionWeek = session.weekStart ?? resolveSessionWeekStart(session.date, calendar);
    return sessionWeek === weekStart;
  });
}
