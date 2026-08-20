"use client";

import { useMemo, useRef, useState } from "react";
import { analyzeImportRows, detectColumns, detectHeaderRow, mergeImportedStudents, rowsFromSheet, type ColumnMapping, type ImportConflictMode, type ImportDraftRow } from "../lib/import-students";
import type { SchoolClass, Student } from "../lib/types";

type SheetRows = Record<string, unknown[][]>;
type ImportSummary = { added: number; updated: number; skipped: number; errors: number };

export function StudentImport({ schoolClass, onBack, onImport }: { schoolClass: SchoolClass; onBack: () => void; onImport: (students: Student[], summary: ImportSummary) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetRows>({});
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: 1, surname: null, number: 0 });
  const [drafts, setDrafts] = useState<ImportDraftRow[] | null>(null);
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = sheets[sheetName] ?? [];
  const headers = (rows[headerRow] ?? []).map((value, index) => String(value || `Sütun ${index + 1}`));
  const analyzed = useMemo(() => drafts ? analyzeImportRows(drafts, schoolClass.students, conflictMode) : [], [drafts, schoolClass.students, conflictMode]);
  const summary = useMemo(() => analyzed.reduce((result, row) => ({ ...result, [row.status === "add" ? "added" : row.status === "update" ? "updated" : row.status === "skip" ? "skipped" : "errors"]: result[row.status === "add" ? "added" : row.status === "update" ? "updated" : row.status === "skip" ? "skipped" : "errors"] + 1 }), { added: 0, updated: 0, skipped: 0, errors: 0 }), [analyzed]);

  function configureSheet(name: string, source: SheetRows = sheets) {
    const nextRows = source[name] ?? [];
    const nextHeader = detectHeaderRow(nextRows);
    setSheetName(name);
    setHeaderRow(nextHeader);
    setMapping(detectColumns(nextRows[nextHeader] ?? []));
    setDrafts(null);
  }

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 10 * 1024 * 1024) { setError("Dosya 10 MB'dan küçük olmalı."); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError("XLSX, XLS veya CSV dosyası seçin."); return; }
    setBusy(true);
    try {
      const [XLSX, cptable] = await Promise.all([import("xlsx"), import("xlsx/dist/cpexcel.full")]);
      XLSX.set_cptable(cptable);
      const isCsv = /\.csv$/i.test(file.name);
      const workbook = XLSX.read(isCsv ? await file.text() : await file.arrayBuffer(), { type: isCsv ? "string" : "array", sheetRows: 1002, dense: true });
      const nextSheets = Object.fromEntries(workbook.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false }) as unknown[][]]));
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet || !(nextSheets[firstSheet]?.length)) throw new Error("empty");
      if (Object.values(nextSheets).some((sheetRows) => sheetRows.length >= 1002)) throw new Error("too-many-rows");
      setFileName(file.name);
      setSheets(nextSheets);
      configureSheet(firstSheet, nextSheets);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "too-many-rows" ? "Bir çalışma sayfasında en fazla 1000 öğrenci satırı aktarılabilir." : "Dosya okunamadı. Dosyanın bozuk olmadığını ve parola korumalı olmadığını kontrol edin.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    setBusy(true);
    try {
      const { utils, writeFileXLSX } = await import("xlsx");
      const worksheet = utils.aoa_to_sheet([
        ["Okul Numarası", "Ad Soyad"],
      ]);
      worksheet["!cols"] = [{ wch: 18 }, { wch: 28 }];
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, "Öğrenciler");
      writeFileXLSX(workbook, "sinif-rota-ogrenci-sablonu.xlsx");
    } finally { setBusy(false); }
  }

  function preparePreview() {
    if (!headers.length || mapping.name < 0 || mapping.number < 0) { setError("Ad soyad ve okul numarası sütunlarını seçin."); return; }
    const nextDrafts = rowsFromSheet(rows, headerRow, mapping);
    if (!nextDrafts.length) { setError("Seçilen sütunlarda öğrenci satırı bulunamadı."); return; }
    setError("");
    setDrafts(nextDrafts);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function commitImport() {
    if (!drafts || summary.errors || !(summary.added + summary.updated)) return;
    const result = mergeImportedStudents(schoolClass.students, analyzed, () => crypto.randomUUID());
    onImport(result.students, result);
  }

  return <>
    <header className="page-header"><button className="back-button" onClick={onBack} aria-label="Sınıfa dön">←</button><div><p className="eyebrow">{schoolClass.name.toLocaleUpperCase("tr-TR")}</p><h1>Öğrenci aktar</h1></div></header>

    {!fileName && <section className="import-intro">
      <p className="kicker">EXCEL VE CSV</p>
      <h2>Öğrenci listesini tek seferde ekleyin.</h2>
      <p>Dosyanız cihazınızda okunur. Kaydetmeden önce isimleri, numaraları ve hataları kontrol edebilirsiniz.</p>
      <input ref={fileInputRef} className="visually-hidden" id="student-file" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={(event) => readFile(event.target.files?.[0])} />
      <label className={`file-picker ${busy ? "disabled" : ""}`} htmlFor="student-file"><span>Dosya seç</span><small>XLSX, XLS veya CSV · en fazla 10 MB</small></label>
      <button className="template-link" type="button" onClick={downloadTemplate} disabled={busy}>↓ Örnek Excel şablonunu indir</button>
    </section>}

    {fileName && !drafts && <section className="import-setup">
      <div className="import-file"><div><span>SEÇİLEN DOSYA</span><strong>{fileName}</strong></div><button type="button" onClick={() => { setFileName(""); setSheets({}); setError(""); }}>Değiştir</button></div>
      <div className="mapping-grid">
        {Object.keys(sheets).length > 1 && <label>Çalışma sayfası<select value={sheetName} onChange={(event) => configureSheet(event.target.value)}>{Object.keys(sheets).map((name) => <option key={name}>{name}</option>)}</select></label>}
        <label>Başlık satırı<select value={headerRow} onChange={(event) => { const next = Number(event.target.value); setHeaderRow(next); setMapping(detectColumns(rows[next] ?? [])); }}>{rows.slice(0, 12).map((row, index) => <option key={index} value={index}>{index + 1}. satır · {row.filter(Boolean).slice(0, 3).join(" / ") || "Boş"}</option>)}</select></label>
        <ColumnSelect label="Okul numarası" headers={headers} value={mapping.number} onChange={(number) => setMapping((current) => ({ ...current, number }))} />
        <ColumnSelect label="Ad veya ad soyad" headers={headers} value={mapping.name} onChange={(name) => setMapping((current) => ({ ...current, name }))} />
        <label>Soyad sütunu <small>(ayrıysa)</small><select value={mapping.surname ?? ""} onChange={(event) => setMapping((current) => ({ ...current, surname: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">Ayrı soyad sütunu yok</option>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>
      </div>
      <div className="mapping-sample"><span>ÖRNEK</span><strong>{rowsFromSheet(rows, headerRow, mapping)[0]?.numberText || "—"} · {rowsFromSheet(rows, headerRow, mapping)[0]?.name || "Öğrenci bulunamadı"}</strong></div>
      <button className="primary-action" type="button" onClick={preparePreview}>Önizlemeyi hazırla <span>→</span></button>
    </section>}

    {drafts && <section className="import-preview">
      <div className="preview-heading"><div><p className="kicker">AKTARIM ÖNİZLEMESİ</p><h2>{drafts.length} satırı kontrol edin</h2></div><button type="button" onClick={() => setDrafts(null)}>Eşlemeyi değiştir</button></div>
      <fieldset className="conflict-choice"><legend>Sınıfta aynı numara varsa</legend><label><input type="radio" name="conflict" checked={conflictMode === "skip"} onChange={() => setConflictMode("skip")} /> Atla</label><label><input type="radio" name="conflict" checked={conflictMode === "update"} onChange={() => setConflictMode("update")} /> Adını güncelle</label></fieldset>
      <div className="import-summary" aria-live="polite"><span><b>{summary.added}</b> yeni</span><span><b>{summary.updated}</b> güncelleme</span><span><b>{summary.skipped}</b> atlanacak</span><span className={summary.errors ? "has-error" : ""}><b>{summary.errors}</b> hata</span></div>
      {summary.errors > 0 && <p className="import-error-note">Hatalı satırları düzeltin veya listeden çıkarın.</p>}
      <div className="import-table"><div className="import-table-head"><span>Satır</span><span>Numara</span><span>Ad Soyad</span><span>Durum</span></div>{analyzed.map((row, index) => <div className={`import-row status-${row.status}`} key={`${row.sourceRow}-${index}`}><span>{row.sourceRow}</span><input aria-label={`${row.sourceRow}. satır okul numarası`} inputMode="numeric" value={drafts[index].numberText} onChange={(event) => setDrafts((current) => current!.map((item, itemIndex) => itemIndex === index ? { ...item, numberText: event.target.value } : item))} /><input aria-label={`${row.sourceRow}. satır ad soyad`} value={drafts[index].name} onChange={(event) => setDrafts((current) => current!.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><div><small>{row.message}</small><button type="button" onClick={() => setDrafts((current) => current!.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${row.sourceRow}. satırı çıkar`}>Çıkar</button></div></div>)}</div>
      <div className="import-actions"><button className="primary-action" type="button" onClick={commitImport} disabled={summary.errors > 0 || !(summary.added + summary.updated)}>Öğrencileri aktar <span>→</span></button><p>{summary.errors ? "Aktarım için bütün hataları düzeltin." : `${summary.added + summary.updated} öğrenci sınıfa kaydedilecek.`}</p></div>
    </section>}
    {error && <p className="import-alert" role="alert">{error}</p>}
  </>;
}

function ColumnSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (value: number) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(Number(event.target.value))}>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>;
}
