import type { CurriculumOutcomeMetadata } from "./types";

function cloneArray<T>(arr: readonly T[] | null | undefined): T[] | null | undefined {
  if (arr === null) return null;
  if (arr === undefined) return undefined;
  return [...arr];
}

function cloneCurriculumOutcomeMetadata(record: CurriculumOutcomeMetadata): CurriculumOutcomeMetadata {
  return {
    grade: record.grade,
    curriculumFamily: record.curriculumFamily,
    ...(record.unitCode !== undefined ? { unitCode: record.unitCode } : {}),
    unitName: record.unitName,
    outcomeCode: record.outcomeCode,
    outcomeDescription: record.outcomeDescription,
    ...(record.officialHours !== undefined ? { officialHours: record.officialHours } : {}),
    ...(record.contentFramework !== undefined ? { contentFramework: cloneArray(record.contentFramework) } : {}),
    ...(record.keyConcepts !== undefined ? { keyConcepts: cloneArray(record.keyConcepts) } : {}),
    ...(record.processComponents !== undefined ? { processComponents: cloneArray(record.processComponents) } : {}),
    ...(record.learningEvidence !== undefined ? { learningEvidence: cloneArray(record.learningEvidence) } : {}),
    ...(record.learningTeachingExperiences !== undefined
      ? { learningTeachingExperiences: cloneArray(record.learningTeachingExperiences) }
      : {}),
    ...(record.differentiation !== undefined
      ? {
          differentiation: record.differentiation
            ? {
                ...(record.differentiation.enrichment !== undefined
                  ? { enrichment: cloneArray(record.differentiation.enrichment) }
                  : {}),
                ...(record.differentiation.support !== undefined
                  ? { support: cloneArray(record.differentiation.support) }
                  : {}),
              }
            : null,
        }
      : {}),
    ...(record.skills !== undefined ? { skills: cloneArray(record.skills) } : {}),
    ...(record.values !== undefined ? { values: cloneArray(record.values) } : {}),
    ...(record.literacySkills !== undefined ? { literacySkills: cloneArray(record.literacySkills) } : {}),
    source: {
      title: record.source.title,
      ...(record.source.url !== undefined ? { url: record.source.url } : {}),
      ...(record.source.documentName !== undefined ? { documentName: record.source.documentName } : {}),
      ...(record.source.pageStart !== undefined ? { pageStart: record.source.pageStart } : {}),
      ...(record.source.pageEnd !== undefined ? { pageEnd: record.source.pageEnd } : {}),
    },
  };
}

export interface CurriculumRegistry {
  get(outcomeCode: string): CurriculumOutcomeMetadata | null;
  getAll(): readonly CurriculumOutcomeMetadata[];
  readonly size: number;
}

export function createCurriculumRegistry(
  records: readonly CurriculumOutcomeMetadata[] = []
): CurriculumRegistry {
  const map = new Map<string, CurriculumOutcomeMetadata>();

  for (const record of records) {
    if (!record || typeof record.outcomeCode !== "string" || record.outcomeCode.trim() === "") {
      throw new Error("Invalid curriculum record: outcomeCode must be a non-empty string");
    }
    if (!record.source || typeof record.source.title !== "string" || record.source.title.trim() === "") {
      throw new Error(
        `Invalid curriculum record for outcome '${record.outcomeCode}': source must contain a valid title`
      );
    }
    const hasValidUrl = typeof record.source.url === "string" && record.source.url.trim().length > 0;
    const hasValidDoc =
      typeof record.source.documentName === "string" && record.source.documentName.trim().length > 0;
    if (!hasValidUrl && !hasValidDoc) {
      throw new Error(
        `Invalid curriculum record for outcome '${record.outcomeCode}': source must contain a non-empty 'url' or 'documentName'`
      );
    }
    if (map.has(record.outcomeCode)) {
      throw new Error(
        `Duplicate curriculum outcome code detected: '${record.outcomeCode}'. Overwriting is strictly disallowed.`
      );
    }
    map.set(record.outcomeCode, cloneCurriculumOutcomeMetadata(record));
  }

  return {
    get(outcomeCode: string): CurriculumOutcomeMetadata | null {
      if (!outcomeCode || typeof outcomeCode !== "string") return null;
      const found = map.get(outcomeCode);
      return found ? cloneCurriculumOutcomeMetadata(found) : null;
    },
    getAll(): readonly CurriculumOutcomeMetadata[] {
      return Array.from(map.values()).map(cloneCurriculumOutcomeMetadata);
    },
    get size(): number {
      return map.size;
    },
  };
}

export const emptyCurriculumRegistry: CurriculumRegistry = createCurriculumRegistry([]);

export function resolvePlanOutcomeMetadata(
  outcomeCode: string | null | undefined,
  registry: CurriculumRegistry = emptyCurriculumRegistry
): CurriculumOutcomeMetadata | null {
  if (!outcomeCode || typeof outcomeCode !== "string") return null;
  return registry.get(outcomeCode);
}

export function resolveMultiplePlanOutcomeMetadata(
  outcomeCodes: readonly string[] | null | undefined,
  registry: CurriculumRegistry = emptyCurriculumRegistry
): (CurriculumOutcomeMetadata | null)[] {
  if (!outcomeCodes || !Array.isArray(outcomeCodes)) return [];
  return outcomeCodes.map((code) => resolvePlanOutcomeMetadata(code, registry));
}
