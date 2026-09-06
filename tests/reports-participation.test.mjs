import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const codeCache = new Map();

async function getTranspiledDataUri(relPath) {
  if (codeCache.has(relPath)) {
    return codeCache.get(relPath);
  }

  const fileUrl = new URL(`../${relPath}`, import.meta.url);
  const source = await readFile(fileUrl, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

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
    if (!targetRel.endsWith(".ts") && !targetRel.endsWith(".js")) {
      try {
        await readFile(new URL(`../${targetRel}.ts`, import.meta.url));
        targetRel = `${targetRel}.ts`;
      } catch {
        targetRel = `${targetRel}/index.ts`;
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

const reports = await importTypeScript("app/lib/reports.ts");

function createStudent(id = "s-1", number = 101, name = "Ali Can", active = true) {
  return { id, number, name, active };
}

function createClass(id = "c-1", name = "8-A", students = [createStudent()]) {
  return { id, name, students };
}

function createSession(opts) {
  return {
    id: opts.id ?? `sess-${Math.random().toString(36).slice(2, 8)}`,
    classId: opts.classId ?? "c-1",
    className: opts.className ?? "8-A",
    type: opts.type ?? "Ödev",
    date: opts.date ?? "2026-10-05T09:00:00.000Z",
    statuses: opts.statuses ?? {},
    weekStart: opts.weekStart ?? "2026-10-05",
    visitIndex: opts.visitIndex ?? 1,
  };
}

// 1. threshold constants centralized
test("1. Threshold sabitleri merkezi olarak tanımlanmıştır ve beklenen başlangıç değerlerindedir", () => {
  assert.equal(reports.PARTICIPATION_THRESHOLDS.MIN_EVALUATED_TYPES_FOR_SCORE, 3);
  assert.equal(reports.PARTICIPATION_THRESHOLDS.MIN_VALID_CHECKS_PER_INCLUDED_TYPE, 2);
  assert.equal(reports.PARTICIPATION_THRESHOLDS.MIN_TOTAL_VALID_CHECKS_FOR_SCORE, 8);
  assert.equal(reports.MIN_EVALUATED_TYPES_FOR_SCORE, 3);
  assert.equal(reports.MIN_VALID_CHECKS_PER_INCLUDED_TYPE, 2);
  assert.equal(reports.MIN_TOTAL_VALID_CHECKS_FOR_SCORE, 8);
});

// 2. evaluatedTypeCount
test("2. evaluatedTypeCount: yalnız valid check sayısı > 0 olan kontrol türlerini sayar", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Defter", statuses: { "s-1": "partial" } }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.evaluatedTypeCount, 2);
});

// 3. totalValidCheckCount
test("3. totalValidCheckCount: tüm kontrol türlerindeki evaluatedCount toplamını verir", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "missing" } }),
    createSession({ type: "Defter", statuses: { "s-1": "complete" } }),
    createSession({ type: "Kitap", statuses: { "s-1": "absent" } }), // absent evaluated sayılmaz
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 3);
});

// 4. perTypeValidCheckCount
test("4. perTypeValidCheckCount: her kontrol türü için bağımsız geçerli gözlem sayısını verir", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "partial" } }),
    createSession({ type: "Defter", statuses: { "s-1": "complete" } }),
    createSession({ type: "Kitap", statuses: { "s-1": "absent" } }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.deepEqual(report.dataSufficiency.perTypeValidCheckCount, {
    "Ödev": 2,
    "Defter": 1,
    "Kitap": 0,
    "Materyal": 0,
  });
});

// 5. missingTypes
test("5. missingTypes: hiç geçerli gözlemi olmayan türleri listeler", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Defter", statuses: { "s-1": "partial" } }),
    createSession({ type: "Kitap", statuses: { "s-1": "absent" } }), // absent valid sayılmaz -> Kitap missing kalır
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.deepEqual(report.dataSufficiency.missingTypes, ["Kitap", "Materyal"]);
});

// 6. insufficient status
test("6. coverageStatus: 0 valid check durumunda insufficient döner", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const emptyReport = reports.calculateStudentReportCore(student, schoolClass, []);
  assert.equal(emptyReport.dataSufficiency.coverageStatus, "insufficient");
  assert.equal(emptyReport.dataSufficiency.sufficientData, false);
  assert.equal(emptyReport.suggestedParticipationScore, null);

  const absentOnlyReport = reports.calculateStudentReportCore(student, schoolClass, [
    createSession({ type: "Ödev", statuses: { "s-1": "absent" } }),
  ]);
  assert.equal(absentOnlyReport.dataSufficiency.coverageStatus, "insufficient");
  assert.equal(absentOnlyReport.dataSufficiency.sufficientData, false);
  assert.equal(absentOnlyReport.suggestedParticipationScore, null);
});

// 7. partial_preview status
test("7. coverageStatus: 1-7 valid check veya tür çeşitliliği yetersizken partial_preview döner", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // 6 Ödev var ama diğer türler yok -> partial_preview
  const sessions = Array.from({ length: 6 }, () =>
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } })
  );

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.coverageStatus, "partial_preview");
  assert.equal(report.dataSufficiency.sufficientData, false);
  assert.equal(report.suggestedParticipationScore, null);
  assert.equal(report.participationRawAverage, 100);
});

// 8. sufficient status
test("8. coverageStatus: tüm eşikler sağlandığında sufficient döner (3 tür, her biri >=2, toplam >=8)", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // Ödev: 3, Defter: 3, Kitap: 2, Materyal: 0 -> Toplam 8 valid checks
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(report.dataSufficiency.coverageStatus, "sufficient");
  assert.equal(report.suggestedParticipationScore, 100);
});

// 9. suggested score null when insufficient / partial_preview
test("9. suggestedParticipationScore: sufficientData false olduğunda daima null olmalı", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // 3 tür var fakat toplam 6 check (< 8)
  const sessions = [
    ...Array.from({ length: 2 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 6);
  assert.equal(report.dataSufficiency.sufficientData, false);
  assert.equal(report.suggestedParticipationScore, null);
  assert.equal(report.participationRawAverage, 100);
});

// 10. suggested score number when sufficient
test("10. suggestedParticipationScore: sufficientData true olduğunda 0..100 arasında bir sayı üretir", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "missing" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(typeof report.suggestedParticipationScore, "number");
  // Ödev=100, Defter=100, Kitap=0 -> (100 + 100 + 0) / 3 = 66.666... -> round = 67
  assert.equal(report.suggestedParticipationScore, 67);
});

// 11. correct rounding (Math.round)
test("11. Yuvarlama: rawAverage 82.5 olduğunda suggestedParticipationScore 83 olmalı", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // 3 tür oluşturalım öyle ki ortalama tam 82.5 gelsin:
  // Ödev score: 90
  // Defter score: 75
  // Kitap score: (Ödev 90 + Defter 75) = 165. 82.5 * 2 = 165.
  // Üçüncü tür Materyal olmasın, ya da 4 türde ortalama 82.5 olsun.
  // 4 tür: 100 + 100 + 80 + 50 = 330 / 4 = 82.5
  const sessions = [
    // Ödev: 2 complete -> 100
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    // Defter: 2 complete -> 100
    createSession({ type: "Defter", statuses: { "s-1": "complete" } }),
    createSession({ type: "Defter", statuses: { "s-1": "complete" } }),
    // Kitap: 4 complete, 1 missing -> 400/5 = 80
    ...Array.from({ length: 4 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
    createSession({ type: "Kitap", statuses: { "s-1": "missing" } }),
    // Materyal: 2 partial -> 50
    createSession({ type: "Materyal", statuses: { "s-1": "partial" } }),
    createSession({ type: "Materyal", statuses: { "s-1": "partial" } }),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.sufficientData, true);
  // (100 + 100 + 80 + 50) / 4 = 330 / 4 = 82.5
  assert.equal(report.participationRawAverage, 82.5);
  assert.equal(report.suggestedParticipationScore, 83);
});

// 12. absent excluded
test("12. absent kayıtları validCheckCount'a ve skor paydasına katılmaz", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    // Ödev: 2 complete, 3 absent -> evaluatedCount=2
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "absent" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "absent" } }),
    createSession({ type: "Ödev", statuses: { "s-1": "absent" } }),
    // Defter: 3 complete
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    // Kitap: 3 complete
    ...Array.from({ length: 3 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.perTypeValidCheckCount["Ödev"], 2);
  assert.equal(report.totalAbsentCount, 3);
  assert.equal(report.observedAbsenceCount, 3);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 8);
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(report.suggestedParticipationScore, 100);
});

// 13. missing type not zero
test("13. Eksik kontrol türü 0 sayılmaz ve ortalamayı aşağı çekmez", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // Ödev=100 (3), Defter=100 (3), Kitap=100 (2), Materyal=null (0)
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.breakdowns["Materyal"].score, null);
  assert.equal(report.participationRawAverage, 100);
  assert.equal(report.suggestedParticipationScore, 100);
});

// 14. single-type data cannot produce final score
test("14. Tek bir kontrol türünde çok sayıda kayıt olsa bile nihai öneri notu üretilemez", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  // 20 Ödev kontrolü
  const sessions = Array.from({ length: 20 }, () =>
    createSession({ type: "Ödev", statuses: { "s-1": "complete" } })
  );

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 20);
  assert.equal(report.dataSufficiency.evaluatedTypeCount, 1);
  assert.equal(report.dataSufficiency.sufficientData, false);
  assert.equal(report.suggestedParticipationScore, null);
  assert.equal(report.dataSufficiency.coverageNote, "Öneri notu için daha fazla kontrol türünde veri gerekiyor.");
});

// 15. three-type sufficient case
test("15. 3 türün her birinde >=2 ve toplam >=8 olduğunda sufficient kabul edilir", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(report.dataSufficiency.coverageStatus, "sufficient");
  assert.equal(report.dataSufficiency.coverageNote, "Değerlendirme için yeterli veri mevcut.");
});

// 16. four-type sufficient case
test("16. 4 türün tamamı mevcut ve eşikleri sağlıyorsa sufficient kabul edilir", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    ...Array.from({ length: 2 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Materyal", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.evaluatedTypeCount, 4);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 8);
  assert.equal(report.dataSufficiency.sufficientData, true);
  assert.equal(report.suggestedParticipationScore, 100);
});

// 17. one type with only 1 check invalidates sufficiency
test("17. 3+ tür olsa dahi bir türde yalnız 1 observation varsa yeterlilik reddedilir (Ödev:2, Defter:2, Kitap:1, Materyal:4)", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    ...Array.from({ length: 2 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    createSession({ type: "Kitap", statuses: { "s-1": "complete" } }), // Yalnız 1 check!
    ...Array.from({ length: 4 }, () => createSession({ type: "Materyal", statuses: { "s-1": "complete" } })),
  ];

  const report = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(report.dataSufficiency.totalValidCheckCount, 9);
  assert.equal(report.dataSufficiency.evaluatedTypeCount, 4);
  assert.equal(report.dataSufficiency.sufficientData, false);
  assert.equal(report.suggestedParticipationScore, null);
  assert.equal(report.dataSufficiency.coverageNote, "Bazı kontrol türlerinde yeterli sayıda gözlem bulunmuyor.");
});

// 18. report range affects sufficiency
test("18. ReportRange filtrelemesi veri yeterliliğini dinamik olarak etkiler", () => {
  const student = createStudent("s-1");
  const schoolClass = createClass("c-1", "8-A", [student]);
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ weekStart: "2026-09-21", type: "Ödev", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ weekStart: "2026-09-28", type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ weekStart: "2026-10-05", type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  // Tüm dönem: 8 checks -> sufficient
  const fullReport = reports.calculateStudentReportCore(student, schoolClass, sessions);
  assert.equal(fullReport.dataSufficiency.sufficientData, true);

  // Yalnız 28 Eylül haftası filtrelendiğinde: 3 check -> partial_preview
  const filteredReport = reports.calculateStudentReportCore(student, schoolClass, sessions, {
    range: { fromWeekStart: "2026-09-28", toWeekStart: "2026-09-28" },
  });
  assert.equal(filteredReport.dataSufficiency.sufficientData, false);
  assert.equal(filteredReport.suggestedParticipationScore, null);
});

// 19. immutable input
test("19. Input immutability: calculate fonksiyonları hiçbir girdi nesnesini mutate etmez", () => {
  const student = Object.freeze(createStudent("s-1"));
  const schoolClass = Object.freeze(createClass("c-1", "8-A", [student]));
  const sessions = Object.freeze([
    Object.freeze(createSession({ type: "Ödev", statuses: Object.freeze({ "s-1": "complete" }) })),
  ]);

  assert.doesNotThrow(() => {
    reports.calculateStudentReportCore(student, schoolClass, sessions);
    reports.calculateClassReportCore(schoolClass, sessions);
  });
});

// 20. no official MEB claim
test("20. Resmi mevzuat/MEB iddiası bulunmamalı ve metinler nötr olmalıdır", async () => {
  const source = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
  assert.equal(source.includes("MEB'e uygun"), false);
  assert.equal(source.includes("resmi derse katılım"), false);
  assert.equal(source.includes("yönetmeliğe uygun"), false);
  assert.equal(source.includes("e-Okul"), false);

  assert.equal(reports.PARTICIPATION_COPY.TITLE, "Derse Katılım Öneri Notu");
  assert.equal(
    reports.PARTICIPATION_COPY.DESCRIPTION,
    "Derse katılım değerlendirmesi; kayıt altına alınan ödev yapma, defter, kitap ve materyal getirme sıklıklarına göre oluşturulmuştur."
  );
  assert.equal(
    reports.PARTICIPATION_COPY.DISCLAIMER,
    "Bu puan öğretmenin değerlendirmesine yardımcı olmak amacıyla oluşturulan öneri puandır."
  );
});

// 21. ClassReportCore studentsWithSufficientData / studentsWithInsufficientData
test("21. ClassReportCore: sınıf düzeyinde yeterli ve yetersiz veriye sahip öğrenci sayılarını doğru toplar", () => {
  const s1 = createStudent("s-1", 1, "Yeterli Verili Öğrenci");
  const s2 = createStudent("s-2", 2, "Yetersiz Verili Öğrenci");
  const schoolClass = createClass("c-1", "8-A", [s1, s2]);

  // s1 için 3 Ödev, 3 Defter, 2 Kitap
  // s2 için yalnız 1 Ödev
  const sessions = [
    ...Array.from({ length: 3 }, () => createSession({ type: "Ödev", statuses: { "s-1": "complete", "s-2": "complete" } })),
    ...Array.from({ length: 3 }, () => createSession({ type: "Defter", statuses: { "s-1": "complete" } })),
    ...Array.from({ length: 2 }, () => createSession({ type: "Kitap", statuses: { "s-1": "complete" } })),
  ];

  const classReport = reports.calculateClassReportCore(schoolClass, sessions);
  assert.equal(classReport.studentsWithSufficientData, 1);
  assert.equal(classReport.studentsWithInsufficientData, 1);
});
