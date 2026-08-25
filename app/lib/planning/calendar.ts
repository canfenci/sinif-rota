import type { WorkCalendar } from "../types";
import {
  isSupportedAcademicYear,
  resolveDefaultWorkCalendar,
  SUPPORTED_ACADEMIC_YEARS,
} from "../academic-year";
import { dateOnly, isoDate, addDays } from "./date-utils";
import type { PlanWeek } from "./types";

export const SCIENCE_PLAN_SCHOOL_YEAR = SUPPORTED_ACADEMIC_YEARS[0];

export function createDefaultWorkCalendar(now = new Date()): WorkCalendar | null {
  return resolveDefaultWorkCalendar(now).calendar;
}

export function isSupportedSciencePlanCalendar(calendar: WorkCalendar): boolean {
  return isSupportedAcademicYear(calendar.schoolYear) && calendar.schoolYear === SCIENCE_PLAN_SCHOOL_YEAR;
}

export function isValidWorkCalendar(calendar: WorkCalendar): boolean {
  if (
    !/^\d{4}-\d{4}$/.test(calendar.schoolYear) ||
    Number.isNaN(dateOnly(calendar.startDate).getTime()) ||
    Number.isNaN(dateOnly(calendar.endDate).getTime()) ||
    calendar.startDate > calendar.endDate
  ) {
    return false;
  }
  return calendar.breaks.every(
    (item) =>
      item.title.trim() &&
      !Number.isNaN(dateOnly(item.startDate).getTime()) &&
      !Number.isNaN(dateOnly(item.endDate).getTime()) &&
      item.startDate <= item.endDate
  );
}

export function buildPlanWeeks(calendar: WorkCalendar, grade?: number): PlanWeek[] {
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
      const breaks = calendar.breaks.filter((item) => {
        const legacyGrade8JanuaryException =
          grade === 8 &&
          item.id === "2027-first-social" &&
          item.startDate === "2027-01-18" &&
          item.endDate === "2027-01-22" &&
          !item.grades?.length;
        return (
          !legacyGrade8JanuaryException &&
          item.startDate <= currentIso &&
          item.endDate >= currentIso &&
          (grade === undefined || !item.grades?.length || item.grades.includes(grade))
        );
      });
      if (breaks.length) breaks.forEach((item) => titles.add(item.title));
      else teachingDays++;
    }
    weeks.push({
      number: weeks.length + 1,
      startDate: isoDate(weekStart),
      endDate: isoDate(weekEnd > calendarEnd ? calendarEnd : weekEnd),
      teachingDays,
      breakTitles: [...titles],
    });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}
