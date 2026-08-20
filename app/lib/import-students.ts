import type { Student } from "./types";

export type ImportConflictMode = "skip" | "update";
export type ImportRowStatus = "add" | "update" | "skip" | "error";

export interface ImportDraftRow {
  sourceRow: number;
  name: string;
  numberText: string;
}

export interface AnalyzedImportRow extends ImportDraftRow {
  number: number | null;
  status: ImportRowStatus;
  message: string;
  existingId?: string;
}

export interface ColumnMapping {
  name: number;
  surname: number | null;
  number: number;
}

const fullNameHeaders = ["ad soyad", "adı soyadı", "adi soyadi", "öğrenci adı", "ogrenci adi", "öğrenci", "ogrenci", "isim soyisim"];
const firstNameHeaders = ["ad", "adı", "adi", "isim"];
const surnameHeaders = ["soyad", "soyadı", "soyadi", "soyisim"];
const numberHeaders = ["no", "numara", "öğrenci no", "ogrenci no", "öğrenci numarası", "ogrenci numarasi", "okul no", "okul numarası", "okul numarasi"];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR").replace(/[.:_-]+/g, " ").replace(/\s+/g, " ");
}

function findHeader(headers: unknown[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normalize(header)));
}

export function detectHeaderRow(rows: unknown[][]) {
  let bestRow = 0;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const headers = row.map(normalize);
    const hasName = headers.some((value) => [...fullNameHeaders, ...firstNameHeaders].includes(value));
    const hasNumber = headers.some((value) => numberHeaders.includes(value));
    const score = (hasName ? 2 : 0) + (hasNumber ? 2 : 0) + Math.min(headers.filter(Boolean).length, 3) * 0.1;
    if (score > bestScore) { bestScore = score; bestRow = index; }
  });
  return bestRow;
}

export function detectColumns(headers: unknown[]): ColumnMapping {
  const fullName = findHeader(headers, fullNameHeaders);
  const firstName = findHeader(headers, firstNameHeaders);
  const surname = findHeader(headers, surnameHeaders);
  const number = findHeader(headers, numberHeaders);
  return {
    name: fullName >= 0 ? fullName : firstName >= 0 ? firstName : Math.min(1, Math.max(headers.length - 1, 0)),
    surname: fullName >= 0 || surname < 0 ? null : surname,
    number: number >= 0 ? number : 0,
  };
}

export function rowsFromSheet(rows: unknown[][], headerRow: number, mapping: ColumnMapping): ImportDraftRow[] {
  return rows.slice(headerRow + 1).map((row, index) => ({
    sourceRow: headerRow + index + 2,
    name: [row[mapping.name], mapping.surname == null ? "" : row[mapping.surname]].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " "),
    numberText: String(row[mapping.number] ?? "").trim(),
  })).filter((row) => row.name || row.numberText);
}

function parseStudentNumber(value: string) {
  const normalized = value.trim().replace(/\.0+$/, "");
  if (!/^\d{1,3}$/.test(normalized)) return null;
  const number = Number(normalized);
  return number >= 1 && number <= 999 ? number : null;
}

export function analyzeImportRows(rows: ImportDraftRow[], existing: Student[], conflictMode: ImportConflictMode): AnalyzedImportRow[] {
  const parsedNumbers = rows.map((row) => parseStudentNumber(row.numberText));
  const numberCounts = new Map<number, number>();
  parsedNumbers.forEach((number) => { if (number != null) numberCounts.set(number, (numberCounts.get(number) ?? 0) + 1); });
  const existingByNumber = new Map(existing.map((student) => [student.number, student]));

  return rows.map((row, index) => {
    const name = row.name.trim().replace(/\s+/g, " ");
    const number = parsedNumbers[index];
    if (!name) return { ...row, name, number, status: "error", message: "Ad soyad eksik" };
    if (number == null) return { ...row, name, number, status: "error", message: "Numara 1–999 arasında olmalı" };
    if ((numberCounts.get(number) ?? 0) > 1) return { ...row, name, number, status: "error", message: "Dosyada tekrarlanan numara" };
    const existingStudent = existingByNumber.get(number);
    if (existingStudent) return conflictMode === "update"
      ? { ...row, name, number, status: "update", message: `${existingStudent.name} güncellenecek`, existingId: existingStudent.id }
      : { ...row, name, number, status: "skip", message: "Bu numara sınıfta mevcut", existingId: existingStudent.id };
    return { ...row, name, number, status: "add", message: "Yeni öğrenci" };
  });
}

export function mergeImportedStudents(existing: Student[], rows: AnalyzedImportRow[], idFactory: () => string) {
  const updates = new Map(rows.filter((row) => row.status === "update" && row.existingId).map((row) => [row.existingId!, row]));
  const updated = existing.map((student) => {
    const row = updates.get(student.id);
    return row && row.number != null ? { ...student, name: row.name, number: row.number } : student;
  });
  const additions = rows.filter((row) => row.status === "add" && row.number != null).map((row) => ({ id: idFactory(), name: row.name, number: row.number! }));
  return {
    students: [...updated, ...additions].sort((a, b) => a.number - b.number),
    added: additions.length,
    updated: updates.size,
    skipped: rows.filter((row) => row.status === "skip").length,
    errors: rows.filter((row) => row.status === "error").length,
  };
}
