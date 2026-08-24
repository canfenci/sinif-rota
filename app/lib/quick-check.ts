import type { CheckStatus, Student } from "./types";

export function createInitialCheckStatuses(students: Student[]): Record<string, CheckStatus> {
  return Object.fromEntries(students.filter((student) => student.active !== false).map((student) => [student.id, "complete"]));
}

export function updateCheckStatus(statuses: Record<string, CheckStatus>, studentId: string, status: CheckStatus): Record<string, CheckStatus> {
  return { ...statuses, [studentId]: status };
}
