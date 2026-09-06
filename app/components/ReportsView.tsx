"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckSession, SchoolClass, TeacherEvaluation, WorkCalendar } from "../lib/types";
import {
  buildTeacherEvaluationId,
  findEvaluationText,
  getTeacherEvaluation,
  TEACHER_EVALUATION_TEXT_MAX_LENGTH,
  type TeacherEvaluationIdentity,
  type TeacherEvaluationUpsertInput,
} from "../lib/teacher-evaluations";
import { resolveSessionWeekStart } from "../lib/session-week";
import { buildPlanWeeks, isValidWorkCalendar } from "../lib/planning/calendar";
import { formatWeekDateRange } from "./AnnualPlan";
import {
  ALL_CHECK_TYPES,
  calculateClassComparisonReport,
  calculateClassGeneralReport,
  calculateClassReportCore,
  calculateStudentReportCore,
  COVERAGE_STATUS_LABELS,
  findSemesterBreak,
  PARTICIPATION_COPY,
  resolveReportRange,
  roundScore,
  sortComparisonRows,
  type ClassComparisonReportDTO,
  type ClassGeneralReportDTO,
  type ClassReportCoreDTO,
  type ComparisonSortField,
  type SortDirection,
  type StudentReportCoreDTO,
} from "../lib/reports";
import { getStatusPresentation } from "../lib/quick-check";
import { ReportBarChart, ReportLineChart } from "./report-charts";
import {
  buildClassComparisonPrintSnapshot,
  buildClassGeneralPrintSnapshot,
  buildStudentPrintSnapshot,
  ReportPrintJobView,
  type ReportPrintJob,
} from "./report-print";
import {
  generateStudentRecommendations,
  generateClassGeneralRecommendations,
  RECOMMENDATION_SEVERITY_LABELS,
  RECOMMENDATION_CATEGORY_LABELS,
  type ReportRecommendation,
  type StudentRecommendationReport,
  type ClassGeneralRecommendationReport,
} from "../lib/report-recommendations";

interface RecommendationsSectionProps {
  title: string;
  subtitle?: string;
  summary: string[];
  recommendations: ReportRecommendation[];
}

function RecommendationsSection({
  title,
  subtitle,
  summary,
  recommendations,
}: RecommendationsSectionProps) {
  return (
    <div className="reports-recommendations-section" role="region" aria-label={title}>
      <div className="section-subheading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="section-subdesc">{subtitle}</p>}
        </div>
        <span className="section-count">{recommendations.length} Öneri</span>
      </div>

      {summary.length > 0 && (
        <div className="recommendations-summary-box">
          {summary.map((item, idx) => (
            <p key={idx} className="recommendations-summary-line">
              {item}
            </p>
          ))}
        </div>
      )}

      {recommendations.length > 0 ? (
        <div className="recommendations-grid">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className={`recommendation-card severity-${rec.severity}`}
              role="article"
              aria-label={`${rec.title} - ${RECOMMENDATION_SEVERITY_LABELS[rec.severity]}`}
            >
              <div className="recommendation-header">
                <span className="recommendation-title">{rec.title}</span>
                <div className="recommendation-badges">
                  <span className={`recommendation-category-pill category-${rec.category}`}>
                    {RECOMMENDATION_CATEGORY_LABELS[rec.category]}
                  </span>
                  <span className={`recommendation-severity-pill severity-${rec.severity}`}>
                    {RECOMMENDATION_SEVERITY_LABELS[rec.severity]}
                  </span>
                </div>
              </div>

              <p className="recommendation-message">{rec.message}</p>

              {rec.evidence.length > 0 && (
                <div className="recommendation-evidence-list">
                  {rec.evidence.map((ev, evIdx) => (
                    <span key={evIdx} className="recommendation-evidence-pill">
                      {ev}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="reports-empty-note">Bu dönem için ek bir öneri bulunmuyor.</p>
      )}
    </div>
  );
}

export const TEACHER_EVAL_UNSAVED_MESSAGE =
  "Kaydedilmemiş öğretmen değerlendirmeniz var. Değişiklikleri kaydetmeden devam etmek istiyor musunuz?";

interface TeacherEvaluationEditorProps {
  identity: TeacherEvaluationIdentity;
  persisted: TeacherEvaluation | null;
  rangeLabel: string;
  scopeDescription: string;
  onSave: (identity: TeacherEvaluationIdentity, text: string) => void;
  onDelete: (identity: TeacherEvaluationIdentity) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function formatEvaluationTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * Öğretmen Değerlendirmesi düzenleyicisi (RAPOR-12).
 * Explicit save only: textarea local draft'ta tutulur, typing AppData'yı değiştirmez.
 * key={evaluationId} ile mount edildiği için context değişiminde eski draft
 * başka bir identity'ye taşınmaz.
 */
function TeacherEvaluationEditor({
  identity,
  persisted,
  rangeLabel,
  scopeDescription,
  onSave,
  onDelete,
  onDirtyChange,
}: TeacherEvaluationEditorProps) {
  const [draft, setDraft] = useState(persisted?.text ?? "");
  const persistedText = persisted?.text ?? "";
  const dirty = draft !== persistedText;

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const handleSave = () => {
    if (!dirty) return;
    onSave(identity, draft);
  };

  const handleDelete = () => {
    if (!persisted) return;
    if (typeof window !== "undefined" && !window.confirm("Bu değerlendirme notu silinsin mi?")) {
      return;
    }
    setDraft("");
    onDelete(identity);
  };

  return (
    <div className="teacher-eval-section" role="region" aria-label="Öğretmen değerlendirmesi">
      <div className="section-subheading">
        <div>
          <h3>Öğretmen Değerlendirmesi</h3>
          <p className="section-subdesc">{scopeDescription}</p>
        </div>
        <span className="reports-range-tag">{rangeLabel}</span>
      </div>

      <label className="teacher-eval-label" htmlFor={`teacher-eval-${buildTeacherEvaluationId(identity)}`}>
        <span>Değerlendirme notu</span>
        <textarea
          id={`teacher-eval-${buildTeacherEvaluationId(identity)}`}
          className="teacher-eval-textarea"
          rows={4}
          maxLength={TEACHER_EVALUATION_TEXT_MAX_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Bu dönem için değerlendirmenizi yazın"
        />
      </label>

      <div className="teacher-eval-meta">
        <span className="teacher-eval-counter" aria-live="polite">
          {draft.length}/{TEACHER_EVALUATION_TEXT_MAX_LENGTH} karakter
        </span>
        {dirty ? (
          <span className="teacher-eval-dirty" role="status">
            Kaydedilmemiş değişiklik
          </span>
        ) : persisted ? (
          <span className="teacher-eval-saved" role="status">
            Kaydedildi · Son güncelleme: {formatEvaluationTimestamp(persisted.updatedAt)}
          </span>
        ) : null}
      </div>

      <div className="teacher-eval-actions">
        <button
          type="button"
          className="primary-action"
          onClick={handleSave}
          disabled={!dirty}
        >
          Kaydet <span>→</span>
        </button>
        {persisted && (
          <button type="button" className="danger-action" onClick={handleDelete}>
            Notu Sil
          </button>
        )}
      </div>
    </div>
  );
}

export type ReportTab = "general" | "classes" | "students" | "sessions";
export type ReportRangePreset = "current_week" | "last_4_weeks" | "term" | "year";

export interface ReportsViewProps {
  classes: SchoolClass[];
  sessions: CheckSession[];
  calendar?: WorkCalendar;
  initialClassId?: string;
  initialStudentId?: string;
  teacherEvaluations?: TeacherEvaluation[];
  onUpsertTeacherEvaluation?: (input: TeacherEvaluationUpsertInput) => void;
  onDeleteTeacherEvaluation?: (identity: TeacherEvaluationIdentity) => void;
  onEvaluationDirtyChange?: (dirty: boolean) => void;
  onNavigateToClass?: (classId: string) => void;
}

export const REPORT_RANGE_LABELS: Record<ReportRangePreset, string> = {
  current_week: "Bu Hafta",
  last_4_weeks: "Son 4 Hafta",
  term: "Bu Dönem",
  year: "Tüm Yıl",
};

export function ReportsView({
  classes,
  sessions,
  calendar,
  initialClassId,
  initialStudentId,
  teacherEvaluations = [],
  onUpsertTeacherEvaluation,
  onDeleteTeacherEvaluation,
  onEvaluationDirtyChange,
}: ReportsViewProps) {
  const evalDirtyRef = useRef(false);

  const reportEvalDirtyChange = useCallback(
    (dirty: boolean) => {
      evalDirtyRef.current = dirty;
      onEvaluationDirtyChange?.(dirty);
    },
    [onEvaluationDirtyChange]
  );

  useEffect(() => {
    return () => {
      evalDirtyRef.current = false;
      onEvaluationDirtyChange?.(false);
    };
  }, [onEvaluationDirtyChange]);

  /**
   * Kaydedilmemiş öğretmen değerlendirmesi varken context değişimlerini
   * hafif bir confirmation ile korur. İptal: mevcut context + draft korunur.
   * Devam: draft discard edilir, hedef context açılır. Otomatik save yok.
   */
  const requestEvaluationContextChange = (apply: () => void): void => {
    if (evalDirtyRef.current) {
      if (
        typeof window !== "undefined" &&
        !window.confirm(TEACHER_EVAL_UNSAVED_MESSAGE)
      ) {
        return;
      }
      evalDirtyRef.current = false;
      onEvaluationDirtyChange?.(false);
    }
    apply();
  };
  const activeClasses = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const defaultClassId = initialClassId && classes.some((c) => c.id === initialClassId)
    ? initialClassId
    : activeClasses[0]?.id ?? classes[0]?.id ?? "";

  const [activeTab, setActiveTab] = useState<ReportTab>("general");
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId ?? "");
  const [selectedRangePreset, setSelectedRangePreset] = useState<ReportRangePreset>("current_week");

  // Güncel takvim haftası
  const currentWeekStart = useMemo(() => {
    return resolveSessionWeekStart(new Date().toISOString(), calendar);
  }, [calendar]);

  const planWeeks = useMemo(() => {
    return calendar && isValidWorkCalendar(calendar) ? buildPlanWeeks(calendar) : [];
  }, [calendar]);

  const currentPlanWeek = useMemo(() => {
    return planWeeks.find((w) => w.startDate === currentWeekStart);
  }, [planWeeks, currentWeekStart]);

  // Seçili sınıf nesnesi
  const selectedClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) ?? null;
  }, [classes, selectedClassId]);

  // Seçili öğrenci nesnesi
  const selectedStudent = useMemo(() => {
    if (!selectedClass || !selectedStudentId) return null;
    return selectedClass.students.find((s) => s.id === selectedStudentId) ?? null;
  }, [selectedClass, selectedStudentId]);

  // Sınıf değişimi (dirty draft varsa guarded)
  const handleClassChange = (newClassId: string) => {
    requestEvaluationContextChange(() => {
      setSelectedClassId(newClassId);
      setSelectedStudentId("");
    });
  };

  // Alt görünüm / öğrenci / aralık değişimleri (dirty draft varsa guarded)
  const handleTabChange = (tab: ReportTab) => {
    if (tab === activeTab) return;
    requestEvaluationContextChange(() => setActiveTab(tab));
  };

  const handleStudentChange = (studentId: string) => {
    requestEvaluationContextChange(() => setSelectedStudentId(studentId));
  };

  const handleRangePresetChange = (preset: ReportRangePreset) => {
    if (preset === selectedRangePreset) return;
    requestEvaluationContextChange(() => setSelectedRangePreset(preset));
  };

  // Rapor aralık nesnesi (fromWeekStart, toWeekStart)
  const reportRange = useMemo(() => {
    return resolveReportRange(selectedRangePreset, calendar);
  }, [selectedRangePreset, calendar]);

  const evaluationRange = useMemo(() => {
    return reportRange.fromWeekStart && reportRange.toWeekStart
      ? { fromWeekStart: reportRange.fromWeekStart, toWeekStart: reportRange.toWeekStart }
      : null;
  }, [reportRange]);

  const studentEvaluationIdentity: TeacherEvaluationIdentity | null =
    evaluationRange && selectedClass && selectedStudent
      ? {
          scope: "student",
          classId: selectedClass.id,
          studentId: selectedStudent.id,
          fromWeekStart: evaluationRange.fromWeekStart,
          toWeekStart: evaluationRange.toWeekStart,
        }
      : null;

  const studentEvaluation = studentEvaluationIdentity
    ? getTeacherEvaluation(teacherEvaluations, studentEvaluationIdentity)
    : null;

  const classGeneralEvaluationIdentity: TeacherEvaluationIdentity | null =
    evaluationRange && selectedClass
      ? {
          scope: "class_general",
          classId: selectedClass.id,
          fromWeekStart: evaluationRange.fromWeekStart,
          toWeekStart: evaluationRange.toWeekStart,
        }
      : null;

  const classGeneralEvaluation = classGeneralEvaluationIdentity
    ? getTeacherEvaluation(teacherEvaluations, classGeneralEvaluationIdentity)
    : null;

  const studentEvalText = findEvaluationText(teacherEvaluations, studentEvaluationIdentity);
  const classGeneralEvalText = findEvaluationText(teacherEvaluations, classGeneralEvaluationIdentity);

  const handleEvaluationSave = (identity: TeacherEvaluationIdentity, text: string) => {
    setPrintNotice("");
    onUpsertTeacherEvaluation?.({ ...identity, text });
  };

  const handleEvaluationDelete = (identity: TeacherEvaluationIdentity) => {
    setPrintNotice("");
    onDeleteTeacherEvaluation?.(identity);
  };


  // Range bilgisi metni
  const rangeDisplayLabel = useMemo(() => {
    if (selectedRangePreset === "current_week") {
      if (currentPlanWeek) {
        return `${currentPlanWeek.number}. Hafta (${formatWeekDateRange(currentPlanWeek.startDate, currentPlanWeek.endDate)})`;
      }
      return `${currentWeekStart} Haftası`;
    }
    if (selectedRangePreset === "last_4_weeks" && planWeeks.length > 0) {
      const fromW = planWeeks.find((w) => w.startDate === reportRange.fromWeekStart);
      const toW = planWeeks.find((w) => w.startDate === reportRange.toWeekStart);
      if (fromW && toW) {
        return `Son 4 Hafta (${fromW.number}.–${toW.number}. Hafta)`;
      }
      return "Son 4 Hafta";
    }
    if (selectedRangePreset === "term") {
      const semesterBreak = findSemesterBreak(calendar);
      const isTerm1 = !semesterBreak || currentWeekStart < semesterBreak.startDate;
      return isTerm1 ? "1. Dönem" : "2. Dönem";
    }
    if (selectedRangePreset === "year") {
      if (calendar?.schoolYear) {
        return `${calendar.schoolYear} Eğitim Öğretim Yılı`;
      }
      return REPORT_RANGE_LABELS.year;
    }
    return REPORT_RANGE_LABELS[selectedRangePreset];
  }, [selectedRangePreset, currentPlanWeek, currentWeekStart, planWeeks, reportRange, calendar]);

  // Seçili sınıfa ait oturumlar
  const classSessions = useMemo(() => {
    if (!selectedClassId) return sessions;
    return sessions.filter((s) => s.classId === selectedClassId);
  }, [sessions, selectedClassId]);

  // Sınıf Raporu Hesaplaması (saf motor)
  const classReport = useMemo<ClassReportCoreDTO | null>(() => {
    if (!selectedClass) return null;
    return calculateClassReportCore(selectedClass, sessions, {
      range: reportRange,
      calendar,
    });
  }, [selectedClass, sessions, reportRange, calendar]);

  // Sınıf Genel Raporu (öğrenci kimliği içermeyen aggregate motor)
  const generalReport = useMemo<ClassGeneralReportDTO | null>(() => {
    if (!selectedClass) return null;
    return calculateClassGeneralReport(selectedClass, sessions, {
      range: reportRange,
      calendar,
    });
  }, [selectedClass, sessions, reportRange, calendar]);

  // Sınıf Genel Değerlendirme ve Öneriler (saf motor)
  const classGeneralRecommendations = useMemo<ClassGeneralRecommendationReport | null>(() => {
    if (!generalReport) return null;
    return generateClassGeneralRecommendations(generalReport);
  }, [generalReport]);

  // Öğrenci Raporu Hesaplaması (saf motor)
  const studentReport = useMemo<StudentReportCoreDTO | null>(() => {
    if (!selectedClass || !selectedStudent) return null;
    return calculateStudentReportCore(selectedStudent, selectedClass, sessions, {
      range: reportRange,
      calendar,
    });
  }, [selectedStudent, selectedClass, sessions, reportRange, calendar]);

  // Öğrenci Değerlendirme ve Öneriler (saf motor)
  const studentRecommendations = useMemo<StudentRecommendationReport | null>(() => {
    if (!studentReport) return null;
    return generateStudentRecommendations(studentReport);
  }, [studentReport]);

  // Sınıf Öğrenci Karşılaştırma Raporu (saf motor)
  const comparisonReport = useMemo<ClassComparisonReportDTO | null>(() => {
    if (!selectedClass) return null;
    return calculateClassComparisonReport(selectedClass, sessions, {
      range: reportRange,
      calendar,
    });
  }, [selectedClass, sessions, reportRange, calendar]);

  const [compSortField, setCompSortField] = useState<ComparisonSortField>("number");
  const [compSortDir, setCompSortDir] = useState<SortDirection>("asc");

  const sortedComparisonRows = useMemo(() => {
    if (!comparisonReport) return [];
    return sortComparisonRows(comparisonReport.rows, compSortField, compSortDir);
  }, [comparisonReport, compSortField, compSortDir]);

  const handleCompSort = (field: ComparisonSortField) => {
    if (compSortField === field) {
      setCompSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setCompSortField(field);
      setCompSortDir("asc");
    }
  };

  const [printNotice, setPrintNotice] = useState("");
  const [printKind, setPrintKind] = useState<"student" | "comparison" | "class-general" | null>(null);
  const [printTicket, setPrintTicket] = useState(0);
  const [printStamp, setPrintStamp] = useState("");

  const printWeekTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const week of planWeeks) {
      titles[week.startDate] = `${week.number}. Hafta · ${formatWeekDateRange(week.startDate, week.endDate)}`;
    }
    return titles;
  }, [planWeeks]);

  /**
   * Print snapshot: hazır DTO'lardan türetilmiş salt veri (hesap yok).
   * Bilinçli olarak useMemo'suz hesaplanır: ucuz nesne birleştirmedir ve
   * ticket yalnızca print isteğinde değişir. window.print() dialogu açıkken
   * JS durakladığı için seçim değişimi araya giremez; dialog kapanınca
   * afterprint cleanup çalışır. generatedAt ticket başına tazedir.
   */
  const printSnapshot: ReportPrintJob | null = (() => {
    if (printTicket === 0 || !printKind) return null;
    const generatedAt = printStamp;
    if (printKind === "student") {
      if (!studentReport || !selectedStudent || !selectedClass || !studentRecommendations) return null;
      return buildStudentPrintSnapshot({
        studentName: selectedStudent.name,
        studentNumber: selectedStudent.number,
        className: selectedClass.name,
        rangeLabel: rangeDisplayLabel,
        report: studentReport,
        recommendations: studentRecommendations,
        evaluationText: studentEvalText,
        weekTitles: printWeekTitles,
        generatedAt,
      });
    }
    if (printKind === "comparison") {
      if (!comparisonReport || !selectedClass) return null;
      return buildClassComparisonPrintSnapshot({
        className: selectedClass.name,
        rangeLabel: rangeDisplayLabel,
        report: comparisonReport,
        generatedAt,
      });
    }
    if (!generalReport || !selectedClass || !classGeneralRecommendations) return null;
    return buildClassGeneralPrintSnapshot({
      className: selectedClass.name,
      rangeLabel: rangeDisplayLabel,
      report: generalReport,
      recommendations: classGeneralRecommendations,
      evaluationText: classGeneralEvalText,
      weekTitles: printWeekTitles,
      generatedAt,
    });
  })();

  // Print lifecycle: snapshot commit edildikten sonra yazdır,
  // dialog kapandıktan sonra cleanup yap. Popup/new window yok.
  // Snapshot her renderda yeniden üretilir; printedTicketRef aynı ticket
  // için tekrar yazdırmayı engeller.
  const printedTicketRef = useRef(0);
  useEffect(() => {
    if (printTicket === 0 || !printSnapshot || typeof window === "undefined") return;
    if (printedTicketRef.current === printTicket) return;
    printedTicketRef.current = printTicket;
    window.print();
  }, [printTicket, printSnapshot]);

  useEffect(() => {
    if (printTicket === 0 || !printSnapshot || typeof window === "undefined") return;
    const handleAfterPrint = () => {
      printedTicketRef.current = 0;
      setPrintKind(null);
      setPrintTicket(0);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printTicket, printSnapshot]);

  /**
   * Dirty teacher evaluation varken print engellenir: yalnız persisted
   * veri basılır, autosave yapılmaz, nötr uyarı gösterilir.
   */
  const requestPrint = (kind: "student" | "comparison" | "class-general"): void => {
    if (evalDirtyRef.current) {
      setPrintNotice(
        "Öğretmen değerlendirmenizde kaydedilmemiş değişiklikler var. Yazdırmadan önce kaydedin veya değişiklikleri geri alın."
      );
      return;
    }
    setPrintNotice("");
    setPrintKind(kind);
    setPrintStamp(new Date().toISOString());
    setPrintTicket((ticket) => ticket + 1);
  };

  const handlePrintStudent = () => {
    if (!studentReport || !selectedStudent || !selectedClass || !studentRecommendations) return;
    requestPrint("student");
  };

  const handlePrintComparison = () => {
    if (!comparisonReport || !selectedClass) return;
    requestPrint("comparison");
  };

  const handlePrintClassGeneral = () => {
    if (!generalReport || !selectedClass || !classGeneralRecommendations) return;
    requestPrint("class-general");
  };


  // Toplam istatistik özeti (Genel tab için nötr sayımlar)
  const totalActiveStudents = useMemo(() => {
    return activeClasses.reduce((sum, c) => sum + c.students.filter((s) => s.active !== false).length, 0);
  }, [activeClasses]);

  return (
    <div className="reports-shell">
      <header className="page-header">
        <div className="brand-mark" aria-label="Sınıf Rota">
          SR
        </div>
        <div>
          <p className="eyebrow">DEĞERLENDİRME & RAPORLAR</p>
          <h1>Raporlar</h1>
        </div>
      </header>

      <div className="reports-intro">
        <p className="reports-intro-text">
          Sınıf ve öğrenci kayıtlarını haftalık ve dönemlik olarak inceleyin.
        </p>
      </div>

      {/* Dörtlü Alt Navigasyon (Segmented Tabs) */}
      <div className="reports-nav" role="tablist" aria-label="Rapor bölümleri">
        <button
          role="tab"
          id="tab-general"
          aria-selected={activeTab === "general"}
          aria-controls="panel-general"
          className={`reports-tab-btn ${activeTab === "general" ? "active" : ""}`}
          onClick={() => handleTabChange("general")}
        >
          Genel
        </button>
        <button
          role="tab"
          id="tab-classes"
          aria-selected={activeTab === "classes"}
          aria-controls="panel-classes"
          className={`reports-tab-btn ${activeTab === "classes" ? "active" : ""}`}
          onClick={() => handleTabChange("classes")}
        >
          Sınıflar
        </button>
        <button
          role="tab"
          id="tab-students"
          aria-selected={activeTab === "students"}
          aria-controls="panel-students"
          className={`reports-tab-btn ${activeTab === "students" ? "active" : ""}`}
          onClick={() => handleTabChange("students")}
        >
          Öğrenciler
        </button>
        <button
          role="tab"
          id="tab-sessions"
          aria-selected={activeTab === "sessions"}
          aria-controls="panel-sessions"
          className={`reports-tab-btn ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => handleTabChange("sessions")}
        >
          Kayıtlar
        </button>
      </div>

      {/* Rapor Aralığı Filtresi (Range Preset) */}
      <div className="reports-filter-bar">
        <div className="range-preset-selector" role="group" aria-label="Rapor aralığı">
          {(["current_week", "last_4_weeks", "term", "year"] as ReportRangePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className={`range-preset-pill ${selectedRangePreset === preset ? "selected" : ""}`}
              onClick={() => handleRangePresetChange(preset)}
            >
              {REPORT_RANGE_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>

      {/* Hiç sınıf yoksa genel boş durum */}
      {!classes.length ? (
        <div className="empty-state" role="status">
          <strong>Henüz rapor oluşturulabilecek bir sınıf bulunmuyor.</strong>
          <p>Sınıflar bölümünden ilk sınıfınızı ekleyerek kontrol ve raporlama süreçlerini başlatabilirsiniz.</p>
        </div>
      ) : (
        <>
          {/* TAB 1: GENEL */}
          {activeTab === "general" && (
            <section
              id="panel-general"
              role="tabpanel"
              aria-labelledby="tab-general"
              className="reports-tab-panel"
            >
              <div className="reports-summary-grid">
                <div className="reports-stat-card">
                  <span className="reports-card-label">SEÇİLİ ARALIK</span>
                  <strong className="reports-card-value">{rangeDisplayLabel}</strong>
                  <small className="reports-card-hint">Tüm aktif sınıflar dahil</small>
                </div>
                <div className="reports-stat-card">
                  <span className="reports-card-label">AKTİF SINIFLAR</span>
                  <strong className="reports-card-value">{activeClasses.length}</strong>
                  <small className="reports-card-hint">Kayıtlı sınıf sayısı</small>
                </div>
                <div className="reports-stat-card">
                  <span className="reports-card-label">AKTİF ÖĞRENCİLER</span>
                  <strong className="reports-card-value">{totalActiveStudents}</strong>
                  <small className="reports-card-hint">Kontrole dahil öğrenci</small>
                </div>
                <div className="reports-stat-card">
                  <span className="reports-card-label">TOPLAM KONTROL</span>
                  <strong className="reports-card-value">{sessions.length}</strong>
                  <small className="reports-card-hint">Tamamlanan oturum</small>
                </div>
              </div>

              <div className="reports-placeholder-card">
                <p className="kicker">RAPORLAMA ALTYAPISI</p>
                <h3>Genel Görünüm ve Karşılaştırma</h3>
                <p className="reports-card-desc">
                  Detaylı sınıf ve öğrenci raporları sonraki aşamalarda bu alanda gösterilecektir.
                </p>
              </div>
            </section>
          )}

          {/* TAB 2: SINIFLAR */}
          {activeTab === "classes" && (
            <section
              id="panel-classes"
              role="tabpanel"
              aria-labelledby="tab-classes"
              className="reports-tab-panel"
            >
              <div className="reports-selector-row">
                <label htmlFor="report-class-select">
                  <span>SINIF SEÇİN</span>
                  <select
                    id="report-class-select"
                    value={selectedClassId}
                    onChange={(e) => handleClassChange(e.target.value)}
                  >
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.students.filter((s) => s.active !== false).length} aktif öğrenci)
                      </option>
                    ))}
                    {classes
                      .filter((c) => c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} [Arşivde]
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              {selectedClass ? (
                <div className="reports-class-card">
                  <div className="reports-class-header">
                    <div>
                      <p className="kicker">SINIF RAPORU</p>
                      <h2>{selectedClass.name}</h2>
                    </div>
                    <span className="reports-range-tag">{rangeDisplayLabel}</span>
                  </div>

                  <div className="reports-meta-chips">
                    <span>{selectedClass.students.filter((s) => s.active !== false).length} Aktif Öğrenci</span>
                    <span>{classReport?.totalSessions ?? 0} Kontrol Oturumu</span>
                  </div>

                  {/* Eğer seçili aralıkta hiç kontrol yoksa */}
                  {classReport && classReport.totalSessions === 0 ? (
                    <div className="reports-empty-range" role="status">
                      <strong>Seçilen dönemde bu sınıf için henüz kontrol kaydı bulunmuyor.</strong>
                      <p>Hızlı Kontrol bölümünden bu sınıf için yeni bir kontrol oturumu başlatabilirsiniz.</p>
                    </div>
                  ) : classReport ? (
                    <>
                      {/* 4 Ana Kontrol Türü Metrik Kartları */}
                      <div className="reports-metrics-grid" role="region" aria-label="Kontrol türleri ortalamaları">
                        {ALL_CHECK_TYPES.map((type) => {
                          const breakdown = classReport.typeAverages[type];
                          const score = breakdown?.score !== null && breakdown?.score !== undefined
                            ? roundScore(breakdown.score, 0)
                            : null;
                          const evaluatedCount = breakdown?.evaluatedCount ?? 0;
                          const title = type === "Ödev" ? "Ödev Yapma" : `${type} Getirme`;

                          return (
                            <div key={type} className="reports-metric-card">
                              <span className="metric-card-title">{title}</span>
                              <div
                                className="metric-card-score"
                                aria-label={score !== null ? `${title}: %${score}` : `${title}: Veri yok`}
                              >
                                {score !== null ? `%${score}` : "—"}
                              </div>
                              <div className="metric-card-sub">
                                {evaluatedCount > 0 ? (
                                  <span>{evaluatedCount} değerlendirme</span>
                                ) : (
                                  <span className="metric-no-data">Veri yok</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Gözlemlenen Yokluk ve Veri Yeterliliği İki Sütunlu / Kartlı Bölüm */}
                      <div className="reports-aux-grid">
                        {/* Gözlemlenen Yokluk Kartı */}
                        <div className="reports-aux-card absence-card">
                          <span className="aux-card-kicker">KONTROLLERDE GELMEDİ</span>
                          <div className="aux-card-main">
                            <strong className="aux-card-value">
                              {ALL_CHECK_TYPES.reduce((sum, t) => sum + classReport.typeAverages[t].absent, 0)} kayıt
                            </strong>
                          </div>
                          <p className="aux-card-explanation">
                            Yalnız ders içi kontrollerde &ldquo;Gelmedi&rdquo; olarak işaretlenen kayıtları gösterir.
                          </p>
                        </div>

                        {/* Veri Yeterliliği Özeti Kartı */}
                        <div className="reports-aux-card sufficiency-card">
                          <span className="aux-card-kicker">DERSE KATILIM VERİ YETERLİLİĞİ</span>
                          <div className="aux-card-main">
                            <strong className="aux-card-value">
                              {classReport.studentsWithSufficientData} yeterli / {classReport.studentsWithInsufficientData} yetersiz
                            </strong>
                          </div>
                          <p className="aux-card-explanation">
                            Derse Katılım Öneri Notu için {classReport.studentsWithSufficientData} öğrencide yeterli veri, {classReport.studentsWithInsufficientData} öğrencide henüz yetersiz veri.
                          </p>
                        </div>
                      </div>

                      {/* Haftalık Özetler Listesi */}
                      <div className="reports-weekly-section">
                        <div className="section-subheading">
                          <h3>Haftalık Kontrol Dökümü</h3>
                          <span className="section-count">{classReport.weeklySummaries.length} Hafta</span>
                        </div>

                        {classReport.weeklySummaries.length === 0 ? (
                          <p className="reports-empty-note">Bu dönem aralığında haftalık kayıt bulunamadı.</p>
                        ) : (
                          <div className="weekly-summary-list">
                            {classReport.weeklySummaries.map((summary) => {
                              const weekPlan = planWeeks.find((w) => w.startDate === summary.weekStart);
                              const weekTitle = weekPlan
                                ? `${weekPlan.number}. Hafta · ${formatWeekDateRange(weekPlan.startDate, weekPlan.endDate)}`
                                : `${summary.weekStart} Haftası`;

                              return (
                                <div key={summary.weekStart} className="weekly-summary-card">
                                  <div className="weekly-card-header">
                                    <strong className="weekly-card-title">{weekTitle}</strong>
                                    <span className="weekly-session-count">{summary.sessionCount} Oturum</span>
                                  </div>

                                  {/* Hafta içi tür skorları */}
                                  <div className="weekly-type-pills">
                                    {ALL_CHECK_TYPES.map((type) => {
                                      const breakdown = summary.typeBreakdowns[type];
                                      const sc = breakdown?.score !== null && breakdown?.score !== undefined
                                        ? roundScore(breakdown.score, 0)
                                        : null;
                                      return (
                                        <span key={type} className={`weekly-type-pill ${sc === null ? "empty" : ""}`}>
                                          <small>{type}:</small>
                                          <strong>{sc !== null ? `%${sc}` : "—"}</strong>
                                        </span>
                                      );
                                    })}
                                    {summary.observedAbsenceCount > 0 && (
                                      <span className="weekly-type-pill absence-pill">
                                        <small>Gelmedi:</small>
                                        <strong>{summary.observedAbsenceCount}</strong>
                                      </span>
                                    )}
                                  </div>

                                  {/* Ziyaret / Giriş Bilgileri */}
                                  <div className="weekly-visits-row">
                                    {summary.visitSummaries && summary.visitSummaries.length > 0 ? (
                                      summary.visitSummaries.map((v, vIdx) => {
                                        if (v.visitIndex !== undefined) {
                                          return (
                                            <span key={vIdx} className="weekly-visit-badge">
                                              {v.visitIndex}. Giriş · {v.sessionTypes.join(", ")}
                                            </span>
                                          );
                                        }
                                        return (
                                          <span key={vIdx} className="weekly-visit-badge legacy-badge">
                                            Eski kayıtlar: giriş bilgisi yok ({v.sessionTypes.join(", ")})
                                          </span>
                                        );
                                      })
                                    ) : summary.hasLegacyVisits ? (
                                      <span className="weekly-visit-badge legacy-badge">
                                        Eski kayıtlar: giriş bilgisi yok
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}

                  {/* 2. Sınıf Genel Raporu Bölümü (Öğrenci isimleri içermeyen aggregate görünüm) */}
                  {generalReport && (
                    <div className="reports-general-section">
                      <div className="section-subheading">
                        <div>
                          <h3>Sınıf Genel Raporu</h3>
                          <p className="section-subdesc">Öğrenci isimleri içermeyen sınıf genel görünümü.</p>
                        </div>
                        <span className="section-count">{generalReport.activeStudentCount} Aktif Öğrenci</span>
                      </div>

                      <div className="general-report-card">
                        <div className="general-report-header">
                          <div>
                            <p className="kicker">SINIF GENEL RAPORU</p>
                            <h4>{generalReport.className}</h4>
                          </div>
                          <div className="general-header-meta">
                            <span className="reports-range-tag">{rangeDisplayLabel}</span>
                            <span className="general-active-pill">{generalReport.activeStudentCount} aktif öğrenci</span>
                          </div>
                        </div>

                        <div className="report-print-action no-print">
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={handlePrintClassGeneral}
                            disabled={!generalReport || generalReport.totalControlSessionCount === 0}
                            aria-label="Sınıf genel raporunu yazdır"
                          >
                            Yazdır / PDF
                          </button>
                          <p className="report-print-hint">Yazdırma ekranından PDF olarak kaydedebilirsiniz.</p>
                          {printNotice && (
                            <p className="report-print-notice" role="status">
                              {printNotice}
                            </p>
                          )}
                        </div>

                        {generalReport.totalControlSessionCount === 0 ? (
                          <div className="reports-empty-range" role="status">
                            <strong>Seçilen dönemde bu sınıf için henüz kontrol kaydı bulunmuyor.</strong>
                            <p>Hızlı Kontrol bölümünden bu sınıf için yeni bir kontrol oturumu başlatabilirsiniz.</p>
                          </div>
                        ) : (
                          <>
                            {/* 4 Ana Metrik Kartları */}
                            <div className="reports-metrics-grid" role="region" aria-label="Sınıf genel kontrol türleri ortalamaları">
                              {ALL_CHECK_TYPES.map((type) => {
                                const metric = generalReport.typeMetrics[type];
                                const score = metric.score;
                                const title = type === "Ödev" ? "Ödev Yapma" : `${type} Getirme`;

                                return (
                                  <div key={type} className="reports-metric-card">
                                    <span className="metric-card-title">{title}</span>
                                    <div
                                      className="metric-card-score"
                                      aria-label={score !== null ? `${title}: %${score}` : `${title}: Veri yok`}
                                    >
                                      {score !== null ? `%${score}` : "—"}
                                    </div>
                                    <div className="metric-card-sub">
                                      {metric.evaluatedCount > 0 ? (
                                        <span>{metric.evaluatedCount} değerlendirme</span>
                                      ) : (
                                        <span className="metric-no-data">Veri yok</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 4 Metrik Başarı Çubuğu Grafiği (RAPOR-10) */}
                            <ReportBarChart typeMetrics={generalReport.typeMetrics} />

                            {/* Kontrollerde Gelmedi ve Veri Kapsamı */}
                            <div className="reports-aux-grid">
                              <div className="reports-aux-card absence-card">
                                <span className="aux-card-kicker">KONTROLLERDE GELMEDİ</span>
                                <div className="aux-card-main">
                                  <strong className="aux-card-value">
                                    {generalReport.totalObservedAbsenceCount} kayıt
                                  </strong>
                                </div>
                                <p className="aux-card-explanation">
                                  Yalnız ders içi kontrollerde &ldquo;Gelmedi&rdquo; olarak işaretlenen kayıtların toplamını gösterir.
                                </p>
                              </div>

                              <div className="reports-aux-card sufficiency-card">
                                <span className="aux-card-kicker">VERİ KAPSAMI</span>
                                <div className="aux-card-main">
                                  <strong className="aux-card-value">
                                    {generalReport.dataCoverage.studentsWithSufficientData} yeterli / {generalReport.dataCoverage.studentsWithInsufficientData} yetersiz
                                  </strong>
                                </div>
                                <p className="aux-card-explanation">
                                  {generalReport.dataCoverage.studentsWithSufficientData} öğrencide yeterli veri, {generalReport.dataCoverage.studentsWithInsufficientData} öğrencide yetersiz veri.
                                </p>
                              </div>
                            </div>

                            {/* Haftalık Sınıf Trend Verisi */}
                            <div className="general-trend-section">
                              <div className="trend-section-header">
                                <h5>Haftalık Sınıf Trendi</h5>
                                <span className="section-count">{generalReport.weeklyTrend.length} Hafta</span>
                              </div>

                              {/* Haftalık Trend Çizgi Grafiği (RAPOR-10) */}
                              <ReportLineChart weeklyTrend={generalReport.weeklyTrend} />

                              {generalReport.weeklyTrend.length === 0 ? (
                                <p className="reports-empty-note">Bu dönem aralığında haftalık trend verisi bulunamadı.</p>
                              ) : (
                                <div className="general-trend-list">
                                  {generalReport.weeklyTrend.map((trend) => {
                                    const weekPlan = planWeeks.find((w) => w.startDate === trend.weekStart);
                                    const weekTitle = weekPlan
                                      ? `${weekPlan.number}. Hafta (${formatWeekDateRange(weekPlan.startDate, weekPlan.endDate)})`
                                      : `${trend.weekStart} Haftası`;

                                    return (
                                      <div key={trend.weekStart} className="general-trend-row">
                                        <div className="trend-row-header">
                                          <strong className="trend-week-title">{weekTitle}</strong>
                                          <div className="trend-row-meta">
                                            <span className="trend-session-count">{trend.sessionCount} kontrol</span>
                                            {trend.observedAbsenceCount > 0 && (
                                              <span className="trend-absence-badge">Gelmedi: {trend.observedAbsenceCount}</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="trend-type-scores">
                                          {ALL_CHECK_TYPES.map((type) => {
                                            const sc = trend.typeScores[type];
                                            return (
                                              <div key={type} className={`trend-score-item ${sc === null ? "empty" : ""}`}>
                                                <span className="trend-score-label">{type}</span>
                                                <strong
                                                  className="trend-score-value"
                                                  aria-label={sc !== null ? `${type}: %${sc}` : `${type}: Veri yok`}
                                                >
                                                  {sc !== null ? `%${sc}` : "—"}
                                                </strong>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Genel Değerlendirme ve Öneriler (RAPOR-11) */}
                            {classGeneralRecommendations && (
                              <RecommendationsSection
                                title="Genel Değerlendirme ve Öneriler"
                                subtitle="Sınıf düzeyinde gözlenen hazırlık ve kontrol kayıtlarına dayalı öneriler."
                                summary={classGeneralRecommendations.summary}
                                recommendations={classGeneralRecommendations.recommendations}
                              />
                            )}
                          </>
                        )}

                        {/* Sınıf Genel Öğretmen Değerlendirmesi (RAPOR-12, teacher-authored, class_general only) */}
                        {classGeneralEvaluationIdentity && (
                          <TeacherEvaluationEditor
                            key={buildTeacherEvaluationId(classGeneralEvaluationIdentity)}
                            identity={classGeneralEvaluationIdentity}
                            persisted={classGeneralEvaluation}
                            rangeLabel={rangeDisplayLabel}
                            scopeDescription="Yalnız bu sınıf ve seçili dönem için saklanan sınıf geneli değerlendirme. Otomatik önerilerden ayrıdır; öğrenci değerlendirmeleri burada görünmez."
                            onSave={handleEvaluationSave}
                            onDelete={handleEvaluationDelete}
                            onDirtyChange={reportEvalDirtyChange}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. Öğrenci Karşılaştırması Bölümü */}
                  {comparisonReport && (
                    <div className="reports-comparison-section">
                      <div className="section-subheading">
                        <div>
                          <h3>Öğrenci Karşılaştırması</h3>
                          <p className="section-subdesc">Seçili dönemde öğrencilerin kontrol kayıtlarını karşılaştırın.</p>
                        </div>
                        <span className="section-count">{comparisonReport.rows.length} Öğrenci</span>
                      </div>

                      <div className="report-print-action no-print">
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={handlePrintComparison}
                          disabled={!comparisonReport || comparisonReport.rows.length === 0}
                          aria-label="Sınıf karşılaştırma raporunu yazdır"
                        >
                          Yazdır / PDF
                        </button>
                        <p className="report-print-hint">Yazdırma ekranından PDF olarak kaydedebilirsiniz.</p>
                        {printNotice && (
                          <p className="report-print-notice" role="status">
                            {printNotice}
                          </p>
                        )}
                      </div>

                      {comparisonReport.rows.length === 0 ? (
                        <div className="reports-empty-prompt" role="status">
                          <p>Bu sınıfta karşılaştırılabilecek öğrenci bulunmuyor.</p>
                        </div>
                      ) : (
                        <div
                          className="reports-table-scroll"
                          role="region"
                          aria-label="Sınıf öğrenci karşılaştırma tablosu"
                        >
                          <table className="reports-comparison-table">
                            <thead>
                              <tr>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "name" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("name")}
                                  >
                                    <span>Öğrenci</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "name" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "number" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("number")}
                                  >
                                    <span>No</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "number" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "Ödev" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("Ödev")}
                                  >
                                    <span>Ödev</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "Ödev" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "Defter" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("Defter")}
                                  >
                                    <span>Defter</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "Defter" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "Kitap" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("Kitap")}
                                  >
                                    <span>Kitap</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "Kitap" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "Materyal" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("Materyal")}
                                  >
                                    <span>Materyal</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "Materyal" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th
                                  scope="col"
                                  aria-sort={compSortField === "suggestedScore" ? (compSortDir === "asc" ? "ascending" : "descending") : "none"}
                                >
                                  <button
                                    type="button"
                                    className="table-sort-btn"
                                    onClick={() => handleCompSort("suggestedScore")}
                                  >
                                    <span>Öneri Notu</span>
                                    <span className="sort-icon" aria-hidden="true">
                                      {compSortField === "suggestedScore" ? (compSortDir === "asc" ? "▲" : "▼") : "↕"}
                                    </span>
                                  </button>
                                </th>
                                <th scope="col">
                                  <span>Veri Durumu</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedComparisonRows.map((row) => (
                                <tr key={row.studentId} className={row.active ? "" : "row-archived"}>
                                  <td className="cell-student-name">
                                    <strong>{row.studentName}</strong>
                                    {row.active === false && (
                                      <span className="comparison-archived-tag">Arşivlenmiş</span>
                                    )}
                                  </td>
                                  <td className="cell-student-number">{row.studentNumber}</td>
                                  <td
                                    className="cell-score"
                                    aria-label={row.typeScores["Ödev"] !== null ? `Ödev: %${row.typeScores["Ödev"]}` : "Ödev: Veri yok"}
                                  >
                                    {row.typeScores["Ödev"] !== null ? `%${row.typeScores["Ödev"]}` : "—"}
                                  </td>
                                  <td
                                    className="cell-score"
                                    aria-label={row.typeScores["Defter"] !== null ? `Defter: %${row.typeScores["Defter"]}` : "Defter: Veri yok"}
                                  >
                                    {row.typeScores["Defter"] !== null ? `%${row.typeScores["Defter"]}` : "—"}
                                  </td>
                                  <td
                                    className="cell-score"
                                    aria-label={row.typeScores["Kitap"] !== null ? `Kitap: %${row.typeScores["Kitap"]}` : "Kitap: Veri yok"}
                                  >
                                    {row.typeScores["Kitap"] !== null ? `%${row.typeScores["Kitap"]}` : "—"}
                                  </td>
                                  <td
                                    className="cell-score"
                                    aria-label={row.typeScores["Materyal"] !== null ? `Materyal: %${row.typeScores["Materyal"]}` : "Materyal: Veri yok"}
                                  >
                                    {row.typeScores["Materyal"] !== null ? `%${row.typeScores["Materyal"]}` : "—"}
                                  </td>
                                  <td
                                    className="cell-score cell-suggested"
                                    aria-label={row.suggestedParticipationScore !== null ? `Öneri Notu: ${row.suggestedParticipationScore}` : "Öneri Notu: Veri yok"}
                                  >
                                    <strong>{row.suggestedParticipationScore !== null ? row.suggestedParticipationScore : "—"}</strong>
                                  </td>
                                  <td className="cell-status">
                                    <span className={`status-pill status-${row.coverageStatus}`}>
                                      {COVERAGE_STATUS_LABELS[row.coverageStatus]}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="reports-empty-prompt" role="status">
                  <p>Raporu görüntülemek için bir sınıf seçin.</p>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: ÖĞRENCİLER */}
          {activeTab === "students" && (
            <section
              id="panel-students"
              role="tabpanel"
              aria-labelledby="tab-students"
              className="reports-tab-panel"
            >
              <div className="reports-dual-selector">
                <label htmlFor="student-report-class-select">
                  <span>1. SINIF</span>
                  <select
                    id="student-report-class-select"
                    value={selectedClassId}
                    onChange={(e) => handleClassChange(e.target.value)}
                  >
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {classes
                      .filter((c) => c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} [Arşiv]
                        </option>
                      ))}
                  </select>
                </label>

                <label htmlFor="student-report-student-select">
                  <span>2. ÖĞRENCİ</span>
                  <select
                    id="student-report-student-select"
                    value={selectedStudentId}
                    onChange={(e) => handleStudentChange(e.target.value)}
                  >
                    <option value="">Öğrenci seçin...</option>
                    {selectedClass?.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {String(s.number).padStart(2, "0")} — {s.name}
                        {s.active === false ? " (Pasif)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!selectedClass ? (
                <div className="reports-empty-prompt" role="status">
                  <p>Öğrenci raporu için önce bir sınıf seçin.</p>
                </div>
              ) : !selectedStudent ? (
                <div className="reports-empty-prompt" role="status">
                  <p>Raporu görüntülemek için bir öğrenci seçin.</p>
                </div>
              ) : (
                <div className="reports-student-card">
                  <div className="reports-student-header">
                    <div>
                      <p className="kicker">ÖĞRENCİ RAPORU</p>
                      <h2>{selectedStudent.name}</h2>
                      <p className="reports-student-submeta">
                        {selectedClass.name} · No: {selectedStudent.number}
                        {selectedStudent.active === false && (
                          <span className="reports-archived-badge">Arşivlenmiş öğrenci</span>
                        )}
                      </p>
                    </div>
                    <span className="reports-range-tag">{rangeDisplayLabel}</span>
                  </div>

                  <div className="report-print-action no-print">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={handlePrintStudent}
                      disabled={!studentReport || (studentReport.totalValidCheckCount === 0 && studentReport.totalAbsentCount === 0)}
                      aria-label="Öğrenci raporunu yazdır"
                    >
                      Yazdır / PDF
                    </button>
                    <p className="report-print-hint">Yazdırma ekranından PDF olarak kaydedebilirsiniz.</p>
                    {printNotice && (
                      <p className="report-print-notice" role="status">
                        {printNotice}
                      </p>
                    )}
                  </div>

                  {/* Eğer seçili aralıkta öğrenciye ait hiç kontrol kaydı yoksa */}
                  {studentReport && studentReport.totalValidCheckCount === 0 && studentReport.totalAbsentCount === 0 ? (
                    <div className="reports-empty-range" role="status">
                      <strong>Seçilen dönemde bu öğrenci için henüz kontrol kaydı bulunmuyor.</strong>
                      <p>Hızlı Kontrol bölümünden bu öğrenciyi içeren yeni bir kontrol oturumu kaydedebilirsiniz.</p>
                    </div>
                  ) : studentReport ? (
                    <>
                      {/* 1. Derse Katılım Öneri Notu Kartı */}
                      <div className="reports-participation-card" role="region" aria-label="Derse Katılım Öneri Notu">
                        <span className="participation-card-kicker">DERSE KATILIM ÖNERİ NOTU</span>
                        <div className="participation-card-main">
                          {studentReport.suggestedParticipationScore !== null ? (
                            <div className="participation-score-wrap">
                              <strong className="participation-score-value">
                                {studentReport.suggestedParticipationScore}
                              </strong>
                              <span className="participation-score-denom">/ 100</span>
                            </div>
                          ) : (
                            <div className="participation-score-wrap null-state">
                              <strong className="participation-score-value">—</strong>
                            </div>
                          )}
                        </div>

                        {studentReport.suggestedParticipationScore !== null ? (
                          <div className="participation-explanations">
                            <p className="participation-desc">{PARTICIPATION_COPY.DESCRIPTION}</p>
                            <p className="participation-disclaimer">{PARTICIPATION_COPY.DISCLAIMER}</p>
                          </div>
                        ) : (
                          <div className="participation-insufficient-box">
                            <p className="participation-coverage-note">
                              {studentReport.dataSufficiency.coverageNote}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 2. Dört Ana Öğrenci Metriği */}
                      <div className="reports-metrics-grid" role="region" aria-label="Öğrenci kontrol türleri ortalamaları">
                        {ALL_CHECK_TYPES.map((type) => {
                          const breakdown = studentReport.breakdowns[type];
                          const score = breakdown?.score !== null && breakdown?.score !== undefined
                            ? roundScore(breakdown.score, 0)
                            : null;
                          const evaluatedCount = breakdown?.evaluatedCount ?? 0;
                          const title = type === "Ödev" ? "Ödev Yapma" : `${type} Getirme`;

                          return (
                            <div key={type} className="reports-metric-card">
                              <span className="metric-card-title">{title}</span>
                              <div
                                className="metric-card-score"
                                aria-label={score !== null ? `${title}: %${score}` : `${title}: Veri yok`}
                              >
                                {score !== null ? `%${score}` : "—"}
                              </div>
                              <div className="metric-card-sub">
                                {evaluatedCount > 0 ? (
                                  <span>{evaluatedCount} değerlendirme</span>
                                ) : (
                                  <span className="metric-no-data">Veri yok</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 3. Kontrollerde Gelmedi Kartı */}
                      <div className="reports-aux-card absence-card student-absence">
                        <span className="aux-card-kicker">KONTROLLERDE GELMEDİ</span>
                        <div className="aux-card-main">
                          <strong className="aux-card-value">
                            {studentReport.observedAbsenceCount} kayıt
                          </strong>
                        </div>
                        <p className="aux-card-explanation">
                          Yalnız ders içi kontrollerde &ldquo;Gelmedi&rdquo; olarak işaretlenen kayıtları gösterir.
                        </p>
                      </div>

                      {/* 4. Değerlendirme ve Öneriler (RAPOR-11) */}
                      {studentRecommendations && (
                        <RecommendationsSection
                          title="Değerlendirme ve Öneriler"
                          subtitle="Öğrencinin kontrol kayıtlarına dayalı çalışma ve hazırlık önerileri."
                          summary={studentRecommendations.summary}
                          recommendations={studentRecommendations.recommendations}
                        />
                      )}

                      {/* 4b. Öğretmen Değerlendirmesi (RAPOR-12, teacher-authored) */}
                      {studentEvaluationIdentity && (
                        <TeacherEvaluationEditor
                          key={buildTeacherEvaluationId(studentEvaluationIdentity)}
                          identity={studentEvaluationIdentity}
                          persisted={studentEvaluation}
                          rangeLabel={rangeDisplayLabel}
                          scopeDescription="Yalnız bu öğrenci ve seçili dönem için saklanır. Otomatik önerilerden ayrıdır."
                          onSave={handleEvaluationSave}
                          onDelete={handleEvaluationDelete}
                          onDirtyChange={reportEvalDirtyChange}
                        />
                      )}

                      {/* 5. Haftalık Kontrol Geçmişi */}
                      <div className="reports-weekly-section">
                        <div className="section-subheading">
                          <h3>Haftalık Kontrol Geçmişi</h3>
                          <span className="section-count">{studentReport.weeklyHistory.length} Hafta</span>
                        </div>

                        {studentReport.weeklyHistory.length === 0 ? (
                          <p className="reports-empty-note">Bu dönem aralığında kayıtlı kontrol bulunamadı.</p>
                        ) : (
                          <div className="weekly-summary-list">
                            {studentReport.weeklyHistory.map((week) => {
                              const weekPlan = planWeeks.find((w) => w.startDate === week.weekStart);
                              const weekTitle = weekPlan
                                ? `${weekPlan.number}. Hafta · ${formatWeekDateRange(weekPlan.startDate, weekPlan.endDate)}`
                                : `${week.weekStart} Haftası`;

                              return (
                                <div key={week.weekStart} className="student-weekly-card">
                                  <div className="weekly-card-header">
                                    <strong className="weekly-card-title">{weekTitle}</strong>
                                    {week.observedAbsenceCount > 0 && (
                                      <span className="weekly-type-pill absence-pill">
                                        <small>Gelmedi:</small>
                                        <strong>{week.observedAbsenceCount}</strong>
                                      </span>
                                    )}
                                  </div>

                                  <div className="student-visits-container">
                                    {week.visits.map((v, vIdx) => {
                                      const visitLabel = v.visitIndex !== undefined
                                        ? `${v.visitIndex}. Giriş`
                                        : "Giriş bilgisi yok";

                                      return (
                                        <div key={vIdx} className="student-visit-block">
                                          <span className="student-visit-label">{visitLabel}</span>
                                          <div className="student-checks-list">
                                            {v.checks.map((chk, cIdx) => {
                                              const pres = getStatusPresentation(chk.type, chk.status);
                                              return (
                                                <div key={cIdx} className={`student-check-row status-${chk.status}`}>
                                                  <span className="check-type-name">{chk.type}</span>
                                                  <span className={`check-status-badge status-${chk.status}`}>
                                                    <span className="status-symbol">{pres.label}</span>
                                                    <span className="status-title">{pres.title}</span>
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </section>
          )}

          {/* TAB 4: KAYITLAR */}
          {activeTab === "sessions" && (
            <section
              id="panel-sessions"
              role="tabpanel"
              aria-labelledby="tab-sessions"
              className="reports-tab-panel"
            >
              <div className="reports-selector-row">
                <label htmlFor="sessions-class-filter">
                  <span>SINIF FİLTRESİ</span>
                  <select
                    id="sessions-class-filter"
                    value={selectedClassId}
                    onChange={(e) => handleClassChange(e.target.value)}
                  >
                    <option value="">Tüm Sınıflar</option>
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="reports-sessions-list">
                <div className="reports-sessions-heading">
                  <p className="kicker">KONTROL OTURUMLARI GEÇMİŞİ</p>
                  <span>{classSessions.length} Kayıt</span>
                </div>

                {!classSessions.length ? (
                  <div className="empty-state" role="status">
                    <strong>Bu aralıkta kaydedilmiş kontrol bulunmuyor.</strong>
                    <p>Hızlı Kontrol sekmesinden yeni kontrol oturumları gerçekleştirebilirsiniz.</p>
                  </div>
                ) : (
                  <div className="session-records-table">
                    {classSessions.slice(0, 50).map((sess) => (
                      <div className="session-record-row" key={sess.id}>
                        <div className="session-record-main">
                          <strong>{sess.className} · {sess.type}</strong>
                          <span className="session-record-meta">
                            {typeof sess.visitIndex === "number"
                              ? `${sess.visitIndex}. Giriş`
                              : "Eski kayıt"}
                            {sess.weekStart ? ` · ${sess.weekStart} haftası` : ""}
                          </span>
                        </div>
                        <div className="session-record-side">
                          <time dateTime={sess.date}>
                            {new Intl.DateTimeFormat("tr-TR", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(sess.date))}
                          </time>
                          <small>{Object.keys(sess.statuses).length} öğrenci</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {printSnapshot && (
        <div className="report-print-root">
          <ReportPrintJobView job={printSnapshot} />
        </div>
      )}
    </div>
  );
}
