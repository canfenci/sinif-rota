import type { CheckSession, CheckType } from "./types";

export interface StudentStat { type: CheckType; complete: number; partial: number; missing: number; absent: number; considered: number; rate: number; }
export const checkTypes: CheckType[] = ["Ödev", "Defter", "Kitap", "Materyal"];

export function studentStats(studentId: string, sessions: CheckSession[]): StudentStat[] {
  return checkTypes.map((type) => {
    const values = sessions.filter((session) => session.type === type && session.statuses[studentId]).map((session) => session.statuses[studentId]);
    const complete = values.filter((value) => value === "complete").length;
    const partial = values.filter((value) => value === "partial").length;
    const missing = values.filter((value) => value === "missing").length;
    const absent = values.filter((value) => value === "absent").length;
    const considered = complete + partial + missing;
    return { type, complete, partial, missing, absent, considered, rate: considered ? Math.round((complete / considered) * 100) : 0 };
  });
}
