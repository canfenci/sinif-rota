import type { AnnualPlanEntry, AppData, WorkCalendar } from "../types";

export function updateAnnualPlanEntry(
  data: AppData,
  classId: string,
  calendar: WorkCalendar,
  weekStart: string,
  patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">,
  idFactory: () => string
): AppData {
  const entries = data.annualPlanEntries ?? [];
  const existing = entries.find((item) => item.classId === classId && item.schoolYear === calendar.schoolYear && item.weekStart === weekStart);
  const clean = { topic: patch.topic.trim(), note: patch.note.trim(), completed: patch.completed };
  if (!clean.topic && !clean.note && !clean.completed) return { ...data, annualPlanEntries: entries.filter((item) => item !== existing) };
  const entry: AnnualPlanEntry = { id: existing?.id ?? idFactory(), classId, schoolYear: calendar.schoolYear, weekStart, ...clean };
  return { ...data, annualPlanEntries: existing ? entries.map((item) => item === existing ? entry : item) : [...entries, entry] };
}
