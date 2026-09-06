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
} from "./types";

export {
  createDefaultWorkCalendar,
  isValidWorkCalendar,
  buildPlanWeeks,
} from "./calendar";

export { distributeHoursToWeeks } from "./allocation";
export { updateAnnualPlanEntry } from "./entry";
export { createPlanningCurriculumOutcome } from "./curriculum-resolver";

export {
  grade5ScienceUnitHours,
  grade5ScienceCurriculum,
  buildGrade5SciencePlan,
} from "./grade5";

export {
  grade6ScienceUnitHours,
  grade6ScienceCurriculum,
  buildGrade6SciencePlan,
} from "./grade6";

export {
  grade7ScienceUnitHours,
  grade7ScienceCurriculum,
  buildGrade7SciencePlan,
} from "./grade7";

export {
  grade8ScienceUnitHours,
  grade8ScienceCurriculum,
  buildGrade8SciencePlan,
} from "./grade8";

export {
  isGrade5Class,
  isGrade6Class,
  isGrade7Class,
  isGrade8Class,
  detectClassGrade,
  shouldConfirmGradeChange,
  buildSciencePlanForClass,
} from "./grade-router";
