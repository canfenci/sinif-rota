import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade7SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";
import { createPlanningCurriculumOutcome } from "./curriculum-resolver";

export const grade7ScienceUnitHours = [
  { unit: 1, title: "Uzay Çağı", curriculumHours: 14, planHours: 14 },
  { unit: 2, title: "Kuvvet ve Enerjiyi Keşfedelim", curriculumHours: 20, planHours: 20 },
  { unit: 3, title: "Vücudumuzdaki Sistemler", curriculumHours: 32, planHours: 32 },
  { unit: 4, title: "Işığın Kırılması ve Mercekler", curriculumHours: 14, planHours: 14 },
  { unit: 5, title: "Maddenin Doğasına Yolculuk", curriculumHours: 34, planHours: 36 },
  { unit: 6, title: "Elektriklenme", curriculumHours: 12, planHours: 12 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Enerji", curriculumHours: 12, planHours: 12 },
] as const;

const grade7UnitTitles = new Map<number, string>(grade7ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade7Outcome(unit: number, code: string): CurriculumOutcome {
  return createPlanningCurriculumOutcome(7, unit, code, undefined, grade7UnitTitles.get(unit));
}

export const grade7ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.7.1.1.1", "FB.7.1.1.2", "FB.7.1.1.3", "FB.7.1.2.1", "FB.7.1.2.2"].map((code) => grade7Outcome(1, code)),
  ...["FB.7.2.1.1", "FB.7.2.1.2", "FB.7.2.2.1"].map((code) => grade7Outcome(2, code)),
  ...["FB.7.3.1.1", "FB.7.3.1.2", "FB.7.3.2.1", "FB.7.3.2.2", "FB.7.3.2.3", "FB.7.3.3.1", "FB.7.3.3.2", "FB.7.3.4.1", "FB.7.3.4.2"].map((code) => grade7Outcome(3, code)),
  ...["FB.7.4.1.1", "FB.7.4.2.1", "FB.7.4.2.2"].map((code) => grade7Outcome(4, code)),
  ...["FB.7.5.1.1", "FB.7.5.1.2", "FB.7.5.1.3", "FB.7.5.1.4", "FB.7.5.2.1", "FB.7.5.2.2", "FB.7.5.2.3", "FB.7.5.2.4", "FB.7.5.3.1", "FB.7.5.3.2", "FB.7.5.4.1"].map((code) => grade7Outcome(5, code)),
  ...["FB.7.6.1.1", "FB.7.6.1.2", "FB.7.6.1.3"].map((code) => grade7Outcome(6, code)),
  ...["FB.7.7.1.1", "FB.7.7.2.1"].map((code) => grade7Outcome(7, code)),
];

const grade7CurriculumByCode = new Map(grade7ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade7Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "badge" | "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade7CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

export function getGrade7ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 7);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

export function buildGrade7SciencePlan(calendar: WorkCalendar): Grade7SciencePlan | null {
  if (!isSupportedSciencePlanCalendar(calendar)) return null;
  const termWeeks = getGrade7ScienceTermWeeks(calendar);
  if (!termWeeks) return null;

  const firstTermBlocks: ScienceBlock[] = [
    grade7Block(1, "FB.7.1.1.1", 2), grade7Block(1, "FB.7.1.1.2", 4), grade7Block(1, "FB.7.1.1.3", 2), grade7Block(1, "FB.7.1.2.1", 4), grade7Block(1, "FB.7.1.2.2", 2),
    grade7Block(2, "FB.7.2.1.1", 6), grade7Block(2, "FB.7.2.1.2", 6), grade7Block(2, "FB.7.2.2.1", 8),
    grade7Block(3, "FB.7.3.1.1", 6), grade7Block(3, "FB.7.3.1.2", 2), grade7Block(3, "FB.7.3.2.1", 6), grade7Block(3, "FB.7.3.2.2", 2), grade7Block(3, "FB.7.3.2.3", 2), grade7Block(3, "FB.7.3.3.1", 6), grade7Block(3, "FB.7.3.3.2", 2), grade7Block(3, "FB.7.3.4.1", 4), grade7Block(3, "FB.7.3.4.2", 2),
    grade7Block(4, "FB.7.4.1.1", 2, { plannedTotalHours: 6 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade7Block(4, "FB.7.4.1.1", 4, { initialCompletedHours: 2, plannedTotalHours: 6 }), grade7Block(4, "FB.7.4.2.1", 4), grade7Block(4, "FB.7.4.2.2", 4),
    grade7Block(5, "FB.7.5.1.1", 4), grade7Block(5, "FB.7.5.1.2", 2), grade7Block(5, "FB.7.5.1.3", 2), grade7Block(5, "FB.7.5.1.4", 6, { badge: "+2 öğretmen planlama" }), grade7Block(5, "FB.7.5.2.1", 4), grade7Block(5, "FB.7.5.2.2", 2), grade7Block(5, "FB.7.5.2.3", 2), grade7Block(5, "FB.7.5.2.4", 2), grade7Block(5, "FB.7.5.3.1", 2), grade7Block(5, "FB.7.5.3.2", 6), grade7Block(5, "FB.7.5.4.1", 4),
    grade7Block(6, "FB.7.6.1.1", 2), grade7Block(6, "FB.7.6.1.2", 6), grade7Block(6, "FB.7.6.1.3", 4),
    grade7Block(7, "FB.7.7.1.1", 6), grade7Block(7, "FB.7.7.2.1", 6),
  ];

  return {
    grade: 7,
    schoolYear: SCIENCE_PLAN_SCHOOL_YEAR,
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
