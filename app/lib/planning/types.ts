import { SUPPORTED_ACADEMIC_YEARS } from "../academic-year";

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
  outcomeCodes?: string[];
  badge?: string;
  curriculum: CurriculumOutcome | null;
  curricula?: CurriculumOutcome[];
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
  sectionTitle?: string | null;
  topicHours?: number | null;
  outcomeNotes?: string[];
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
  outcomeCodes?: string[];
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
  grade: 5 | 6 | 7 | 8;
  schoolYear: (typeof SUPPORTED_ACADEMIC_YEARS)[number];
  weeklyHours: 4;
  curriculumHours: number;
  capacityAdjustmentHours: number;
  totalHours: number;
  firstTermHours: number;
  secondTermHours: number;
  weeks: SciencePlanWeek[];
}

export type Grade5SciencePlanItem = SciencePlanItem;
export type Grade5SciencePlanWeek = SciencePlanWeek;
export type Grade5SciencePlan = SciencePlan & { grade: 5; curriculumHours: 140; capacityAdjustmentHours: 0; totalHours: 140; secondTermHours: 72 };
export type Grade6SciencePlan = SciencePlan & { grade: 6; curriculumHours: 138; capacityAdjustmentHours: 2; totalHours: 140; secondTermHours: 72 };
export type Grade7SciencePlan = SciencePlan & { grade: 7; curriculumHours: 138; capacityAdjustmentHours: 2; totalHours: 140; secondTermHours: 72 };
export type Grade8SciencePlan = SciencePlan & { grade: 8; curriculumHours: 132; capacityAdjustmentHours: 8; totalHours: 140; firstTermHours: 72; secondTermHours: 68 };

export type ScienceBlock = {
  grade?: number;
  unit: number;
  unitTitle: string;
  title: string;
  hours: number;
  outcomeCode?: string;
  outcomeCodes?: string[];
  badge?: string;
  curriculum?: CurriculumOutcome | null;
  curricula?: CurriculumOutcome[];
  plannedTotalHours?: number;
  initialCompletedHours?: number;
};
