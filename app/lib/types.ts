export type CheckType = "Ödev" | "Defter" | "Kitap" | "Materyal";
export type CheckStatus = "complete" | "partial" | "missing" | "absent";

export interface Student { id: string; name: string; number: number; active?: boolean; }
export interface SchoolClass { id: string; name: string; students: Student[]; archived?: boolean; }
export interface CheckSession {
  id: string;
  classId: string;
  className: string;
  type: CheckType;
  date: string;
  statuses: Record<string, CheckStatus>;
}
export interface CalendarBreak { id: string; title: string; startDate: string; endDate: string; }
export interface WorkCalendar { schoolYear: string; startDate: string; endDate: string; breaks: CalendarBreak[]; }
export interface AnnualPlanEntry {
  id: string;
  classId: string;
  schoolYear: string;
  weekStart: string;
  topic: string;
  note: string;
  completed: boolean;
}
export interface AppData {
  classes: SchoolClass[];
  sessions: CheckSession[];
  workCalendar?: WorkCalendar;
  annualPlanEntries?: AnnualPlanEntry[];
}
