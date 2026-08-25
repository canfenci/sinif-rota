import type { WorkCalendar } from "./types";
import type {
  PlanWeek,
  SciencePlanItem,
  CurriculumOutcome,
  AnnualPlanAllocation,
  SciencePlanWeek,
  SciencePlan,
  Grade5SciencePlanItem,
  Grade5SciencePlanWeek,
  Grade5SciencePlan,
  Grade6SciencePlan,
  Grade7SciencePlan,
  Grade8SciencePlan,
} from "./planning/types";

import {
  createDefaultWorkCalendar,
  isValidWorkCalendar,
  buildPlanWeeks,
} from "./planning/calendar";
import { distributeHoursToWeeks } from "./planning/allocation";
import { updateAnnualPlanEntry } from "./planning/entry";
import {
  grade5ScienceUnitHours,
  grade5ScienceCurriculum,
  buildGrade5SciencePlan,
} from "./planning/grade5";
import {
  grade6ScienceUnitHours,
  grade6ScienceCurriculum,
  buildGrade6SciencePlan,
} from "./planning/grade6";
import {
  grade7ScienceUnitHours,
  grade7ScienceCurriculum,
  buildGrade7SciencePlan,
} from "./planning/grade7";
import {
  grade8ScienceUnitHours,
  grade8ScienceCurriculum,
  buildGrade8SciencePlan,
} from "./planning/grade8";

export {
  createDefaultWorkCalendar,
  isValidWorkCalendar,
  buildPlanWeeks,
  distributeHoursToWeeks,
  updateAnnualPlanEntry,
  grade5ScienceUnitHours,
  grade5ScienceCurriculum,
  buildGrade5SciencePlan,
  grade6ScienceUnitHours,
  grade6ScienceCurriculum,
  buildGrade6SciencePlan,
  grade7ScienceUnitHours,
  grade7ScienceCurriculum,
  buildGrade7SciencePlan,
  grade8ScienceUnitHours,
  grade8ScienceCurriculum,
  buildGrade8SciencePlan,
};

export type {
  PlanWeek,
  SciencePlanItem,
  CurriculumOutcome,
  AnnualPlanAllocation,
  SciencePlanWeek,
  SciencePlan,
  Grade5SciencePlanItem,
  Grade5SciencePlanWeek,
  Grade5SciencePlan,
  Grade6SciencePlan,
  Grade7SciencePlan,
  Grade8SciencePlan,
};

export function isGrade5Class(name: string) {
  return /^5(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade6Class(name: string) {
  return /^6(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade7Class(name: string) {
  return /^7(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade8Class(name: string) {
  return /^8(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function buildSciencePlanForClass(className: string, calendar: WorkCalendar): SciencePlan | null {
  if (isGrade5Class(className)) return buildGrade5SciencePlan(calendar);
  if (isGrade6Class(className)) return buildGrade6SciencePlan(calendar);
  if (isGrade7Class(className)) return buildGrade7SciencePlan(calendar);
  if (isGrade8Class(className)) return buildGrade8SciencePlan(calendar);
  return null;
}
