"use client";

import { useMemo, useState } from "react";
import type { CheckSession, SchoolClass, WorkCalendar } from "../lib/types";
import { resolveSessionWeekStart } from "../lib/session-week";
import { buildPlanWeeks, isValidWorkCalendar } from "../lib/planning/calendar";
import { formatWeekDateRange } from "./AnnualPlan";
import {
  ALL_CHECK_TYPES,
  calculateClassReportCore,
  findSemesterBreak,
  resolveReportRange,
  roundScore,
  type ClassReportCoreDTO,
} from "../lib/reports";

export type ReportTab = "general" | "classes" | "students" | "sessions";
export type ReportRangePreset = "current_week" | "last_4_weeks" | "term" | "year";

export interface ReportsViewProps {
  classes: SchoolClass[];
  sessions: CheckSession[];
  calendar?: WorkCalendar;
  initialClassId?: string;
  initialStudentId?: string;
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
}: ReportsViewProps) {
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

  // Sınıf değişimi
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    setSelectedStudentId("");
  };

  // Rapor aralık nesnesi (fromWeekStart, toWeekStart)
  const reportRange = useMemo(() => {
    return resolveReportRange(selectedRangePreset, calendar);
  }, [selectedRangePreset, calendar]);

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
          onClick={() => setActiveTab("general")}
        >
          Genel
        </button>
        <button
          role="tab"
          id="tab-classes"
          aria-selected={activeTab === "classes"}
          aria-controls="panel-classes"
          className={`reports-tab-btn ${activeTab === "classes" ? "active" : ""}`}
          onClick={() => setActiveTab("classes")}
        >
          Sınıflar
        </button>
        <button
          role="tab"
          id="tab-students"
          aria-selected={activeTab === "students"}
          aria-controls="panel-students"
          className={`reports-tab-btn ${activeTab === "students" ? "active" : ""}`}
          onClick={() => setActiveTab("students")}
        >
          Öğrenciler
        </button>
        <button
          role="tab"
          id="tab-sessions"
          aria-selected={activeTab === "sessions"}
          aria-controls="panel-sessions"
          className={`reports-tab-btn ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => setActiveTab("sessions")}
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
              onClick={() => setSelectedRangePreset(preset)}
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
                    onChange={(e) => setSelectedStudentId(e.target.value)}
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

              {!selectedStudent ? (
                <div className="reports-select-prompt">
                  <strong>Raporunu görüntülemek istediğiniz öğrenciyi seçin.</strong>
                  <p>Yukarıdaki menüden öğrenci seçerek performans ve kontrol geçmişini inceleyebilirsiniz.</p>
                </div>
              ) : (
                <div className="reports-student-card">
                  <div className="reports-student-header">
                    <div>
                      <p className="kicker">ÖĞRENCİ RAPORU · {selectedClass?.name}</p>
                      <h2>
                        {String(selectedStudent.number).padStart(2, "0")} {selectedStudent.name}
                      </h2>
                    </div>
                    <span className="reports-range-tag">{rangeDisplayLabel}</span>
                  </div>

                  <div className="reports-meta-chips">
                    <span>Durum: {selectedStudent.active !== false ? "Aktif" : "Pasif"}</span>
                    <span>Sınıf: {selectedClass?.name}</span>
                  </div>

                  <div className="reports-placeholder-card inside-student">
                    <h3>Derse Katılım ve Kontrol Analizi</h3>
                    <p className="reports-card-desc">
                      Detaylı öğrenci katılım ve kontrol analizi sonraki aşamada bu alanda yer alacaktır.
                    </p>
                  </div>
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
    </div>
  );
}
