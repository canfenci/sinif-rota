import { createCurriculumRegistry, type CurriculumRegistry } from "./registry";
import { grade5CurriculumMetadata } from "./grade5";
import { grade6CurriculumMetadata } from "./grade6";

export * from "./types";
export * from "./registry";
export * from "./grade5";
export * from "./grade6";

/**
 * Production curriculum registry initialized with verified official datasets.
 * Currently contains Grade 5 and Grade 6 Maarif curriculum metadata.
 */
export const officialCurriculumRegistry: CurriculumRegistry = createCurriculumRegistry([
  ...grade5CurriculumMetadata,
  ...grade6CurriculumMetadata,
]);
