import { createCurriculumRegistry, type CurriculumRegistry } from "./registry";
import { grade5CurriculumMetadata } from "./grade5";
import { grade6CurriculumMetadata } from "./grade6";
import { grade7CurriculumMetadata } from "./grade7";
import { grade8CurriculumMetadata } from "./grade8";

export * from "./types";
export * from "./registry";
export * from "./grade5";
export * from "./grade6";
export * from "./grade7";
export * from "./grade8";

/**
 * Production curriculum registry initialized with verified official datasets.
 * Contains Grade 5, Grade 6, Grade 7 (Türkiye Yüzyılı Maarif Modeli) and Grade 8 (2018 Fen Bilimleri Öğretim Programı) metadata.
 */
export const officialCurriculumRegistry: CurriculumRegistry = createCurriculumRegistry([
  ...grade5CurriculumMetadata,
  ...grade6CurriculumMetadata,
  ...grade7CurriculumMetadata,
  ...grade8CurriculumMetadata,
]);
