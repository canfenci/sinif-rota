import { SUPPORTED_ACADEMIC_YEARS } from "../academic-year";
import type { PlanWeek, ScienceBlock, SciencePlanItem, SciencePlanWeek } from "./types";

const SCIENCE_PLAN_SCHOOL_YEAR = SUPPORTED_ACADEMIC_YEARS[0];

export function allocateScienceWeeks(weeks: PlanWeek[], term: 1 | 2, blocks: ScienceBlock[]): SciencePlanWeek[] {
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
        outcomeCodes: block.outcomeCodes,
        badge: block.badge,
        hours,
        curriculum: block.curriculum ?? null,
        curricula: block.curricula,
        allocation: {
          schoolYear: SCIENCE_PLAN_SCHOOL_YEAR,
          grade: block.grade ?? block.curriculum?.grade ?? (block.outcomeCode?.startsWith("FB.7") ? 7 : block.outcomeCode?.startsWith("FB.6") ? 6 : 5),
          classId: null,
          weekId: week.startDate,
          weekStart: week.startDate,
          weekEnd: week.endDate,
          outcomeCode: block.outcomeCode ?? null,
          outcomeCodes: block.outcomeCodes,
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

export function distributeHoursToWeeks(durations: number[], weeklyHours = 4): number[][] {
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
