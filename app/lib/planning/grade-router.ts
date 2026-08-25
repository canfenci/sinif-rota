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

export function buildSciencePlanForClass(className: string, calendar: WorkCalendar): SciencePlan | null {
  if (isGrade5Class(className)) return buildGrade5SciencePlan(calendar);
  if (isGrade6Class(className)) return buildGrade6SciencePlan(calendar);
  if (isGrade7Class(className)) return buildGrade7SciencePlan(calendar);
  if (isGrade8Class(className)) return buildGrade8SciencePlan(calendar);
  return null;
}
