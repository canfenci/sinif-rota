export type CheckType = "Ödev" | "Defter" | "Kitap" | "Materyal";
export type CheckStatus = "complete" | "partial" | "missing" | "absent";

export interface Student { id: string; name: string; number: number; active?: boolean; [key: string]: unknown; }
export interface SchoolClass { id: string; name: string; students: Student[]; archived?: boolean; [key: string]: unknown; }
export interface CheckSession {
  id: string;
  classId: string;
  className: string;
  type: CheckType;
  date: string;
  statuses: Record<string, CheckStatus>;
  weekStart?: string;
  visitIndex?: number;
  [key: string]: unknown;
}
export interface CalendarBreak { id: string; title: string; startDate: string; endDate: string; grades?: number[]; [key: string]: unknown; }
export interface WorkCalendar { schoolYear: string; startDate: string; endDate: string; breaks: CalendarBreak[]; [key: string]: unknown; }
export interface AnnualPlanEntry {
  id: string;
  classId: string;
  schoolYear: string;
  weekStart: string;
  topic: string;
  note: string;
  completed: boolean;
  [key: string]: unknown;
}
export type TeacherEvaluationScope = "student" | "class_general";
export interface TeacherEvaluation {
  id: string;
  scope: TeacherEvaluationScope;
  classId: string;
  studentId?: string;
  fromWeekStart: string;
  toWeekStart: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
export type ScheduleWeekday = 1 | 2 | 3 | 4 | 5;
export interface WeeklyScheduleEntry {
  id: string;
  classId: string;
  weekday: ScheduleWeekday;
  lessonNumber: number;
  [key: string]: unknown;
}
export interface AppData {
  schemaVersion?: number;
  classes: SchoolClass[];
  sessions: CheckSession[];
  workCalendar?: WorkCalendar;
  annualPlanEntries?: AnnualPlanEntry[];
  teacherEvaluations?: TeacherEvaluation[];
  weeklySchedule?: WeeklyScheduleEntry[];
  [key: string]: unknown;
}

export type VersionedAppData = AppData & {
  schemaVersion: number;
};
