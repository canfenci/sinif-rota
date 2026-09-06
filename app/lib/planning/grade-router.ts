import type { WorkCalendar } from "../types";
import type { SciencePlan } from "./types";
import { buildGrade5SciencePlan } from "./grade5";
import { buildGrade6SciencePlan } from "./grade6";
import { buildGrade7SciencePlan } from "./grade7";
import { buildGrade8SciencePlan } from "./grade8";

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

export type ClassGrade = 5 | 6 | 7 | 8;

export function detectClassGrade(name: string): ClassGrade | null {
  if (isGrade5Class(name)) return 5;
  if (isGrade6Class(name)) return 6;
  if (isGrade7Class(name)) return 7;
  if (isGrade8Class(name)) return 8;
  return null;
}

export function buildSciencePlanForClass(className: string, calendar: WorkCalendar): SciencePlan | null {
  switch (detectClassGrade(className)) {
    case 5: return buildGrade5SciencePlan(calendar);
    case 6: return buildGrade6SciencePlan(calendar);
    case 7: return buildGrade7SciencePlan(calendar);
    case 8: return buildGrade8SciencePlan(calendar);
    default: return null;
  }
}
