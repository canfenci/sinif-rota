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

export interface Grade5SciencePlanItem {
  unit: number;
  title: string;
  hours: number;
  outcomeCode?: string;
  extra?: boolean;
}

export interface Grade5SciencePlanWeek {
  weekStart: string;
  term: 1 | 2;
  items: Grade5SciencePlanItem[];
  totalHours: number;
}

export interface Grade5SciencePlan {
  schoolYear: "2026-2027";
  weeklyHours: 4;
  curriculumHours: 134;
  teacherExtraHours: 2;
  totalHours: 136;
  firstTermHours: 68;
  secondTermHours: 68;
  weeks: Grade5SciencePlanWeek[];
}

type Grade5ScienceBlock = Omit<Grade5SciencePlanItem, "hours"> & { hours: number };

export const grade5ScienceUnitHours = [
  { unit: 1, title: "Gökyüzündeki Komşularımız ve Biz", hours: 22 },
  { unit: 2, title: "Kuvveti Tanıyalım", hours: 24 },
  { unit: 3, title: "Canlıların Yapısına Yolculuk", hours: 22 },
  { unit: 4, title: "Işığın Dünyası", hours: 14 },
  { unit: 5, title: "Maddenin Doğası", hours: 26 },
  { unit: 6, title: "Yaşamımızdaki Elektrik", hours: 16 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Geri Dönüşüm", hours: 10 },
] as const;

const calendar20262027: WorkCalendar = {
  schoolYear: "2026-2027",
  startDate: "2026-09-14",
  endDate: "2027-06-25",
  breaks: [
    { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
    { id: "2027-first-social", title: "Sosyal Etkinlik Haftası", startDate: "2027-01-18", endDate: "2027-01-22" },
    { id: "2027-semester-break", title: "Yarıyıl Tatili", startDate: "2027-01-25", endDate: "2027-02-05" },
    { id: "2027-second-break", title: "2. Dönem Ara Tatili", startDate: "2027-03-08", endDate: "2027-03-12" },
    { id: "2027-second-social-1", title: "Sosyal Etkinlik Haftası", startDate: "2027-06-14", endDate: "2027-06-18" },
    { id: "2027-second-social-2", title: "Sosyal Etkinlik Haftası", startDate: "2027-06-21", endDate: "2027-06-25" },
  ],
};

export function createDefaultWorkCalendar(now = new Date()): WorkCalendar {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  if (year === 2026) return { ...calendar20262027, breaks: calendar20262027.breaks.map((item) => ({ ...item })) };
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

export function isGrade5Class(name: string) {
  return /^5(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

function allocateGrade5ScienceWeeks(weeks: PlanWeek[], term: 1 | 2, blocks: Grade5ScienceBlock[]) {
  let blockIndex = 0;
  let blockRemaining = blocks[0]?.hours ?? 0;
  return weeks.map<Grade5SciencePlanWeek>((week) => {
    let capacity = 4;
    const items: Grade5SciencePlanItem[] = [];
    while (capacity > 0 && blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      const hours = Math.min(capacity, blockRemaining);
      items.push({ unit: block.unit, title: block.title, outcomeCode: block.outcomeCode, extra: block.extra, hours });
      capacity -= hours;
      blockRemaining -= hours;
      if (blockRemaining === 0) {
        blockIndex++;
        blockRemaining = blocks[blockIndex]?.hours ?? 0;
      }
    }
    return { weekStart: week.startDate, term, items, totalHours: items.reduce((sum, item) => sum + item.hours, 0) };
  });
}

export function buildGrade5SciencePlan(calendar: WorkCalendar): Grade5SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const weeks = buildPlanWeeks(calendar);
  const firstTermWeeks = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0).slice(0, 17);
  const secondTermWeeks = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-14" && week.teachingDays > 0).slice(0, 17);
  if (firstTermWeeks.length !== 17 || secondTermWeeks.length !== 17) return null;

  const firstTermBlocks: Grade5ScienceBlock[] = [
    { unit: 1, title: "1. Ünite — Gökyüzündeki Komşularımız ve Biz", hours: 22 },
    { unit: 2, title: "2. Ünite — Kuvveti Tanıyalım", hours: 24 },
    { unit: 2, title: "FB.5.2.3.2 — Pekiştirme, deney ve uygulama", outcomeCode: "FB.5.2.3.2", extra: true, hours: 2 },
    { unit: 3, title: "3. Ünite — Canlıların Yapısına Yolculuk (FB.5.3.2.1'e kadar)", hours: 20 },
  ];
  const secondTermBlocks: Grade5ScienceBlock[] = [
    { unit: 3, title: "FB.5.3.2.2 — 3. ünitenin son öğrenme çıktısı", outcomeCode: "FB.5.3.2.2", hours: 2 },
    { unit: 4, title: "4. Ünite — Işığın Dünyası", hours: 14 },
    { unit: 5, title: "5. Ünite — Maddenin Doğası", hours: 26 },
    { unit: 6, title: "6. Ünite — Yaşamımızdaki Elektrik", hours: 16 },
    { unit: 7, title: "7. Ünite — Sürdürülebilir Yaşam ve Geri Dönüşüm", hours: 10 },
  ];

  return {
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 134,
    teacherExtraHours: 2,
    totalHours: 136,
    firstTermHours: 68,
    secondTermHours: 68,
    weeks: [
      ...allocateGrade5ScienceWeeks(firstTermWeeks, 1, firstTermBlocks),
      ...allocateGrade5ScienceWeeks(secondTermWeeks, 2, secondTermBlocks),
    ],
  };
}

export function updateAnnualPlanEntry(data: AppData, classId: string, calendar: WorkCalendar, weekStart: string, patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">, idFactory: () => string): AppData {
  const entries = data.annualPlanEntries ?? [];
  const existing = entries.find((item) => item.classId === classId && item.schoolYear === calendar.schoolYear && item.weekStart === weekStart);
  const clean = { topic: patch.topic.trim(), note: patch.note.trim(), completed: patch.completed };
  if (!clean.topic && !clean.note && !clean.completed) return { ...data, annualPlanEntries: entries.filter((item) => item !== existing) };
  const entry: AnnualPlanEntry = { id: existing?.id ?? idFactory(), classId, schoolYear: calendar.schoolYear, weekStart, ...clean };
  return { ...data, annualPlanEntries: existing ? entries.map((item) => item === existing ? entry : item) : [...entries, entry] };
}
