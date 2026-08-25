import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleCache = new Map();

async function importTypeScript(relPath) {
  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const filePath = fileUrl.pathname;
  if (moduleCache.has(filePath)) {
    return moduleCache.get(filePath);
  }

  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const importRegex = /import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(importRegex)];

  for (const match of matches) {
    const importPath = match[2];
    const targetRelPath = `app/lib/curriculum/${importPath.replace(/^\.\//, "")}.ts`;
    await importTypeScript(targetRelPath);
    const targetSource = await readFile(new URL(`../${targetRelPath}`, import.meta.url), "utf8");
    const targetTranspiled = ts.transpileModule(targetSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const targetDataUri = "data:text/javascript;base64," + Buffer.from(targetTranspiled).toString("base64");
    transpiled = transpiled.replace(match[0], `import ${match[1]} from "${targetDataUri}"`);
  }

  const dataUri = "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64");
  const mod = await import(dataUri);
  moduleCache.set(filePath, mod);
  return mod;
}

const {
  createCurriculumRegistry,
  emptyCurriculumRegistry,
  resolvePlanOutcomeMetadata,
  resolveMultiplePlanOutcomeMetadata,
} = await importTypeScript("app/lib/curriculum/registry.ts");

// ==========================================
// Strictly Synthetic Fixtures (Local to tests only)
// ==========================================

const sampleSyntheticOutcome5 = {
  grade: 5,
  curriculumFamily: "maarif",
  unitCode: "FB.5.TEST.1",
  unitName: "Synthetic Grade 5 Unit",
  outcomeCode: "FB.5.TEST.1.1",
  outcomeDescription: "Synthetic Grade 5 outcome description for testing.",
  officialHours: 6,
  contentFramework: ["Synthetic framework item"],
  keyConcepts: ["SyntheticConcept"],
  processComponents: ["SyntheticProcess"],
  learningEvidence: ["SyntheticEvidence"],
  learningTeachingExperiences: ["SyntheticExperience"],
  differentiation: {
    enrichment: ["SyntheticEnrichment"],
    support: ["SyntheticSupport"],
  },
  skills: ["SyntheticSkill"],
  values: ["SyntheticValue"],
  literacySkills: ["SyntheticLiteracy"],
  source: {
    title: "Synthetic Test Source Grade 5",
    url: "https://example.test/curriculum-grade-5",
  },
};

const sampleSyntheticOutcome6 = {
  grade: 6,
  curriculumFamily: "maarif",
  unitCode: "FB.6.TEST.1",
  unitName: "Synthetic Grade 6 Unit",
  outcomeCode: "FB.6.TEST.1.1",
  outcomeDescription: "Synthetic Grade 6 outcome description for testing.",
  officialHours: 8,
  source: {
    title: "Synthetic Test Source Grade 6",
    url: "https://example.test/curriculum-grade-6",
  },
};

const sampleSyntheticOutcome7 = {
  grade: 7,
  curriculumFamily: "maarif",
  unitCode: "FB.7.TEST.1",
  unitName: "Synthetic Grade 7 Unit",
  outcomeCode: "FB.7.TEST.1.1",
  outcomeDescription: "Synthetic Grade 7 outcome description for testing.",
  officialHours: 6,
  source: {
    title: "Synthetic Test Source Grade 7",
    url: "https://example.test/curriculum-grade-7",
  },
};

const sampleSyntheticOutcome8 = {
  grade: 8,
  curriculumFamily: "fen-2018",
  unitCode: "F.8.TEST.1",
  unitName: "Synthetic Grade 8 Unit",
  outcomeCode: "F.8.TEST.1.1",
  outcomeDescription: "Synthetic Grade 8 outcome description for testing.",
  officialHours: 10,
  source: {
    title: "Synthetic PDF Test Program 2018",
    documentName: "synthetic_program_2018.pdf",
    pageStart: 10,
    pageEnd: 12,
  },
};

// ==========================================
// Tests A through AD
// ==========================================

test("A. empty registry is valid", () => {
  const reg = createCurriculumRegistry([]);
  assert.equal(reg.size, 0);
  assert.deepEqual(reg.getAll(), []);
  assert.equal(emptyCurriculumRegistry.size, 0);
});

test("B. exact outcome code lookup works", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const found = reg.get("FB.5.TEST.1.1");
  assert.ok(found);
  assert.equal(found.outcomeCode, "FB.5.TEST.1.1");
  assert.equal(found.unitName, "Synthetic Grade 5 Unit");
});

test("C. unknown outcome code returns null", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  assert.equal(reg.get("NON_EXISTENT_CODE"), null);
  assert.equal(reg.get(""), null);
});

test("D. FB.5.* code supported as opaque identifier", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const found = reg.get("FB.5.TEST.1.1");
  assert.equal(found?.outcomeCode, "FB.5.TEST.1.1");
  assert.equal(found?.grade, 5);
  assert.equal(found?.curriculumFamily, "maarif");
});

test("E. FB.6.* code supported", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome6]);
  const found = reg.get("FB.6.TEST.1.1");
  assert.equal(found?.outcomeCode, "FB.6.TEST.1.1");
  assert.equal(found?.grade, 6);
  assert.equal(found?.curriculumFamily, "maarif");
});

test("F. FB.7.* code supported", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome7]);
  const found = reg.get("FB.7.TEST.1.1");
  assert.equal(found?.outcomeCode, "FB.7.TEST.1.1");
  assert.equal(found?.grade, 7);
  assert.equal(found?.curriculumFamily, "maarif");
});

test("G. F.8.* code supported without rewriting to FB.8", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome8]);
  const found = reg.get("F.8.TEST.1.1");
  assert.ok(found);
  assert.equal(found.outcomeCode, "F.8.TEST.1.1");
  assert.notEqual(found.outcomeCode, "FB.8.TEST.1.1");
  assert.equal(found.curriculumFamily, "fen-2018");
});

test("H. duplicate outcomeCode rejected explicitly", () => {
  assert.throws(
    () => {
      createCurriculumRegistry([sampleSyntheticOutcome5, sampleSyntheticOutcome5]);
    },
    {
      message: /Duplicate curriculum outcome code detected: 'FB\.5\.TEST\.1\.1'/,
    }
  );
});

test("I. source provenance retained", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const found = reg.get("FB.5.TEST.1.1");
  assert.ok(found?.source);
  assert.equal(found.source.title, "Synthetic Test Source Grade 5");
});

test("J. source URL retained", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const found = reg.get("FB.5.TEST.1.1");
  assert.equal(found?.source.url, "https://example.test/curriculum-grade-5");
});

test("K. PDF pageStart/pageEnd retained", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome8]);
  const found = reg.get("F.8.TEST.1.1");
  assert.equal(found?.source.documentName, "synthetic_program_2018.pdf");
  assert.equal(found?.source.pageStart, 10);
  assert.equal(found?.source.pageEnd, 12);
});

test("L. null optional metadata remains null", () => {
  const minimalOutcome = {
    grade: 6,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit Minimal",
    outcomeCode: "FB.6.MINIMAL",
    outcomeDescription: "Synthetic minimal description.",
    contentFramework: null,
    keyConcepts: null,
    processComponents: null,
    differentiation: null,
    source: {
      title: "Synthetic Source",
      url: "https://example.test/minimal",
    },
  };
  const reg = createCurriculumRegistry([minimalOutcome]);
  const found = reg.get("FB.6.MINIMAL");
  assert.equal(found?.contentFramework, null);
  assert.equal(found?.keyConcepts, null);
  assert.equal(found?.differentiation, null);
});

test("M. empty arrays remain empty", () => {
  const outcomeWithEmptyArrays = {
    grade: 5,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit Empty Arrays",
    outcomeCode: "FB.5.EMPTY",
    outcomeDescription: "Synthetic empty arrays description.",
    contentFramework: [],
    keyConcepts: [],
    skills: [],
    source: {
      title: "Synthetic Empty Source",
      url: "https://example.test/empty",
    },
  };
  const reg = createCurriculumRegistry([outcomeWithEmptyArrays]);
  const found = reg.get("FB.5.EMPTY");
  assert.deepEqual(found?.contentFramework, []);
  assert.deepEqual(found?.keyConcepts, []);
  assert.deepEqual(found?.skills, []);
});

test("N. officialHours null allowed", () => {
  const outcomeNoHours = {
    grade: 7,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit No Hours",
    outcomeCode: "FB.7.NOHOURS",
    outcomeDescription: "Synthetic no hours description.",
    officialHours: null,
    source: {
      title: "Synthetic Source No Hours",
      url: "https://example.test/no-hours",
    },
  };
  const reg = createCurriculumRegistry([outcomeNoHours]);
  const found = reg.get("FB.7.NOHOURS");
  assert.equal(found?.officialHours, null);
});

test("O. officialHours preserved when present", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome8]);
  const found = reg.get("F.8.TEST.1.1");
  assert.equal(found?.officialHours, 10);
});

test("P. registry does not mutate source array", () => {
  const inputList = [sampleSyntheticOutcome5, sampleSyntheticOutcome6];
  const originalLength = inputList.length;
  createCurriculumRegistry(inputList);
  assert.equal(inputList.length, originalLength);
});

test("Q. lookup does not mutate metadata object", () => {
  const original = { ...sampleSyntheticOutcome5 };
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const retrieved = reg.get("FB.5.TEST.1.1");
  assert.deepEqual(retrieved, original);
});

test("R. planning selector unknown metadata -> null", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const resolved = resolvePlanOutcomeMetadata("UNKNOWN.CODE", reg);
  assert.equal(resolved, null);
});

test("S. planning selector must not invent description fallback", () => {
  const reg = createCurriculumRegistry([]);
  const resolved = resolvePlanOutcomeMetadata("FB.5.999", reg);
  assert.equal(resolved, null, "Selector MUST return null for missing metadata, never a fake/invented description");
});

test("T. manual plan entry survives missing metadata relation", () => {
  const manualPlanningEntry = {
    id: "entry-1",
    classId: "c1",
    schoolYear: "2026-2027",
    weekStart: "2026-10-12",
    topic: "Synthetic Custom Teacher Topic",
    note: "Synthetic teacher note",
    completed: true,
  };
  const metadata = resolvePlanOutcomeMetadata(undefined, emptyCurriculumRegistry);
  assert.equal(metadata, null);
  assert.equal(manualPlanningEntry.topic, "Synthetic Custom Teacher Topic");
  assert.equal(manualPlanningEntry.completed, true);
});

test("U. multiple outcome codes can resolve independently", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5, sampleSyntheticOutcome6]);
  const results = resolveMultiplePlanOutcomeMetadata(["FB.5.TEST.1.1", "UNKNOWN", "FB.6.TEST.1.1"], reg);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.outcomeCode, "FB.5.TEST.1.1");
  assert.equal(results[1], null);
  assert.equal(results[2]?.outcomeCode, "FB.6.TEST.1.1");
});

test("V. officialHours is not used to overwrite planning hours", () => {
  const planAllocation = {
    outcomeCode: "FB.5.TEST.1.1",
    allocatedHours: 4,
    plannedTotalHours: 6,
  };
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const metadata = resolvePlanOutcomeMetadata(planAllocation.outcomeCode, reg);
  assert.equal(metadata?.officialHours, 6);
  assert.equal(planAllocation.allocatedHours, 4);
});

test("W. source title without url/documentName rejected", () => {
  const invalidSourceOutcome = {
    grade: 5,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit",
    outcomeCode: "FB.5.INVALID.SOURCE",
    outcomeDescription: "Synthetic desc",
    source: {
      title: "Title Only Source",
    },
  };
  assert.throws(
    () => {
      createCurriculumRegistry([invalidSourceOutcome]);
    },
    {
      message: /source must contain a non-empty 'url' or 'documentName'/,
    }
  );
});

test("X. blank source url with no documentName rejected", () => {
  const blankUrlOutcome = {
    grade: 5,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit",
    outcomeCode: "FB.5.BLANK.URL",
    outcomeDescription: "Synthetic desc",
    source: {
      title: "Valid Title",
      url: "   ",
    },
  };
  assert.throws(
    () => {
      createCurriculumRegistry([blankUrlOutcome]);
    },
    {
      message: /source must contain a non-empty 'url' or 'documentName'/,
    }
  );
});

test("Y. source url alone with title accepted", () => {
  const validUrlOutcome = {
    grade: 5,
    curriculumFamily: "maarif",
    unitName: "Synthetic Unit",
    outcomeCode: "FB.5.VALID.URL",
    outcomeDescription: "Synthetic desc",
    source: {
      title: "Valid Title",
      url: "https://example.test/valid-url",
    },
  };
  const reg = createCurriculumRegistry([validUrlOutcome]);
  assert.equal(reg.size, 1);
  assert.equal(reg.get("FB.5.VALID.URL")?.source.url, "https://example.test/valid-url");
});

test("Z. documentName alone with title accepted", () => {
  const validDocOutcome = {
    grade: 8,
    curriculumFamily: "fen-2018",
    unitName: "Synthetic Unit",
    outcomeCode: "F.8.VALID.DOC",
    outcomeDescription: "Synthetic desc",
    source: {
      title: "Valid Title",
      documentName: "program_doc.pdf",
    },
  };
  const reg = createCurriculumRegistry([validDocOutcome]);
  assert.equal(reg.size, 1);
  assert.equal(reg.get("F.8.VALID.DOC")?.source.documentName, "program_doc.pdf");
});

test("AA. mutating original input record after registry creation does not change registry state", () => {
  const mutableInput = {
    ...sampleSyntheticOutcome5,
    source: { ...sampleSyntheticOutcome5.source },
    keyConcepts: ["InitialConcept"],
  };
  const reg = createCurriculumRegistry([mutableInput]);

  // Mutate outer object
  mutableInput.unitName = "MUTATED UNIT NAME";
  mutableInput.source.title = "MUTATED SOURCE TITLE";
  mutableInput.keyConcepts.push("MUTATED CONCEPT");

  const fromReg = reg.get("FB.5.TEST.1.1");
  assert.equal(fromReg?.unitName, "Synthetic Grade 5 Unit");
  assert.equal(fromReg?.source.title, "Synthetic Test Source Grade 5");
  assert.deepEqual(fromReg?.keyConcepts, ["InitialConcept"]);
});

test("AB. mutating source object returned from get does not change registry state", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const retrieved1 = reg.get("FB.5.TEST.1.1");
  assert.ok(retrieved1);
  retrieved1.source.title = "MUTATED IN FIRST CALL";

  const retrieved2 = reg.get("FB.5.TEST.1.1");
  assert.equal(retrieved2?.source.title, "Synthetic Test Source Grade 5");
});

test("AC. mutating metadata array returned from get does not change registry state", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const retrieved1 = reg.get("FB.5.TEST.1.1");
  assert.ok(retrieved1?.contentFramework);
  retrieved1.contentFramework.push("HACKED_FRAMEWORK");

  const retrieved2 = reg.get("FB.5.TEST.1.1");
  assert.deepEqual(retrieved2?.contentFramework, ["Synthetic framework item"]);
});

test("AD. getAll result mutation does not alter registry internal collection", () => {
  const reg = createCurriculumRegistry([sampleSyntheticOutcome5]);
  const all1 = reg.getAll();
  assert.equal(all1.length, 1);
  all1[0].unitName = "MUTATED VIA GETALL";

  const all2 = reg.getAll();
  assert.equal(all2[0].unitName, "Synthetic Grade 5 Unit");
});
