import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade5SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";
import { createPlanningCurriculumOutcome } from "./curriculum-resolver";

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
  return createPlanningCurriculumOutcome(5, unit, code, undefined, grade5UnitTitles.get(unit));
}

export const grade5ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.5.1.1.1", "FB.5.1.2.1", "FB.5.1.2.2", "FB.5.1.3.1"].map((code) => grade5Outcome(1, code)),
  ...["FB.5.2.1.1", "FB.5.2.1.2", "FB.5.2.2.1", "FB.5.2.3.1", "FB.5.2.3.2"].map((code) => grade5Outcome(2, code)),
  ...["FB.5.3.1.1", "FB.5.3.1.2", "FB.5.3.2.1", "FB.5.3.2.2"].map((code) => grade5Outcome(3, code)),
  ...["FB.5.4.1.1", "FB.5.4.2.1", "FB.5.4.3.1"].map((code) => grade5Outcome(4, code)),
  ...["FB.5.5.1.1", "FB.5.5.2.1", "FB.5.5.2.2", "FB.5.5.3.1", "FB.5.5.4.1", "FB.5.5.4.2"].map((code) => grade5Outcome(5, code)),
  ...["FB.5.6.1.1", "FB.5.6.1.2", "FB.5.6.2.1"].map((code) => grade5Outcome(6, code)),
  ...["FB.5.7.1.1", "FB.5.7.1.2", "FB.5.7.1.3"].map((code) => grade5Outcome(7, code)),
];

const grade5CurriculumByCode = new Map(grade5ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade5Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade5CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

export function buildGrade5SciencePlan(calendar: WorkCalendar): Grade5SciencePlan | null {
  if (!isSupportedSciencePlanCalendar(calendar)) return null;
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
    grade5Block(6, "FB.5.6.1.1", 2), grade5Block(6, "FB.5.6.1.2", 4), grade5Block(6, "FB.5.6.2.1", 4, { plannedTotalHours: 10 }), grade5Block(6, "FB.5.6.2.1", 6, { initialCompletedHours: 4, plannedTotalHours: 10 }),
    grade5Block(7, "FB.5.7.1.1", 4), grade5Block(7, "FB.5.7.1.2", 4), grade5Block(7, "FB.5.7.1.3", 4),
  ];

  return {
    grade: 5,
    schoolYear: SCIENCE_PLAN_SCHOOL_YEAR,
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
