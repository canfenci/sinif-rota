import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade6SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";

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

export function getGrade6ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 6);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

export function buildGrade6SciencePlan(calendar: WorkCalendar): Grade6SciencePlan | null {
  if (!isSupportedSciencePlanCalendar(calendar)) return null;
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
