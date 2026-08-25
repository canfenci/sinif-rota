import type { WorkCalendar } from "./types";

export const SUPPORTED_ACADEMIC_YEARS = ["2026-2027"] as const;

export type SupportedAcademicYear = (typeof SUPPORTED_ACADEMIC_YEARS)[number];
export type CalendarSupportState = "supported_current" | "supported_historical" | "unsupported_year";
export type DefaultWorkCalendarResolution =
  | { status: "supported"; schoolYear: SupportedAcademicYear; calendar: WorkCalendar }
  | { status: "unsupported_year"; schoolYear: string; calendar: null };

const officialCalendars: Record<SupportedAcademicYear, WorkCalendar> = {
  "2026-2027": {
    schoolYear: "2026-2027",
    startDate: "2026-09-14",
    endDate: "2027-06-25",
    breaks: [
      { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
      { id: "2027-first-social", title: "Sosyal Etkinlik Haftası", startDate: "2027-01-18", endDate: "2027-01-22", grades: [5, 6, 7] },
      { id: "2027-semester-break", title: "Yarıyıl Tatili", startDate: "2027-01-25", endDate: "2027-02-05" },
      { id: "2027-second-break", title: "2. Dönem Ara Tatili", startDate: "2027-03-08", endDate: "2027-03-12" },
      { id: "2027-second-social-2", title: "Sosyal Etkinlik Haftası", startDate: "2027-06-21", endDate: "2027-06-25", grades: [5, 6, 7] },
    ],
  },
};

function cloneWorkCalendar(calendar: WorkCalendar): WorkCalendar {
  return {
    ...calendar,
    breaks: calendar.breaks.map((item) => ({
      ...item,
      grades: item.grades ? [...item.grades] : undefined,
    })),
  };
}

export function isSupportedAcademicYear(value: string): value is SupportedAcademicYear {
  return (SUPPORTED_ACADEMIC_YEARS as readonly string[]).includes(value);
}

export function resolveAcademicYearId(now: Date): string {
  const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getOfficialWorkCalendar(schoolYear: string): WorkCalendar | null {
  if (!isSupportedAcademicYear(schoolYear)) return null;
  return cloneWorkCalendar(officialCalendars[schoolYear]);
}

export function resolveDefaultWorkCalendar(now = new Date()): DefaultWorkCalendarResolution {
  const schoolYear = resolveAcademicYearId(now);
  const calendar = getOfficialWorkCalendar(schoolYear);
  if (!calendar || !isSupportedAcademicYear(schoolYear)) {
    return { status: "unsupported_year", schoolYear, calendar: null };
  }
  return { status: "supported", schoolYear, calendar };
}

export function getCalendarSupportState(calendar: WorkCalendar, now = new Date()): CalendarSupportState {
  if (!isSupportedAcademicYear(calendar.schoolYear)) return "unsupported_year";
  return calendar.schoolYear === resolveAcademicYearId(now) ? "supported_current" : "supported_historical";
}
