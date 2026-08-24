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

export interface SciencePlanItem {
  unit: number;
  unitTitle: string;
  title: string;
  hours: number;
  outcomeCode?: string;
  badge?: string;
  curriculum: CurriculumOutcome | null;
  allocation: AnnualPlanAllocation;
}

export interface CurriculumOutcome {
  grade: number;
  curriculumVersion: string;
  unitId: string;
  unitTitle: string;
  code: string;
  officialDescription: string | null;
  officialSource: string | null;
  processComponents: string[];
  contentFramework: string[];
  keyConcepts: string[];
  learningEvidence: string[];
  learningTeachingExperiences: string[];
  differentiation: string[];
  skills: string[];
  values: string[];
  literacySkills: string[];
}

export interface AnnualPlanAllocation {
  schoolYear: string;
  grade: number;
  classId: string | null;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  outcomeCode: string | null;
  allocatedHours: number;
  plannedTotalHours: number;
  completedBeforeHours: number;
  completedAfterHours: number;
  source: "auto" | "manual";
  teacherNote: string | null;
  completed: boolean;
}

export interface SciencePlanWeek {
  weekStart: string;
  term: 1 | 2;
  items: SciencePlanItem[];
  totalHours: number;
}

export interface SciencePlan {
  grade: 5 | 6;
  schoolYear: "2026-2027";
  weeklyHours: 4;
  curriculumHours: number;
  capacityAdjustmentHours: number;
  totalHours: number;
  firstTermHours: 68;
  secondTermHours: number;
  weeks: SciencePlanWeek[];
}

export type Grade5SciencePlanItem = SciencePlanItem;
export type Grade5SciencePlanWeek = SciencePlanWeek;
export type Grade5SciencePlan = SciencePlan & { grade: 5; curriculumHours: 140; capacityAdjustmentHours: 0; totalHours: 140; secondTermHours: 72 };
export type Grade6SciencePlan = SciencePlan & { grade: 6; curriculumHours: 138; capacityAdjustmentHours: 2; totalHours: 140; secondTermHours: 72 };

type ScienceBlock = {
  unit: number;
  unitTitle: string;
  title: string;
  hours: number;
  outcomeCode?: string;
  badge?: string;
  curriculum?: CurriculumOutcome | null;
  plannedTotalHours?: number;
  initialCompletedHours?: number;
};

export const grade5ScienceUnitHours = [
  { unit: 1, title: "Gökyüzündeki Komşularımız ve Biz", hours: 22 },
  { unit: 2, title: "Kuvveti Tanıyalım", hours: 24 },
  { unit: 3, title: "Canlıların Yapısına Yolculuk", hours: 22 },
  { unit: 4, title: "Işığın Dünyası", hours: 14 },
  { unit: 5, title: "Maddenin Doğası", hours: 26 },
  { unit: 6, title: "Yaşamımızdaki Elektrik", hours: 16 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Geri Dönüşüm", hours: 12 },
] as const;

const grade5UnitTitles = new Map<number, string>(grade5ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade5Outcome(unit: number, code: string): CurriculumOutcome {
  return {
    grade: 5,
    curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
    unitId: `FB.5.${unit}`,
    unitTitle: grade5UnitTitles.get(unit) ?? `${unit}. Ünite`,
    code,
    officialDescription: null,
    officialSource: null,
    processComponents: [],
    contentFramework: [],
    keyConcepts: [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade5ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.5.1.1.1", "FB.5.1.2.1", "FB.5.1.2.2", "FB.5.1.3.1"].map((code) => grade5Outcome(1, code)),
  ...["FB.5.2.1.1", "FB.5.2.1.2", "FB.5.2.2.1", "FB.5.2.3.1", "FB.5.2.3.2"].map((code) => grade5Outcome(2, code)),
  ...["FB.5.3.1.1", "FB.5.3.1.2", "FB.5.3.2.1", "FB.5.3.2.2"].map((code) => grade5Outcome(3, code)),
  ...["FB.5.4.1.1", "FB.5.4.2.1", "FB.5.4.3.1"].map((code) => grade5Outcome(4, code)),
  ...["FB.5.5.1.1", "FB.5.5.2.1", "FB.5.5.2.2", "FB.5.5.3.1", "FB.5.5.4.1", "FB.5.5.4.2"].map((code) => grade5Outcome(5, code)),
  ...["FB.5.6.1.1", "FB.5.6.1.2", "FB.5.6.2.1", "FB.5.6.2.2"].map((code) => grade5Outcome(6, code)),
  ...["FB.5.7.1.1", "FB.5.7.1.2", "FB.5.7.1.3"].map((code) => grade5Outcome(7, code)),
];

const grade5CurriculumByCode = new Map(grade5ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade5Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade5CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

export const grade6ScienceUnitHours = [
  { unit: 1, title: "Güneş Sistemi ve Tutulmalar", curriculumHours: 12, planHours: 12 },
  { unit: 2, title: "Kuvvetin Etkisinde Hareket", curriculumHours: 14, planHours: 14 },
  { unit: 3, title: "Canlılarda Sistemler", curriculumHours: 22, planHours: 24 },
  { unit: 4, title: "Işığın Yansıması ve Renkler", curriculumHours: 22, planHours: 22 },
  { unit: 5, title: "Maddenin Ayırt Edici Özellikleri", curriculumHours: 32, planHours: 32 },
  { unit: 6, title: "Elektriğin İletimi ve Direnç", curriculumHours: 18, planHours: 18 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Etkileşim", curriculumHours: 18, planHours: 18 },
] as const;

const grade6UnitTitles = new Map<number, string>(grade6ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade6Outcome(unit: number, code: string): CurriculumOutcome {
  return {
    grade: 6,
    curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
    unitId: `FB.6.${unit}`,
    unitTitle: grade6UnitTitles.get(unit) ?? `${unit}. Ünite`,
    code,
    officialDescription: null,
    officialSource: null,
    processComponents: [],
    contentFramework: [],
    keyConcepts: [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade6ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.6.1.1.1", "FB.6.1.1.2", "FB.6.1.2.1", "FB.6.1.2.2"].map((code) => grade6Outcome(1, code)),
  ...["FB.6.2.1.1", "FB.6.2.1.2", "FB.6.2.2.1"].map((code) => grade6Outcome(2, code)),
  ...["FB.6.3.1.1", "FB.6.3.1.2", "FB.6.3.1.3", "FB.6.3.1.4", "FB.6.3.1.5", "FB.6.3.2.1", "FB.6.3.2.2", "FB.6.3.2.3", "FB.6.3.2.4"].map((code) => grade6Outcome(3, code)),
  ...["FB.6.4.1.1", "FB.6.4.1.2", "FB.6.4.2.1", "FB.6.4.3.1", "FB.6.4.3.2", "FB.6.4.3.3", "FB.6.4.3.4"].map((code) => grade6Outcome(4, code)),
  ...["FB.6.5.1.1", "FB.6.5.2.1", "FB.6.5.3.1", "FB.6.5.3.2", "FB.6.5.3.3", "FB.6.5.3.4"].map((code) => grade6Outcome(5, code)),
  ...["FB.6.6.1.1", "FB.6.6.2.1", "FB.6.6.2.2"].map((code) => grade6Outcome(6, code)),
  ...["FB.6.7.1.1", "FB.6.7.1.2", "FB.6.7.2.1", "FB.6.7.2.2"].map((code) => grade6Outcome(7, code)),
];

const grade6CurriculumByCode = new Map(grade6ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade6Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "badge" | "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade6CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

const calendar20262027: WorkCalendar = {
  schoolYear: "2026-2027",
  startDate: "2026-09-14",
  endDate: "2027-06-25",
  breaks: [
    { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
    { id: "2027-first-social", title: "Sosyal Etkinlik Haftası", startDate: "2027-01-18", endDate: "2027-01-22" },
    { id: "2027-semester-break", title: "Yarıyıl Tatili", startDate: "2027-01-25", endDate: "2027-02-05" },
    { id: "2027-second-break", title: "2. Dönem Ara Tatili", startDate: "2027-03-08", endDate: "2027-03-12" },
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
      const breaks = calendar.breaks.filter((item) => item.startDate <= currentIso && item.endDate >= currentIso && (grade === undefined || !item.grades?.length || item.grades.includes(grade)));
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

export function isGrade6Class(name: string) {
  return /^6(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

function getGrade6ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 6);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

function allocateScienceWeeks(weeks: PlanWeek[], term: 1 | 2, blocks: ScienceBlock[]) {
  let blockIndex = 0;
  let blockRemaining = blocks[0]?.hours ?? 0;
  let completedInBlock = blocks[0]?.initialCompletedHours ?? 0;
  return weeks.map<SciencePlanWeek>((week) => {
    let capacity = 4;
    const items: SciencePlanItem[] = [];
    while (capacity > 0 && blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      const hours = Math.min(capacity, blockRemaining);
      const completedBeforeHours = completedInBlock;
      completedInBlock += hours;
      items.push({
        unit: block.unit,
        unitTitle: block.unitTitle,
        title: block.title,
        outcomeCode: block.outcomeCode,
        badge: block.badge,
        hours,
        curriculum: block.curriculum ?? null,
        allocation: {
          schoolYear: "2026-2027",
          grade: block.curriculum?.grade ?? (block.outcomeCode?.startsWith("FB.6") ? 6 : 5),
          classId: null,
          weekId: week.startDate,
          weekStart: week.startDate,
          weekEnd: week.endDate,
          outcomeCode: block.outcomeCode ?? null,
          allocatedHours: hours,
          plannedTotalHours: block.plannedTotalHours ?? block.hours,
          completedBeforeHours,
          completedAfterHours: completedInBlock,
          source: "auto",
          teacherNote: null,
          completed: false,
        },
      });
      capacity -= hours;
      blockRemaining -= hours;
      if (blockRemaining === 0) {
        blockIndex++;
        blockRemaining = blocks[blockIndex]?.hours ?? 0;
        completedInBlock = blocks[blockIndex]?.initialCompletedHours ?? 0;
      }
    }
    return { weekStart: week.startDate, term, items, totalHours: items.reduce((sum, item) => sum + item.hours, 0) };
  });
}

export function buildGrade5SciencePlan(calendar: WorkCalendar): Grade5SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const weeks = buildPlanWeeks(calendar, 5);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  if (firstTerm.length !== 17 || secondTerm.length !== 18) return null;

  const firstTermBlocks: ScienceBlock[] = [
    { unit: 0, unitTitle: "Dönem Hazırlığı", title: "LABORATUVAR GÜVENLİĞİ VE LABORATUVAR KURALLARI", badge: "hazırlık", hours: 4 },
    grade5Block(1, "FB.5.1.1.1", 8), grade5Block(1, "FB.5.1.2.1", 4), grade5Block(1, "FB.5.1.2.2", 6), grade5Block(1, "FB.5.1.3.1", 4),
    grade5Block(2, "FB.5.2.1.1", 6), grade5Block(2, "FB.5.2.1.2", 4), grade5Block(2, "FB.5.2.2.1", 4), grade5Block(2, "FB.5.2.3.1", 4), grade5Block(2, "FB.5.2.3.2", 6),
    grade5Block(3, "FB.5.3.1.1", 6), grade5Block(3, "FB.5.3.1.2", 6), grade5Block(3, "FB.5.3.2.1", 6, { plannedTotalHours: 8 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade5Block(3, "FB.5.3.2.1", 2, { initialCompletedHours: 6, plannedTotalHours: 8 }), grade5Block(3, "FB.5.3.2.2", 2),
    grade5Block(4, "FB.5.4.1.1", 4), grade5Block(4, "FB.5.4.2.1", 4), grade5Block(4, "FB.5.4.3.1", 6),
    grade5Block(5, "FB.5.5.1.1", 4), grade5Block(5, "FB.5.5.2.1", 4), grade5Block(5, "FB.5.5.2.2", 4), grade5Block(5, "FB.5.5.3.1", 6), grade5Block(5, "FB.5.5.4.1", 4), grade5Block(5, "FB.5.5.4.2", 4),
    grade5Block(6, "FB.5.6.1.1", 2), grade5Block(6, "FB.5.6.1.2", 4), grade5Block(6, "FB.5.6.2.1", 4), grade5Block(6, "FB.5.6.2.2", 6),
    grade5Block(7, "FB.5.7.1.1", 4), grade5Block(7, "FB.5.7.1.2", 4), grade5Block(7, "FB.5.7.1.3", 4),
  ];

  return {
    grade: 5,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 140,
    capacityAdjustmentHours: 0,
    totalHours: 140,
    firstTermHours: 68,
    secondTermHours: 72,
    weeks: [
      ...allocateScienceWeeks(firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildGrade6SciencePlan(calendar: WorkCalendar): Grade6SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const termWeeks = getGrade6ScienceTermWeeks(calendar);
  if (!termWeeks) return null;

  const firstTermBlocks: ScienceBlock[] = [
    grade6Block(1, "FB.6.1.1.1", 4), grade6Block(1, "FB.6.1.1.2", 4), grade6Block(1, "FB.6.1.2.1", 2), grade6Block(1, "FB.6.1.2.2", 2),
    grade6Block(2, "FB.6.2.1.1", 4), grade6Block(2, "FB.6.2.1.2", 4), grade6Block(2, "FB.6.2.2.1", 6),
    grade6Block(3, "FB.6.3.1.1", 2), grade6Block(3, "FB.6.3.1.2", 4), grade6Block(3, "FB.6.3.1.3", 4), grade6Block(3, "FB.6.3.1.4", 2), grade6Block(3, "FB.6.3.1.5", 4, { badge: "+2 öğretmen planlama" }), grade6Block(3, "FB.6.3.2.1", 2), grade6Block(3, "FB.6.3.2.2", 2), grade6Block(3, "FB.6.3.2.3", 2), grade6Block(3, "FB.6.3.2.4", 2),
    grade6Block(4, "FB.6.4.1.1", 2), grade6Block(4, "FB.6.4.1.2", 4), grade6Block(4, "FB.6.4.2.1", 4), grade6Block(4, "FB.6.4.3.1", 2), grade6Block(4, "FB.6.4.3.2", 4), grade6Block(4, "FB.6.4.3.3", 2, { plannedTotalHours: 4 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade6Block(4, "FB.6.4.3.3", 2, { initialCompletedHours: 2, plannedTotalHours: 4 }), grade6Block(4, "FB.6.4.3.4", 2),
    grade6Block(5, "FB.6.5.1.1", 6), grade6Block(5, "FB.6.5.2.1", 6), grade6Block(5, "FB.6.5.3.1", 6), grade6Block(5, "FB.6.5.3.2", 6), grade6Block(5, "FB.6.5.3.3", 4), grade6Block(5, "FB.6.5.3.4", 4),
    grade6Block(6, "FB.6.6.1.1", 4), grade6Block(6, "FB.6.6.2.1", 8), grade6Block(6, "FB.6.6.2.2", 6),
    grade6Block(7, "FB.6.7.1.1", 4), grade6Block(7, "FB.6.7.1.2", 4), grade6Block(7, "FB.6.7.2.1", 4), grade6Block(7, "FB.6.7.2.2", 6),
  ];

  return {
    grade: 6,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 138,
    capacityAdjustmentHours: 2,
    totalHours: 140,
    firstTermHours: 68,
    secondTermHours: 72,
    weeks: [
      ...allocateScienceWeeks(termWeeks.firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(termWeeks.secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildSciencePlanForClass(className: string, calendar: WorkCalendar): SciencePlan | null {
  if (isGrade5Class(className)) return buildGrade5SciencePlan(calendar);
  if (isGrade6Class(className)) return buildGrade6SciencePlan(calendar);
  return null;
}

export function distributeHoursToWeeks(durations: number[], weeklyHours = 4) {
  const weeks: number[][] = [];
  let current: number[] = [];
  let capacity = weeklyHours;
  for (const duration of durations) {
    let remaining = duration;
    while (remaining > 0) {
      const hours = Math.min(capacity, remaining);
      current.push(hours);
      capacity -= hours;
      remaining -= hours;
      if (capacity === 0) { weeks.push(current); current = []; capacity = weeklyHours; }
    }
  }
  if (current.length) weeks.push(current);
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
