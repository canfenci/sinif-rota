import { officialCurriculumRegistry, resolvePlanOutcomeMetadata } from "../curriculum";
import type { CurriculumOutcome } from "./types";

export interface PlanningCurriculumOptions {
  sectionTitle?: string | null;
  topicHours?: number | null;
}

/**
 * Resolves a CurriculumOutcome object for planning modules by reading authoritative
 * official metadata from officialCurriculumRegistry.
 *
 * If the outcome code exists in the registry, official description, process components,
 * source provenance, and related metadata are populated directly from the verified source.
 * If the outcome code is unknown, fails safely by returning null officialDescription without
 * synthesizing fallback description text.
 */
export function createPlanningCurriculumOutcome(
  grade: 5 | 6 | 7 | 8,
  unit: number,
  code: string,
  options?: PlanningCurriculumOptions,
  fallbackUnitTitle?: string
): CurriculumOutcome {
  const meta = resolvePlanOutcomeMetadata(code, officialCurriculumRegistry);

  if (meta) {
    const isMaarif = meta.curriculumFamily === "maarif";
    return {
      grade: meta.grade,
      curriculumVersion: isMaarif ? "Türkiye Yüzyılı Maarif Modeli" : "2018 Fen Bilimleri Dersi Öğretim Programı",
      unitId: meta.unitCode ?? (meta.grade === 8 ? `F.8.${unit}` : `FB.${meta.grade}.${unit}`),
      unitTitle: meta.unitName ?? fallbackUnitTitle ?? `${unit}. Ünite`,
      code: meta.outcomeCode,
      officialDescription: meta.outcomeDescription,
      officialSource: meta.source.url ?? null,
      sectionTitle: options?.sectionTitle ?? null,
      topicHours: options?.topicHours ?? null,
      outcomeNotes: [],
      processComponents: meta.processComponents ? [...meta.processComponents] : [],
      contentFramework: meta.contentFramework ? [...meta.contentFramework] : [],
      keyConcepts: meta.keyConcepts && meta.keyConcepts.length > 0
        ? [...meta.keyConcepts]
        : (options?.sectionTitle ? [options.sectionTitle] : []),
      learningEvidence: meta.learningEvidence ? [...meta.learningEvidence] : [],
      learningTeachingExperiences: meta.learningTeachingExperiences ? [...meta.learningTeachingExperiences] : [],
      differentiation: meta.differentiation
        ? [...(meta.differentiation.enrichment ?? []), ...(meta.differentiation.support ?? [])]
        : [],
      skills: meta.skills ? [...meta.skills] : [],
      values: meta.values ? [...meta.values] : [],
      literacySkills: meta.literacySkills ? [...meta.literacySkills] : [],
    };
  }

  // Safe fallback for unmapped/synthetic test codes without inventing text
  const isMaarif = grade !== 8;
  return {
    grade,
    curriculumVersion: isMaarif ? "Türkiye Yüzyılı Maarif Modeli" : "2018 Fen Bilimleri Dersi Öğretim Programı",
    unitId: grade === 8 ? `F.8.${unit}` : `FB.${grade}.${unit}`,
    unitTitle: fallbackUnitTitle ?? `${unit}. Ünite`,
    code,
    officialDescription: null,
    officialSource: null,
    sectionTitle: options?.sectionTitle ?? null,
    topicHours: options?.topicHours ?? null,
    outcomeNotes: [],
    processComponents: [],
    contentFramework: [],
    keyConcepts: options?.sectionTitle ? [options.sectionTitle] : [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}
