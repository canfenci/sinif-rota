export type CurriculumFamily = "maarif" | "fen-2018";

export interface CurriculumSource {
  title: string;
  url?: string;
  documentName?: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface CurriculumDifferentiation {
  enrichment?: readonly string[] | null;
  support?: readonly string[] | null;
}

export interface CurriculumOutcomeMetadata {
  grade: 5 | 6 | 7 | 8;
  curriculumFamily: CurriculumFamily;
  unitCode?: string | null;
  unitName: string;
  outcomeCode: string;
  outcomeDescription: string;
  officialHours?: number | null;
  contentFramework?: readonly string[] | null;
  keyConcepts?: readonly string[] | null;
  processComponents?: readonly string[] | null;
  learningEvidence?: readonly string[] | null;
  learningTeachingExperiences?: readonly string[] | null;
  differentiation?: CurriculumDifferentiation | null;
  skills?: readonly string[] | null;
  values?: readonly string[] | null;
  literacySkills?: readonly string[] | null;
  source: CurriculumSource;
}
