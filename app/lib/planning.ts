import type { AnnualPlanEntry, AppData, WorkCalendar } from "./types";

const DAY = 86_400_000;

function dateOnly(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(value: Date, count: number) { return new Date(value.getTime() + count * DAY); }

export interface PlanWeek {
  number: number;
  startDate: string;
  endDate: string;
  teachingDays: number;
  breakTitles: string[];
}

export function createDefaultWorkCalendar(now = new Date()): WorkCalendar {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  let start = new Date(Date.UTC(year, 8, 1));
  while (start.getUTCDay() !== 1) start = addDays(start, 1);
  const june = new Date(Date.UTC(year + 1, 5, 1));
  let fridayCount = 0;
  let end = june;
  for (let day = june; day.getUTCMonth() === 5; day = addDays(day, 1)) {
    if (day.getUTCDay() === 5 && ++fridayCount === 3) { end = day; break; }
  }
  return { schoolYear: `${year}-${year + 1}`, startDate: isoDate(start), endDate: isoDate(end), breaks: [] };
}

export function isValidWorkCalendar(calendar: WorkCalendar) {
  if (!/^\d{4}-\d{4}$/.test(calendar.schoolYear) || Number.isNaN(dateOnly(calendar.startDate).getTime()) || Number.isNaN(dateOnly(calendar.endDate).getTime()) || calendar.startDate > calendar.endDate) return false;
  return calendar.breaks.every((item) => item.title.trim() && !Number.isNaN(dateOnly(item.startDate).getTime()) && !Number.isNaN(dateOnly(item.endDate).getTime()) && item.startDate <= item.endDate);
}

export function buildPlanWeeks(calendar: WorkCalendar): PlanWeek[] {
  if (!isValidWorkCalendar(calendar)) return [];
  const calendarStart = dateOnly(calendar.startDate);
  const calendarEnd = dateOnly(calendar.endDate);
  const day = calendarStart.getUTCDay() || 7;
  let weekStart = addDays(calendarStart, 1 - day);
  const weeks: PlanWeek[] = [];
  while (weekStart <= calendarEnd) {
    const weekEnd = addDays(weekStart, 6);
    let teachingDays = 0;
    const titles = new Set<string>();
    for (let offset = 0; offset < 5; offset++) {
      const current = addDays(weekStart, offset);
      if (current < calendarStart || current > calendarEnd) continue;
      const currentIso = isoDate(current);
      const breaks = calendar.breaks.filter((item) => item.startDate <= currentIso && item.endDate >= currentIso);
      if (breaks.length) breaks.forEach((item) => titles.add(item.title));
      else teachingDays++;
    }
    weeks.push({ number: weeks.length + 1, startDate: isoDate(weekStart), endDate: isoDate(weekEnd > calendarEnd ? calendarEnd : weekEnd), teachingDays, breakTitles: [...titles] });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

export function updateAnnualPlanEntry(data: AppData, classId: string, calendar: WorkCalendar, weekStart: string, patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">, idFactory: () => string): AppData {
  const entries = data.annualPlanEntries ?? [];
  const existing = entries.find((item) => item.classId === classId && item.schoolYear === calendar.schoolYear && item.weekStart === weekStart);
  const clean = { topic: patch.topic.trim(), note: patch.note.trim(), completed: patch.completed };
  if (!clean.topic && !clean.note && !clean.completed) return { ...data, annualPlanEntries: entries.filter((item) => item !== existing) };
  const entry: AnnualPlanEntry = { id: existing?.id ?? idFactory(), classId, schoolYear: calendar.schoolYear, weekStart, ...clean };
  return { ...data, annualPlanEntries: existing ? entries.map((item) => item === existing ? entry : item) : [...entries, entry] };
}
