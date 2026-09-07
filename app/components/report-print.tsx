"use client";

import type { CheckType } from "../lib/types";
import {
  ALL_CHECK_TYPES,
  COVERAGE_STATUS_LABELS,
  PARTICIPATION_COPY,
  roundScore,
  type ClassComparisonReportDTO,
  type ClassComparisonStudentRow,
  type ClassGeneralReportDTO,
  type StudentReportCoreDTO,
} from "../lib/reports";
import type {
  ClassGeneralRecommendationReport,
  ReportRecommendation,
  StudentRecommendationReport,
} from "../lib/report-recommendations";
import { ReportBarChart, ReportLineChart } from "./report-charts";

/**
 * RAPOR-13A — Print infrastructure & browser PDF fallback.
 *
 * Presentation-only layer: receives prepared DTO snapshots, performs zero
 * business calculations (no participation/type/trend/absence/sufficiency
 * formulas). Real PDF Blob/File generation and native share belong to
 * RAPOR-13B and are intentionally absent here.
 */

export interface StudentPrintSnapshot {
  kind: "student";
  studentName: string;
  studentNumber: number;
  className: string;
  rangeLabel: string;
  report: StudentReportCoreDTO;
  recommendations: StudentRecommendationReport;
  evaluationText: string | null;
  weekTitles: Record<string, string>;
  generatedAt: string;
}

export interface ClassComparisonPrintSnapshot {
  kind: "comparison";
  className: string;
  rangeLabel: string;
  report: ClassComparisonReportDTO;
  generatedAt: string;
}

export interface ClassGeneralStudentSummaryRow {
  studentId: string;
  studentNumber: number;
  studentName: string;
  typeScores: Record<CheckType, number | null>;
  suggestedParticipationScore: number | null;
}

export interface ClassGeneralPrintSnapshot {
  kind: "class-general";
  className: string;
  rangeLabel: string;
  report: ClassGeneralReportDTO;
  recommendations: ClassGeneralRecommendationReport;
  evaluationText: string | null;
  weekTitles: Record<string, string>;
  includeStudentSummary: boolean;
  studentSummary?: ClassGeneralStudentSummaryRow[];
  generatedAt: string;
}

export type ReportPrintSnapshot =
  | StudentPrintSnapshot
  | ClassComparisonPrintSnapshot
  | ClassGeneralPrintSnapshot;

export type ReportPrintJob = ReportPrintSnapshot;

/**
 * Snapshot builders: assemble immutable plain-data snapshots from already
 * computed authoritative DTOs. Mapping only — no recalculation.
 */
export function buildStudentPrintSnapshot(args: {
  studentName: string;
  studentNumber: number;
  className: string;
  rangeLabel: string;
  report: StudentReportCoreDTO;
  recommendations: StudentRecommendationReport;
  evaluationText: string | null;
  weekTitles: Record<string, string>;
  generatedAt: string;
}): StudentPrintSnapshot {
  return { kind: "student", ...args };
}

export function buildClassComparisonPrintSnapshot(args: {
  className: string;
  rangeLabel: string;
  report: ClassComparisonReportDTO;
  generatedAt: string;
}): ClassComparisonPrintSnapshot {
  return { kind: "comparison", ...args };
}

export function buildClassGeneralPrintSnapshot(args: {
  className: string;
  rangeLabel: string;
  report: ClassGeneralReportDTO;
  recommendations: ClassGeneralRecommendationReport;
  evaluationText: string | null;
  weekTitles: Record<string, string>;
  includeStudentSummary: boolean;
  studentSummary?: ClassGeneralStudentSummaryRow[];
  generatedAt: string;
}): ClassGeneralPrintSnapshot {
  return { kind: "class-general", ...args };
}

/**
 * Karşılaştırma DTO satırlarından print'e özel öğrenci özeti üretir.
 * Yalnız primitive alanları taşır; yeni istatistik formülü içermez,
 * suggested score'u aynen korur (insufficient ise null kalır).
 */
export function toClassGeneralStudentSummaryRows(
  rows: ClassComparisonStudentRow[]
): ClassGeneralStudentSummaryRow[] {
  return rows.map((row) => ({
    studentId: row.studentId,
    studentNumber: row.studentNumber,
    studentName: row.studentName,
    typeScores: { ...row.typeScores },
    suggestedParticipationScore: row.suggestedParticipationScore,
  }));
}

export function formatPrintTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatScore(score: number | null): string {
  return score !== null && score !== undefined ? `%${score}` : "—";
}

function typeTitle(type: CheckType): string {
  return type === "Ödev" ? "Ödev Yapma" : `${type} Getirme`;
}

function ReportPrintShell({
  reportType,
  privacyLabel,
  contextLines,
  rangeLabel,
  generatedAt,
  landscape,
  children,
}: {
  reportType: string;
  privacyLabel: string;
  contextLines: string[];
  rangeLabel: string;
  generatedAt: string;
  landscape?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`report-print-document${landscape ? " landscape" : ""}`} aria-label={reportType}>
      <header className="report-print-header">
        <p className="report-print-brand">Sınıf Rota</p>
        <h1 className="report-print-title">{reportType}</h1>
        <p className="report-print-privacy">{privacyLabel}</p>
        <dl className="report-print-meta">
          {contextLines.map((line, idx) => (
            <div key={idx} className="report-print-meta-row">
              <dd>{line}</dd>
            </div>
          ))}
          <div className="report-print-meta-row">
            <dd>{rangeLabel}</dd>
          </div>
          <div className="report-print-meta-row">
            <dd>Oluşturulma: {formatPrintTimestamp(generatedAt)}</dd>
          </div>
        </dl>
      </header>
      {children}
      <footer className="report-print-footer">
        <span>Sınıf Rota</span>
        <span>{formatPrintTimestamp(generatedAt)}</span>
      </footer>
    </article>
  );
}

function PrintRecommendations({
  title,
  summary,
  recommendations,
}: {
  title: string;
  summary: string[];
  recommendations: ReportRecommendation[];
}) {
  return (
    <section className="report-print-block" aria-label={title}>
      <h2 className="report-print-h2">{title}</h2>
      {summary.map((line, idx) => (
        <p key={idx} className="report-print-summary-line">
          {line}
        </p>
      ))}
      {recommendations.length === 0 ? (
        <p className="report-print-empty">Bu dönem için ek bir öneri bulunmuyor.</p>
      ) : (
        <ul className="report-print-rec-list">
          {recommendations.map((rec) => (
            <li key={rec.id} className="report-print-rec-item">
              <strong className="report-print-rec-title">{rec.title}</strong>
              <p className="report-print-rec-message">{rec.message}</p>
              {rec.evidence.length > 0 && (
                <p className="report-print-rec-evidence">{rec.evidence.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrintTeacherEvaluation({ text }: { text: string }) {
  return (
    <section className="report-print-block" aria-label="Öğretmen değerlendirmesi">
      <h2 className="report-print-h2">Öğretmen Değerlendirmesi</h2>
      <p className="report-print-teacher-text">{text}</p>
    </section>
  );
}

function PrintMetricGrid({
  breakdowns,
}: {
  breakdowns: Record<CheckType, { score: number | null; evaluatedCount: number }>;
}) {
  return (
    <section className="report-print-block" aria-label="Kontrol türleri">
      <h2 className="report-print-h2">Kontrol Türleri</h2>
      <table className="report-print-table">
        <thead>
          <tr>
            <th scope="col">Tür</th>
            <th scope="col">Puan</th>
            <th scope="col">Değerlendirme</th>
          </tr>
        </thead>
        <tbody>
          {ALL_CHECK_TYPES.map((type) => {
            const item = breakdowns[type];
            const score = item?.score !== null && item?.score !== undefined
              ? roundScore(item.score, 0)
              : null;
            return (
              <tr key={type}>
                <th scope="row">{typeTitle(type)}</th>
                <td>{formatScore(score)}</td>
                <td>{item?.evaluatedCount > 0 ? `${item.evaluatedCount} değerlendirme` : "Veri yok"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function StudentReportPrintView({ snapshot }: { snapshot: StudentPrintSnapshot }) {
  const { report } = snapshot;
  const participation = report.suggestedParticipationScore;
  return (
    <ReportPrintShell
      reportType="Bireysel Öğrenci Raporu"
      privacyLabel="Bireysel Öğrenci Raporu"
      contextLines={[
        snapshot.studentName,
        `${snapshot.className} · No: ${snapshot.studentNumber}`,
      ]}
      rangeLabel={snapshot.rangeLabel}
      generatedAt={snapshot.generatedAt}
    >
      <section className="report-print-block" aria-label={PARTICIPATION_COPY.TITLE}>
        <h2 className="report-print-h2">{PARTICIPATION_COPY.TITLE}</h2>
        <p className="report-print-score">
          {participation !== null ? `${participation} / 100` : "—"}
        </p>
        {participation !== null ? (
          <>
            <p className="report-print-desc">{PARTICIPATION_COPY.DESCRIPTION}</p>
            <p className="report-print-disclaimer">{PARTICIPATION_COPY.DISCLAIMER}</p>
          </>
        ) : (
          <p className="report-print-desc">{report.dataSufficiency.coverageNote}</p>
        )}
      </section>

      <PrintMetricGrid breakdowns={report.breakdowns} />

      <section className="report-print-block" aria-label="Veri durumu">
        <h2 className="report-print-h2">Veri Durumu</h2>
        <p className="report-print-line">
          Veri yeterliliği: {COVERAGE_STATUS_LABELS[report.dataSufficiency.coverageStatus]} ·{" "}
          {report.totalValidCheckCount} değerlendirme
        </p>
        <p className="report-print-line">Kontrollerde Gelmedi: {report.observedAbsenceCount} kayıt</p>
      </section>

      <PrintRecommendations
        title="Değerlendirme ve Öneriler"
        summary={snapshot.recommendations.summary}
        recommendations={snapshot.recommendations.recommendations}
      />

      {snapshot.evaluationText && <PrintTeacherEvaluation text={snapshot.evaluationText} />}

      <section className="report-print-block" aria-label="Haftalık kontrol geçmişi">
        <h2 className="report-print-h2">Haftalık Kontrol Geçmişi</h2>
        {report.weeklyHistory.length === 0 ? (
          <p className="report-print-empty">Bu dönem aralığında kayıtlı kontrol bulunamadı.</p>
        ) : (
          <table className="report-print-table">
            <thead>
              <tr>
                <th scope="col">Hafta</th>
                {ALL_CHECK_TYPES.map((type) => (
                  <th scope="col" key={type}>
                    {type}
                  </th>
                ))}
                <th scope="col">Gelmedi</th>
              </tr>
            </thead>
            <tbody>
              {report.weeklyHistory.map((week) => (
                <tr key={week.weekStart}>
                  <th scope="row">{snapshot.weekTitles[week.weekStart] ?? `${week.weekStart} Haftası`}</th>
                  {ALL_CHECK_TYPES.map((type) => {
                    const breakdown = week.typeBreakdowns[type];
                    const score = breakdown?.score !== null && breakdown?.score !== undefined
                      ? roundScore(breakdown.score, 0)
                      : null;
                    return <td key={type}>{formatScore(score)}</td>;
                  })}
                  <td>{week.observedAbsenceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </ReportPrintShell>
  );
}

export function ClassComparisonPrintView({ snapshot }: { snapshot: ClassComparisonPrintSnapshot }) {
  const { report } = snapshot;
  return (
    <ReportPrintShell
      reportType="Sınıf Karşılaştırma Raporu"
      privacyLabel="Öğretmen İç Kullanım"
      landscape
      contextLines={[snapshot.className, `${report.rows.length} Öğrenci`]}
      rangeLabel={snapshot.rangeLabel}
      generatedAt={snapshot.generatedAt}
    >
      <section className="report-print-block" aria-label="Öğrenci karşılaştırma tablosu">
        <h2 className="report-print-h2">Öğrenci Karşılaştırması</h2>
        {report.rows.length === 0 ? (
          <p className="report-print-empty">Bu sınıfta karşılaştırılabilecek öğrenci bulunmuyor.</p>
        ) : (
          <table className="report-print-table report-print-comparison-table">
            <thead>
              <tr>
                <th scope="col">Öğrenci</th>
                <th scope="col">No</th>
                {ALL_CHECK_TYPES.map((type) => (
                  <th scope="col" key={type}>
                    {type}
                  </th>
                ))}
                <th scope="col">Öneri Notu</th>
                <th scope="col">Veri Durumu</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.studentId}>
                  <th scope="row">{row.studentName}</th>
                  <td>{row.studentNumber}</td>
                  {ALL_CHECK_TYPES.map((type) => (
                    <td key={type}>{formatScore(row.typeScores[type])}</td>
                  ))}
                  <td>
                    {row.suggestedParticipationScore !== null
                      ? row.suggestedParticipationScore
                      : "—"}
                  </td>
                  <td>{COVERAGE_STATUS_LABELS[row.coverageStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </ReportPrintShell>
  );
}

export function ClassGeneralPrintView({ snapshot }: { snapshot: ClassGeneralPrintSnapshot }) {
  const { report } = snapshot;
  return (
    <ReportPrintShell
      reportType="Sınıf Genel Raporu"
      privacyLabel="Sınıf Genel Raporu"
      contextLines={[snapshot.className, `${report.activeStudentCount} Aktif Öğrenci`]}
      rangeLabel={snapshot.rangeLabel}
      generatedAt={snapshot.generatedAt}
    >
      <PrintMetricGrid
        breakdowns={Object.fromEntries(
          ALL_CHECK_TYPES.map((type) => [
            type,
            {
              score: report.typeMetrics[type]?.score ?? null,
              evaluatedCount: report.typeMetrics[type]?.evaluatedCount ?? 0,
            },
          ])
        ) as Record<CheckType, { score: number | null; evaluatedCount: number }>}
      />

      <section className="report-print-block" aria-label="Veri durumu">
        <h2 className="report-print-h2">Veri Durumu</h2>
        <p className="report-print-line">
          Kontrollerde Gelmedi: {report.totalObservedAbsenceCount} kayıt
        </p>
        <p className="report-print-line">
          Veri kapsamı: {report.dataCoverage.studentsWithSufficientData} yeterli /{" "}
          {report.dataCoverage.studentsWithInsufficientData} yetersiz
        </p>
      </section>

      <section className="report-print-block" aria-label="Grafikler">
        <h2 className="report-print-h2">Grafikler</h2>
        <ReportBarChart typeMetrics={report.typeMetrics} />
        <ReportLineChart weeklyTrend={report.weeklyTrend} />
      </section>

      <PrintRecommendations
        title="Genel Değerlendirme ve Öneriler"
        summary={snapshot.recommendations.summary}
        recommendations={snapshot.recommendations.recommendations}
      />

      {snapshot.evaluationText && <PrintTeacherEvaluation text={snapshot.evaluationText} />}

      <section className="report-print-block" aria-label="Haftalık sınıf özeti">
        <h2 className="report-print-h2">Haftalık Sınıf Özeti</h2>
        {report.weeklyTrend.length === 0 ? (
          <p className="report-print-empty">Bu dönem aralığında haftalık kayıt bulunamadı.</p>
        ) : (
          <table className="report-print-table">
            <thead>
              <tr>
                <th scope="col">Hafta</th>
                {ALL_CHECK_TYPES.map((type) => (
                  <th scope="col" key={type}>
                    {type}
                  </th>
                ))}
                <th scope="col">Kontrol</th>
              </tr>
            </thead>
            <tbody>
              {report.weeklyTrend.map((trend) => (
                <tr key={trend.weekStart}>
                  <th scope="row">{snapshot.weekTitles[trend.weekStart] ?? `${trend.weekStart} Haftası`}</th>
                  {ALL_CHECK_TYPES.map((type) => (
                    <td key={type}>{formatScore(trend.typeScores[type])}</td>
                  ))}
                  <td>{trend.sessionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {snapshot.includeStudentSummary && snapshot.studentSummary && (
        <section className="report-print-block" aria-label="Öğrenci özeti">
          <h2 className="report-print-h2">Öğrenci Özeti</h2>
          <p className="report-print-desc">Bu bölüm yalnız öğretmen içi kullanım içindir.</p>
          {snapshot.studentSummary.length === 0 ? (
            <p className="report-print-empty">Bu sınıfta listelenecek öğrenci bulunmuyor.</p>
          ) : (
            <table className="report-print-table">
              <thead>
                <tr>
                  <th scope="col">No</th>
                  <th scope="col">Öğrenci</th>
                  {ALL_CHECK_TYPES.map((type) => (
                    <th scope="col" key={type}>
                      {type}
                    </th>
                  ))}
                  <th scope="col">Derse Katılım</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.studentSummary.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.studentNumber}</td>
                    <th scope="row">{row.studentName}</th>
                    {ALL_CHECK_TYPES.map((type) => (
                      <td key={type}>{formatScore(row.typeScores[type] ?? null)}</td>
                    ))}
                    <td>
                      {row.suggestedParticipationScore !== null
                        ? row.suggestedParticipationScore
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </ReportPrintShell>
  );
}

export function ReportPrintJobView({ job }: { job: ReportPrintJob }) {
  if (job.kind === "student") {
    return <StudentReportPrintView snapshot={job} />;
  }
  if (job.kind === "comparison") {
    return <ClassComparisonPrintView snapshot={job} />;
  }
  return <ClassGeneralPrintView snapshot={job} />;
}
