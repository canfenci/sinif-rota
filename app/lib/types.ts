export type CheckType = "Ödev" | "Defter" | "Kitap" | "Materyal";
export type CheckStatus = "complete" | "partial" | "missing" | "absent";

export interface Student { id: string; name: string; number: number; }
export interface SchoolClass { id: string; name: string; students: Student[]; }
export interface CheckSession {
  id: string;
  classId: string;
  className: string;
  type: CheckType;
  date: string;
  statuses: Record<string, CheckStatus>;
}
export interface AppData { classes: SchoolClass[]; sessions: CheckSession[]; }
