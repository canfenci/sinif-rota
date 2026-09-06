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

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const reportsViewSource = await readFile(new URL("../app/components/ReportsView.tsx", import.meta.url), "utf8");
const reportsSource = await readFile(new URL("../app/lib/reports.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// 1. bottom nav içinde Raporlar vardır
test("1. Bottom navigation menüsünde Raporlar sekmesi bulunur", () => {
  assert.match(pageSource, /<button[^>]*onClick=\{[^}]*navigate\("reports"\)[^}]*\}[^>]*>\s*Raporlar\s*<\/button>/);
});

// 2. ayrı İstatistikler ana sekmesi yoktur
test("2. Bottom navigation içinde ayrı İstatistikler ana sekmesi bulunmaz", () => {
  assert.doesNotMatch(pageSource, /<button[^>]*>\s*İstatistikler\s*<\/button>/);
  assert.doesNotMatch(pageSource, /navigate\("stats"\)/);
});

// 3. Reports shell açılır (ReportsView entegre edilmiştir)
test("3. view === 'reports' durumunda ReportsView component'i render edilir", () => {
  assert.match(pageSource, /view === "reports" && \(\s*<ReportsView/);
});

// 4. Genel tab vardır
test("4. ReportsView içinde 'Genel' alt sekmesi bulunur", () => {
  assert.match(reportsViewSource, /id="tab-general"/);
  assert.match(reportsViewSource, />\s*Genel\s*<\/button>/);
});

// 5. Sınıflar tab vardır
test("5. ReportsView içinde 'Sınıflar' alt sekmesi bulunur", () => {
  assert.match(reportsViewSource, /id="tab-classes"/);
  assert.match(reportsViewSource, />\s*Sınıflar\s*<\/button>/);
});

// 6. Öğrenciler tab vardır
test("6. ReportsView içinde 'Öğrenciler' alt sekmesi bulunur", () => {
  assert.match(reportsViewSource, /id="tab-students"/);
  assert.match(reportsViewSource, />\s*Öğrenciler\s*<\/button>/);
});

// 7. Kayıtlar tab vardır
test("7. ReportsView içinde 'Kayıtlar' alt sekmesi bulunur", () => {
  assert.match(reportsViewSource, /id="tab-sessions"/);
  assert.match(reportsViewSource, />\s*Kayıtlar\s*<\/button>/);
});

// 8. varsayılan tab Genel
test("8. ReportsView varsayılan sekmesi 'general' (Genel) dir", () => {
  assert.match(reportsViewSource, /useState<ReportTab>\("general"\)/);
});

// 9. range default current_week
test("9. ReportsView varsayılan aralık preset'i 'current_week' tir", () => {
  assert.match(reportsViewSource, /useState<ReportRangePreset>\("current_week"\)/);
});

// 10. class selection state çalışır
test("10. Sınıf seçimi state'i ve handleClassChange mevcuttur", () => {
  assert.match(reportsViewSource, /handleClassChange = \(newClassId: string\)/);
  assert.match(reportsViewSource, /setSelectedClassId\(newClassId\)/);
});

// 11. class change student selection resetler
test("11. Sınıf değiştiğinde öğrenci seçimi sıfırlanır (setSelectedStudentId(''))", () => {
  assert.match(reportsViewSource, /setSelectedClassId\(newClassId\);\s*setSelectedStudentId\(""\);/);
});

// 12. empty class state güvenli
test("12. Hiç sınıf yoksa nötr empty-state mesajı gösterilir", () => {
  assert.match(reportsViewSource, /Henüz rapor oluşturulabilecek bir sınıf bulunmuyor/);
});

// 13. student selection yalnız seçili class üzerinden
test("13. Öğrenci seçimi yalnız seçilen sınıfın öğrencileri üzerinden yapılır", () => {
  assert.match(reportsViewSource, /selectedClass\?\.students\.map/);
  assert.match(reportsViewSource, /selectedClass\.students\.find\(\(s\) => s\.id === selectedStudentId\)/);
});

// 14. legacy data shell'i kırmaz
test("14. Legacy session'larda visitIndex olmaması durumunda 'Eski kayıt' etiketi kullanılır", () => {
  assert.match(reportsViewSource, /typeof sess\.visitIndex === "number"\s*\?\s*`\$\{sess\.visitIndex\}\. Giriş`\s*:\s*"Eski kayıt"/);
});

// 15. StudentView'da türetilmiş istatistik/sayı görünmez
test("15. StudentView bileşeninde türetilmiş istatistikler, yüzdeler, yokluk sayıları ve çubuklar kaldırılmıştır", () => {
  // StudentView fonksiyon gövdesini al
  const studentViewBody = pageSource.slice(pageSource.indexOf("function StudentView"), pageSource.indexOf("function BulkActionSheet"));
  assert.doesNotMatch(studentViewBody, /%\{stat\.rate\}/);
  assert.doesNotMatch(studentViewBody, /stat-bar/);
  assert.doesNotMatch(studentViewBody, /TEMEL İSTATİSTİKLER/);
  assert.doesNotMatch(studentViewBody, /GÖZLEMLENEN YOKLUK/);
  assert.doesNotMatch(studentViewBody, /totalAbsent/);
  assert.doesNotMatch(studentViewBody, /studentHistorySessions/);
  assert.doesNotMatch(studentViewBody, /observedAbsenceCount/);
  assert.doesNotMatch(studentViewBody, /katılım/i);
  assert.doesNotMatch(studentViewBody, /performans/i);
  assert.doesNotMatch(studentViewBody, /ortalama/i);
  assert.match(studentViewBody, /Detaylı değerlendirmeler ve raporlar için Raporlar bölümünü kullanın\./);
});

// 16. QuickView'da yüzde/katılım görünmez
test("16. QuickView bileşeninde yüzde veya katılım notu yer almaz", () => {
  const quickViewBody = pageSource.slice(pageSource.indexOf("function QuickView"), pageSource.indexOf("function StudentView"));
  assert.doesNotMatch(quickViewBody, /katılım notu/i);
  assert.doesNotMatch(quickViewBody, /başarı oranı/i);
});

// 17. AnnualPlan nav davranışı değişmez
test("17. AnnualPlan sekmesi ve bottom-nav üzerindeki 'Yıllık Plan' butonu korunur", () => {
  assert.match(pageSource, /<button[^>]*onClick=\{[^}]*navigate\("plan"\)[^}]*\}[^>]*>\s*Yıllık Plan\s*<\/button>/);
});

// 18. bottom nav responsive kalır
test("18. Bottom nav bar için 4 butonlu yapı ve responsive css kuralları korunur", () => {
  assert.match(cssSource, /\.bottom-nav button\{flex:1/);
});

// 19. touch target contract korunur (min-height: 44px)
test("19. Raporlar sekme butonları en az 44px dokunma alanına sahiptir", () => {
  assert.match(cssSource, /\.reports-tab-btn\{min-height:44px/);
  assert.match(cssSource, /\.range-preset-pill\{min-height:44px/);
});

// 20. reports.ts persistence'a bağlanmaz
test("20. reports.ts modülü localStorage veya AppData persistence'ına bağlanmaz (saf motor)", () => {
  assert.doesNotMatch(reportsSource, /localStorage/);
  assert.doesNotMatch(reportsSource, /setItem/);
  assert.doesNotMatch(reportsSource, /getItem/);
});

// 21. AppData schema değişmez
test("21. AppData şeması veya STORAGE_KEY bu görevde değiştirilmemiştir", async () => {
  const typesSource = await readFile(new URL("../app/lib/types.ts", import.meta.url), "utf8");
  assert.match(typesSource, /export interface AppData \{/);
  assert.doesNotMatch(typesSource, /reportState/);
});

// 22. Module export test
test("22. ReportsView modülü beklenen türleri ve bileşeni export eder", async () => {
  const reportsViewMod = await importTypeScript("app/components/ReportsView.tsx");
  assert.equal(typeof reportsViewMod.ReportsView, "function");
  assert.equal(typeof reportsViewMod.REPORT_RANGE_LABELS, "object");
  assert.equal(reportsViewMod.REPORT_RANGE_LABELS.current_week, "Bu Hafta");
  assert.equal(reportsViewMod.REPORT_RANGE_LABELS.last_4_weeks, "Son 4 Hafta");
});
