import { createCurriculumRegistry, type CurriculumRegistry } from "./registry";
import { grade5CurriculumMetadata } from "./grade5";

export * from "./types";
export * from "./registry";
export * from "./grade5";

/**
 * Production curriculum registry initialized with verified official datasets.
 * Currently contains Grade 5 Maarif curriculum metadata.
 */
export const officialCurriculumRegistry: CurriculumRegistry = createCurriculumRegistry([
  ...grade5CurriculumMetadata,
]);
