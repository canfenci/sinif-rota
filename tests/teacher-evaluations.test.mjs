import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const reactUrl = import.meta.resolve("react");
const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;

  transpiled = transpiled.replace(/from\s+["']react["']/g, `from "${reactUrl}"`);
  transpiled = `import React from "${reactUrl}";\n` + transpiled;

  const relRegex = /(import|export)\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  const matches = [...transpiled.matchAll(relRegex)];

  for (const match of matches) {
    const kind = match[1];
    const specifiers = match[2];
    const importPath = match[3];
    const dir = relPath.substring(0, relPath.lastIndexOf("/"));
    let targetParts = (dir ? dir + "/" + importPath : importPath).split("/");
    let cleanParts = [];
    for (const p of targetParts) {
      if (p === ".") continue;
      if (p === "..") cleanParts.pop();
      else cleanParts.push(p);
    }
    let targetRel = cleanParts.join("/");
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".tsx") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.tsx`, import.meta.url));
        targetRel = `${targetRel}.tsx`;
      } catch {
        try {
          await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
          targetRel = `${targetRel}.ts`;
        } catch {
          targetRel = `${targetRel}/index.ts`;
        }
      }
    }
    const targetDataUri = await getTranspiledDataUri(targetRel);
    transpiled = transpiled.replace(match[0], `${kind} ${specifiers} from "${targetDataUri}"`);
  }

  const uri = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  codeCache.set(relPath, uri);
  return uri;
}

async function importTypeScript(relPath) {
  const uri = await getTranspiledDataUri(relPath);
  return import(uri);
}

const evalMod = await importTypeScript("app/lib/teacher-evaluations.ts");
const migrationsMod = await importTypeScript("app/lib/migrations.ts");
const dataMod = await importTypeScript("app/lib/data.ts");
const reportsMod = await importTypeScript("app/lib/reports.ts");
const recommendationsMod = await importTypeScript("app/lib/report-recommendations.ts");
await importTypeScript("app/components/ReportsView.tsx");

const evalSource = await readFile(new URL("../app/lib/teacher-evaluations.ts", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

const T1 = "2026-09-14T09:00:00.000Z";
const T2 = "2026-09-21T09:00:00.000Z";
const T3 = "2026-09-22T10:00:00.000Z";

const STUDENT_IDENTITY = {
  scope: "student",
  classId: "c1",
  studentId: "s1",
  fromWeekStart: "2026-09-15",
  toWeekStart: "2026-09-19",
};

const CLASS_IDENTITY = {
  scope: "class_general",
  classId: "c1",
  fromWeekStart: "2026-09-15",
  toWeekStart: "2026-09-19",
};

function validStudentEval(overrides = {}) {
  return {
    id: "eval:student:c1:s1:2026-09-15:2026-09-19",
    scope: "student",
    classId: "c1",
    studentId: "s1",
    fromWeekStart: "2026-09-15",
    toWeekStart: "2026-09-19",
    text: "Düzenli çalışıyor.",
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function validClassEval(overrides = {}) {
  return {
    id: "eval:class_general:c1:2026-09-15:2026-09-19",
    scope: "class_general",
    classId: "c1",
    fromWeekStart: "2026-09-15",
    toWeekStart: "2026-09-19",
    text: "Sınıf geneli iyi gidiyor.",
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function baseData(overrides = {}) {
  return {
    schemaVersion: 1,
    classes: [
      {
        id: "c1",
        name: "5-A",
        students: [{ id: "s1", name: "Ali", number: 1 }],
      },
    ],
    sessions: [],
    ...overrides,
  };
}

test("1. valid student evaluation passes validation", () => {
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval()), true);
});

test("2. studentId required for student scope", () => {
  const { studentId: _removed, ...withoutStudent } = validStudentEval();
  void _removed;
  assert.equal(evalMod.isValidTeacherEvaluation(withoutStudent), false);
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ studentId: "" })), false);
});

test("3. studentId forbidden for class_general scope", () => {
  assert.equal(evalMod.isValidTeacherEvaluation({ ...validClassEval(), studentId: "s1" }), false);
  assert.equal(evalMod.isValidTeacherEvaluation(validClassEval()), true);
});

test("4. deterministic student id format", () => {
  assert.equal(
    evalMod.buildTeacherEvaluationId(STUDENT_IDENTITY),
    "eval:student:c1:s1:2026-09-15:2026-09-19"
  );
});

test("5. deterministic class_general id format", () => {
  assert.equal(
    evalMod.buildTeacherEvaluationId(CLASS_IDENTITY),
    "eval:class_general:c1:2026-09-15:2026-09-19"
  );
});

test("6. valid resolved range accepted", () => {
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval()), true);
  assert.equal(
    evalMod.isValidTeacherEvaluation(
      validStudentEval({
        id: "eval:student:c1:s1:2026-09-15:2026-09-15",
        fromWeekStart: "2026-09-15",
        toWeekStart: "2026-09-15",
      })
    ),
    true
  );
});

test("7. invalid date rejected", () => {
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ fromWeekStart: "2026-13-40" })), false);
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ toWeekStart: "15.09.2026" })), false);
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ fromWeekStart: "2026-02-30" })), false);
});

test("8. reversed range rejected", () => {
  assert.equal(
    evalMod.isValidTeacherEvaluation(
      validStudentEval({ fromWeekStart: "2026-09-19", toWeekStart: "2026-09-15" })
    ),
    false
  );
});

test("9. text max 2000 enforced", () => {
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ text: "a".repeat(2000) })), true);
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ text: "a".repeat(2001) })), false);
});

test("10. whitespace-only text rejected", () => {
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ text: "   " })), false);
  assert.equal(evalMod.isValidTeacherEvaluation(validStudentEval({ text: "" })), false);
});

test("11. upsert creates a new record with deterministic id", () => {
  const result = evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  assert.equal(result.teacherEvaluations.length, 1);
  const created = result.teacherEvaluations[0];
  assert.equal(created.id, "eval:student:c1:s1:2026-09-15:2026-09-19");
  assert.equal(created.text, "Not");
  assert.equal(created.createdAt, T1);
  assert.equal(created.updatedAt, T1);
});

test("12. upsert updates existing text", () => {
  const seeded = evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Eski" }, () => T1);
  const result = evalMod.upsertTeacherEvaluation(seeded, { ...STUDENT_IDENTITY, text: "Yeni" }, () => T2);
  assert.equal(result.teacherEvaluations.length, 1);
  assert.equal(result.teacherEvaluations[0].text, "Yeni");
});

test("13. upsert preserves createdAt", () => {
  const seeded = evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Eski" }, () => T1);
  const result = evalMod.upsertTeacherEvaluation(seeded, { ...STUDENT_IDENTITY, text: "Yeni" }, () => T2);
  assert.equal(result.teacherEvaluations[0].createdAt, T1);
});

test("14. upsert refreshes updatedAt", () => {
  const seeded = evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Eski" }, () => T1);
  const result = evalMod.upsertTeacherEvaluation(seeded, { ...STUDENT_IDENTITY, text: "Yeni" }, () => T2);
  assert.equal(result.teacherEvaluations[0].updatedAt, T2);
});

test("15. duplicate prevention: same identity never creates a second record", () => {
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Bir" }, () => T1);
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "İki" }, () => T2);
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Üç" }, () => T3);
  assert.equal(data.teacherEvaluations.length, 1);
  assert.equal(data.teacherEvaluations[0].text, "Üç");
});

test("16. delete removes the record by deterministic identity", () => {
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  data = evalMod.upsertTeacherEvaluation(data, { ...CLASS_IDENTITY, text: "Genel" }, () => T1);
  const result = evalMod.deleteTeacherEvaluation(data, STUDENT_IDENTITY);
  assert.equal(result.teacherEvaluations.length, 1);
  assert.equal(result.teacherEvaluations[0].id, "eval:class_general:c1:2026-09-15:2026-09-19");
});

test("17. empty-save deletes the existing record", () => {
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  const result = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "   " }, () => T2);
  assert.equal((result.teacherEvaluations ?? []).length, 0);
});

test("18. same preset with different resolved ranges are independent records", () => {
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Hafta 1" }, () => T1);
  const otherRange = { ...STUDENT_IDENTITY, fromWeekStart: "2026-09-22", toWeekStart: "2026-09-26" };
  data = evalMod.upsertTeacherEvaluation(data, { ...otherRange, text: "Hafta 2" }, () => T2);
  assert.equal(data.teacherEvaluations.length, 2);
  assert.equal(evalMod.getTeacherEvaluation(data.teacherEvaluations, STUDENT_IDENTITY).text, "Hafta 1");
  assert.equal(evalMod.getTeacherEvaluation(data.teacherEvaluations, otherRange).text, "Hafta 2");
});

test("19. archive preservation: evaluations survive archived class and inactive student", () => {
  const archived = baseData({
    classes: [
      {
        id: "c1",
        name: "5-A",
        archived: true,
        students: [{ id: "s1", name: "Ali", number: 1, active: false }],
      },
    ],
  });
  const result = evalMod.upsertTeacherEvaluation(archived, { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  assert.equal(evalMod.getTeacherEvaluation(result.teacherEvaluations, STUDENT_IDENTITY).text, "Not");
});

test("20. move preserves historical evaluation under the old classId", () => {
  const data = baseData({
    classes: [
      { id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali", number: 1 }] },
      { id: "c2", name: "5-B", students: [] },
    ],
    teacherEvaluations: [validStudentEval()],
  });
  const before = JSON.stringify(data.teacherEvaluations);
  const result = dataMod.applyBulkStudentAction(data, "c1", ["s1"], "move", "c2", () => "x1");
  assert.equal(JSON.stringify(result.data.teacherEvaluations), before);
  assert.equal(result.data.teacherEvaluations[0].classId, "c1");
});

test("21. copy does not duplicate evaluations to the new student", () => {
  const data = baseData({
    classes: [
      { id: "c1", name: "5-A", students: [{ id: "s1", name: "Ali", number: 1 }] },
      { id: "c2", name: "5-B", students: [] },
    ],
    teacherEvaluations: [validStudentEval()],
  });
  const result = dataMod.applyBulkStudentAction(data, "c1", ["s1"], "copy", "c2", () => "x1");
  assert.equal(result.data.teacherEvaluations.length, 1);
  assert.equal(result.data.teacherEvaluations[0].studentId, "s1");
});

test("22. hard-delete cleanup matches the audited historical cascade policy", () => {
  const data = baseData({
    teacherEvaluations: [validStudentEval(), validClassEval()],
  });
  const afterStudentDelete = dataMod.removeStudent(data, "c1", "s1");
  assert.equal(afterStudentDelete.teacherEvaluations.length, 1);
  assert.equal(afterStudentDelete.teacherEvaluations[0].scope, "class_general");
  const afterClassDelete = dataMod.removeClass(data, "c1");
  assert.equal((afterClassDelete.teacherEvaluations ?? []).length, 0);
});

test("23. old v1 data without teacherEvaluations stays valid", () => {
  const result = migrationsMod.migrateData(baseData());
  assert.equal(result.status, "success");
  assert.ok(!("teacherEvaluations" in result.data) || result.data.teacherEvaluations === undefined);
});

test("24. teacherEvaluations field is optional", () => {
  const without = baseData();
  delete without.teacherEvaluations;
  assert.equal(migrationsMod.migrateData(without).status, "success");
});

test("25. schema version remains 1", () => {
  assert.equal(migrationsMod.CURRENT_SCHEMA_VERSION, 1);
  const result = migrationsMod.migrateData(baseData({ teacherEvaluations: [validStudentEval()] }));
  assert.equal(result.status, "success");
  assert.equal(result.data.schemaVersion, 1);
});

test("26. migration deep clones teacherEvaluations", () => {
  const raw = baseData({ teacherEvaluations: [validStudentEval()] });
  const result = migrationsMod.migrateData(raw);
  assert.equal(result.status, "success");
  result.data.teacherEvaluations[0].text = "MUTATED";
  assert.equal(raw.teacherEvaluations[0].text, "Düzenli çalışıyor.");
});

test("27. unknown-field preservation contract holds for evaluations", () => {
  const raw = baseData({ teacherEvaluations: [validStudentEval({ customFlag: true })] });
  const result = migrationsMod.migrateData(raw);
  assert.equal(result.status, "success");
  assert.equal(result.data.teacherEvaluations[0].customFlag, true);
});

test("28. backup/export round-trip preserves teacherEvaluations", () => {
  const data = baseData({ teacherEvaluations: [validStudentEval(), validClassEval()] });
  const serialized = JSON.stringify(data);
  const restored = migrationsMod.migrateData(JSON.parse(serialized));
  assert.equal(restored.status, "success");
  assert.equal(restored.data.teacherEvaluations.length, 2);
});

test("29. no separate localStorage key is introduced", () => {
  const keys = ["STORAGE_KEY", "LEGACY_STORAGE_KEY", "BACKUP_KEY_PREFIX", "QUARANTINE_KEY_PREFIX"];
  for (const key of keys) {
    assert.ok(storageSource.includes(key), `storage keeps ${key}`);
  }
  assert.ok(!/TEACHER_EVAL.*KEY|teacher-evaluations-storage|teacherEvaluationsKey/.test(storageSource));
});

test("30. AppData save path is unchanged", () => {
  assert.ok(storageSource.includes("export function saveSafe("));
  assert.ok(!/localStorage|setItem|getItem/.test(evalSource), "domain module must not touch storage");
});

test("31. Student report UI integration", () => {
  assert.ok(reportsViewSource.includes("Öğretmen Değerlendirmesi"));
  assert.ok(reportsViewSource.includes("<textarea"));
  assert.ok(reportsViewSource.includes("maxLength={TEACHER_EVALUATION_TEXT_MAX_LENGTH}"));
  assert.ok(reportsViewSource.includes("Kaydet"));
  assert.ok(reportsViewSource.includes("Notu Sil"));
  assert.ok(cssSource.includes(".teacher-eval-section"));
});

test("32. Class General UI integration", () => {
  assert.ok(reportsViewSource.includes('scope: "class_general"'));
  assert.ok(reportsViewSource.includes("öğrenci değerlendirmeleri burada görünmez"));
});

test("33. student note cannot appear in class general context", () => {
  const evals = [validStudentEval(), validClassEval()];
  const resolved = evalMod.getTeacherEvaluation(evals, CLASS_IDENTITY);
  assert.equal(resolved.scope, "class_general");
  assert.ok(!("studentId" in resolved) || resolved.studentId === undefined);
  const classGeneralBlock = reportsViewSource.slice(
    reportsViewSource.indexOf("Sınıf Genel Öğretmen Değerlendirmesi")
  );
  assert.ok(!classGeneralBlock.includes('scope: "student"'));
});

test("34. comparison DTO is unaffected by teacher evaluations", () => {
  const schoolClass = {
    id: "c1",
    name: "5-A",
    students: [{ id: "s1", name: "Ali", number: 1 }],
  };
  const dto = reportsMod.calculateClassComparisonReport(schoolClass, [], { range: {} });
  assert.ok(!("teacherEvaluation" in dto));
  assert.ok(!("teacherEvaluations" in dto));
  assert.ok(!JSON.stringify(dto).includes("Düzenli çalışıyor"));
});

test("35. recommendations engine is unaffected by teacher evaluations", () => {
  assert.ok(!/teacherEval/i.test(reportsSource));
  const schoolClass = {
    id: "c1",
    name: "5-A",
    students: [{ id: "s1", name: "Ali", number: 1 }],
  };
  const core = reportsMod.calculateStudentReportCore(schoolClass.students[0], schoolClass, [], { range: {} });
  const recReport = recommendationsMod.generateStudentRecommendations(core);
  assert.ok(!JSON.stringify(recReport).includes("teacherEval"));
});

test("36. charts are unaffected by teacher evaluations", () => {
  assert.ok(!/teacherEval/i.test(reportsSource));
});

test("37. save is explicit: typing only updates local draft", () => {
  assert.ok(reportsViewSource.includes("onChange={(e) => setDraft(e.target.value)}"));
  assert.ok(reportsViewSource.includes("onClick={handleSave}"));
});

test("38. no autosave behavior exists for teacher evaluations", () => {
  const editorBlock = reportsViewSource.slice(
    reportsViewSource.indexOf("function TeacherEvaluationEditor"),
    reportsViewSource.indexOf("export type ReportTab")
  );
  assert.ok(!/setTimeout|setInterval|debounce/.test(editorBlock));
  const saveCalls = editorBlock.match(/onSave\(identity, draft\)/g) ?? [];
  assert.equal(saveCalls.length, 1);
});

test("39. 2000 character counter is rendered", () => {
  assert.ok(reportsViewSource.includes("TEACHER_EVALUATION_TEXT_MAX_LENGTH} karakter"));
  assert.ok(reportsViewSource.includes("{draft.length}/"));
});

test("40. no AI integration in teacher evaluation flow", () => {
  assert.ok(!/openai|anthropic|\bai\b|fetch\(|XMLHttpRequest/.test(evalSource));
  const editorBlock = reportsViewSource.slice(reportsViewSource.indexOf("function TeacherEvaluationEditor"));
  assert.ok(!/openai|anthropic|fetch\(/.test(editorBlock));
});

test("41. no new scoring is introduced by teacher evaluations", () => {
  const schoolClass = {
    id: "c1",
    name: "5-A",
    students: [{ id: "s1", name: "Ali", number: 1 }],
  };
  const core = reportsMod.calculateStudentReportCore(schoolClass.students[0], schoolClass, [], { range: {} });
  assert.ok(!("teacherEvaluation" in core));
  assert.ok(!("teacherEvaluations" in core));
  const before = JSON.stringify(core);
  evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  const after = JSON.stringify(
    reportsMod.calculateStudentReportCore(schoolClass.students[0], schoolClass, [], { range: {} })
  );
  assert.equal(before, after);
});

test("43. domain validator and migration validator agree on a corpus", () => {
  const corpus = [
    validStudentEval(),
    validClassEval(),
    validStudentEval({ text: "   " }),
    validStudentEval({ text: "a".repeat(2001) }),
    validStudentEval({ fromWeekStart: "2026-13-01" }),
    validStudentEval({ fromWeekStart: "2026-09-19", toWeekStart: "2026-09-15" }),
    validStudentEval({ id: "wrong-id" }),
    { ...validClassEval(), studentId: "s1" },
    validStudentEval({ createdAt: "not-a-date" }),
    validStudentEval({ text: "a".repeat(2000) }),
  ];
  for (const entry of corpus) {
    const domainVerdict = evalMod.isValidTeacherEvaluation(entry);
    const migrationVerdict =
      migrationsMod.migrateData(baseData({ teacherEvaluations: [entry] })).status === "success";
    assert.equal(
      migrationVerdict,
      domainVerdict,
      `validator agreement for ${JSON.stringify(entry).slice(0, 80)}`
    );
  }
});

test("44. dirty student draft triggers confirm on student change", () => {
  assert.ok(reportsViewSource.includes("onChange={(e) => handleStudentChange(e.target.value)}"));
  assert.ok(reportsViewSource.includes("const handleStudentChange = (studentId: string) => {"));
  const handlerBlock = reportsViewSource.slice(reportsViewSource.indexOf("const handleStudentChange = (studentId: string) => {"));
  assert.ok(handlerBlock.startsWith("const handleStudentChange = (studentId: string) => {\n    requestEvaluationContextChange("));
});

test("45. guard cancel preserves current student and draft", () => {
  const guardBlock = reportsViewSource.slice(reportsViewSource.indexOf("const requestEvaluationContextChange = (apply: () => void)"));
  assert.ok(guardBlock.includes("if (evalDirtyRef.current)"));
  assert.ok(guardBlock.includes("!window.confirm(TEACHER_EVAL_UNSAVED_MESSAGE)"));
  const cancelIndex = guardBlock.indexOf("return;");
  const applyIndex = guardBlock.indexOf("apply();");
  assert.ok(cancelIndex !== -1 && applyIndex !== -1 && cancelIndex < applyIndex);
});

test("46. guard confirm opens the target student", () => {
  const guardBlock = reportsViewSource.slice(reportsViewSource.indexOf("const requestEvaluationContextChange = (apply: () => void)"));
  assert.ok(guardBlock.includes("apply();"));
});

test("47. dirty range change triggers confirm", () => {
  assert.ok(reportsViewSource.includes("onClick={() => handleRangePresetChange(preset)}"));
  assert.ok(reportsViewSource.includes("const handleRangePresetChange = (preset: ReportRangePreset) => {"));
  const handlerBlock = reportsViewSource.slice(reportsViewSource.indexOf("const handleRangePresetChange = (preset: ReportRangePreset) => {"));
  assert.ok(handlerBlock.includes("requestEvaluationContextChange("));
});

test("48. range guard cancel preserves current range, confirm opens target range", () => {
  const handlerBlock = reportsViewSource.slice(reportsViewSource.indexOf("const handleRangePresetChange = (preset: ReportRangePreset) => {"));
  assert.ok(handlerBlock.includes("requestEvaluationContextChange(() => setSelectedRangePreset(preset))"));
});

test("49. dirty class change triggers confirm", () => {
  const handlerBlock = reportsViewSource.slice(reportsViewSource.indexOf("const handleClassChange = (newClassId: string) => {"));
  assert.ok(handlerBlock.includes("requestEvaluationContextChange("));
});

test("50. saved or clean draft triggers no confirmation", () => {
  assert.ok(reportsViewSource.includes("const dirty = draft !== persistedText;"));
  const saved = evalMod.upsertTeacherEvaluation(baseData(), { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  const persistedText = evalMod.getTeacherEvaluation(saved.teacherEvaluations, STUDENT_IDENTITY).text;
  assert.equal("Not" !== persistedText, false);
});

test("51. save results in dirty false", () => {
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Taslak" }, () => T1);
  const persistedText = evalMod.getTeacherEvaluation(data.teacherEvaluations, STUDENT_IDENTITY).text;
  assert.equal(persistedText, "Taslak");
  assert.equal("Taslak" !== persistedText, false);
});

test("52. delete results in dirty false", () => {
  const editorBlock = reportsViewSource.slice(
    reportsViewSource.indexOf("function TeacherEvaluationEditor"),
    reportsViewSource.indexOf("export type ReportTab")
  );
  assert.ok(editorBlock.includes('setDraft("");'));
  let data = baseData();
  data = evalMod.upsertTeacherEvaluation(data, { ...STUDENT_IDENTITY, text: "Not" }, () => T1);
  data = evalMod.deleteTeacherEvaluation(data, STUDENT_IDENTITY);
  assert.equal(evalMod.getTeacherEvaluation(data.teacherEvaluations, STUDENT_IDENTITY), null);
});

test("53. draft is never carried to another evaluation identity", () => {
  const matches = reportsViewSource.match(/key=\{buildTeacherEvaluationId\(/g) ?? [];
  assert.ok(matches.length >= 2);
});

test("54. guard paths perform no autosave", () => {
  const guardBlock = reportsViewSource.slice(
    reportsViewSource.indexOf("const requestEvaluationContextChange = (apply: () => void)"),
    reportsViewSource.indexOf("const requestEvaluationContextChange = (apply: () => void)") + 800
  );
  assert.ok(!/Upsert|onSave|setData/.test(guardBlock));
});

test("55. AppData is untouched while typing", () => {
  const editorBlock = reportsViewSource.slice(
    reportsViewSource.indexOf("function TeacherEvaluationEditor"),
    reportsViewSource.indexOf("export type ReportTab")
  );
  assert.ok(!/setData/.test(editorBlock));
  assert.ok(editorBlock.includes("onChange={(e) => setDraft(e.target.value)}"));
});

test("56. bottom-nav away navigation is guarded while reports draft is dirty", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(pageSource.includes("reportsEvalDirtyRef"));
  assert.ok(pageSource.includes("onEvaluationDirtyChange"));
  assert.ok(pageSource.includes('view === "reports" && next !== "reports" && reportsEvalDirtyRef.current'));
  assert.ok(pageSource.includes("!window.confirm(TEACHER_EVAL_UNSAVED_MESSAGE)"));
  assert.ok(pageSource.includes('onClick={() => navigate("home")}'));
  assert.ok(pageSource.includes('onClick={() => navigate("classes")}'));
  assert.ok(pageSource.includes('onClick={() => navigate("plan")}'));
  assert.ok(pageSource.includes('onClick={() => navigate("reports")}'));
});

test("57. unsaved-changes message matches the required neutral copy", () => {
  assert.ok(
    reportsViewSource.includes(
      "Kaydedilmemiş öğretmen değerlendirmeniz var. Değişiklikleri kaydetmeden devam etmek istiyor musunuz?"
    )
  );
});

test("42. report engines still compute on data carrying teacherEvaluations", () => {
  const schoolClass = {
    id: "c1",
    name: "5-A",
    students: [{ id: "s1", name: "Ali", number: 1 }],
  };
  const dto = reportsMod.calculateClassGeneralReport(schoolClass, [], { range: {} });
  assert.equal(dto.classId, "c1");
  assert.ok(!("teacherEvaluation" in dto));
});
