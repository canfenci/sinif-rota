import type { CheckSession, CheckStatus, CheckType, SchoolClass, Student, WorkCalendar } from "./types";
import { resolveSessionWeekStart } from "./session-week";
import { buildPlanWeeks, isValidWorkCalendar } from "./planning/calendar";

/**
 * Desteklenen tüm kontrol türlerinin sabit listesi.
 */
export const ALL_CHECK_TYPES: readonly CheckType[] = [
  "Ödev",
  "Defter",
  "Kitap",
  "Materyal",
] as const;

/**
 * Derse Katılım Öneri Notu hesaplamasında kullanılan eşik değerleri.
 * Bunlar Sınıf Rota ürün kurallarıdır; resmi mevzuat veya MEB standardı iddiası taşımaz.
 */
export const PARTICIPATION_THRESHOLDS = {
  MIN_EVALUATED_TYPES_FOR_SCORE: 3,
  MIN_VALID_CHECKS_PER_INCLUDED_TYPE: 2,
  MIN_TOTAL_VALID_CHECKS_FOR_SCORE: 8,
} as const;

export const MIN_EVALUATED_TYPES_FOR_SCORE =
  PARTICIPATION_THRESHOLDS.MIN_EVALUATED_TYPES_FOR_SCORE;
export const MIN_VALID_CHECKS_PER_INCLUDED_TYPE =
  PARTICIPATION_THRESHOLDS.MIN_VALID_CHECKS_PER_INCLUDED_TYPE;
export const MIN_TOTAL_VALID_CHECKS_FOR_SCORE =
  PARTICIPATION_THRESHOLDS.MIN_TOTAL_VALID_CHECKS_FOR_SCORE;

/**
 * Derse Katılım Öneri Notu için canonical başlık ve nötr açıklama metinleri.
 */
export const PARTICIPATION_COPY = {
  TITLE: "Derse Katılım Öneri Notu",
  DESCRIPTION:
    "Derse katılım değerlendirmesi; kayıt altına alınan ödev yapma, defter, kitap ve materyal getirme sıklıklarına göre oluşturulmuştur.",
  DISCLAIMER:
    "Bu puan öğretmenin değerlendirmesine yardımcı olmak amacıyla oluşturulan öneri puandır.",
} as const;

/**
 * Tek bir kontrol türü için durum sayıları ve puan dağılımı.
 */
export interface TypeBreakdown {
  type: CheckType;
  complete: number;
  partial: number;
  missing: number;
  absent: number;
  evaluatedCount: number;
  score: number | null;
}

/**
 * Rapor haftalık aralık filtresi.
 * Filtreleme strictly weekStart (Pazartesi YYYY-MM-DD) üzerinden yapılır.
 */
export interface ReportRange {
  fromWeekStart?: string;
  toWeekStart?: string;
}

/**
 * Veri yeterliliği kapsam durumu:
 * - insufficient: 0 geçerli gözlem, değerlendirme başlatılamaz.
 * - partial_preview: Bir miktar gözlem var ancak öneri notu üretmek için eşikler yetersiz.
 * - sufficient: Tüm eşikler sağlandı, öneri notu güvenle üretilebilir.
 */
export type CoverageStatus =
  | "insufficient"
  | "partial_preview"
  | "sufficient";

/**
 * Derse Katılım Öneri Notu veri yeterliliği modeli.
 */
export interface DataSufficiency {
  sufficientData: boolean;
  coverageStatus: CoverageStatus;
  evaluatedTypeCount: number;
  totalValidCheckCount: number;
  perTypeValidCheckCount: Record<CheckType, number>;
  missingTypes: CheckType[];
  coverageNote: string;
}

/**
 * Tek bir kontrole ait öğrenci durumu.
 */
export interface StudentVisitCheck {
  type: CheckType;
  status: CheckStatus;
  date: string;
}

/**
 * Öğrencinin bir girişteki (ziyaretteki) kontrolleri.
 */
export interface StudentVisitHistory {
  visitIndex?: number;
  checks: StudentVisitCheck[];
}

/**
 * Öğrenci bazında haftalık geçmiş DTO'su.
 */
export interface StudentWeeklyHistory {
  weekStart: string;
  weekNumber?: number;
  visits: StudentVisitHistory[];
  typeBreakdowns: Record<CheckType, TypeBreakdown>;
  observedAbsenceCount: number;
}

/**
 * Bireysel öğrenci için saf çekirdek rapor DTO'su.
 */
export interface StudentReportCoreDTO {
  studentId: string;
  studentNumber: number;
  studentName: string;
  classId: string;
  className: string;
  breakdowns: Record<CheckType, TypeBreakdown>;
  totalValidCheckCount: number;
  totalAbsentCount: number;
  observedAbsenceCount: number;
  typeCoverage: number;
  participationRawAverage: number | null;
  dataSufficiency: DataSufficiency;
  suggestedParticipationScore: number | null;
  weeklyHistory: StudentWeeklyHistory[];
}

/**
 * Tek bir ziyaret (giriş) için oturum türleri ve oturum sayısı özeti.
 */
export interface WeeklyVisitSummary {
  visitIndex?: number;
  sessionTypes: CheckType[];
  sessionCount: number;
}

/**
 * Sınıf bazında haftalık özet DTO'su.
 */
export interface WeeklyClassSummaryDTO {
  weekStart: string;
  sessionCount: number;
  typeBreakdowns: Record<CheckType, TypeBreakdown>;
  observedAbsenceCount: number;
  visitIndices: number[];
  hasLegacyVisits: boolean;
  visitSummaries: WeeklyVisitSummary[];
}

/**
 * Sınıf geneli için saf çekirdek rapor DTO'su.
 */
export interface ClassReportCoreDTO {
  classId: string;
  className: string;
  totalStudents: number;
  activeStudents: number;
  typeAverages: Record<CheckType, TypeBreakdown>;
  totalSessions: number;
  weeklySummaries: WeeklyClassSummaryDTO[];
  studentsWithSufficientData: number;
  studentsWithInsufficientData: number;
}

/**
 * Veri yeterliliği durumlarının kullanıcı dostu ve nötr etiketleri.
 */
export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  sufficient: "Yeterli",
  partial_preview: "Ön İzleme",
  insufficient: "Yetersiz Veri",
};

/**
 * Sınıf karşılaştırma tablosunda tek bir öğrenci satırına ait DTO.
 */
export interface ClassComparisonStudentRow {
  studentId: string;
  studentNumber: number;
  studentName: string;
  active: boolean;
  typeScores: Record<CheckType, number | null>;
  evaluatedCounts: Record<CheckType, number>;
  suggestedParticipationScore: number | null;
  coverageStatus: CoverageStatus;
  sufficientData: boolean;
}

/**
 * Sınıf içi öğrenci karşılaştırma raporu DTO'su.
 */
export interface ClassComparisonReportDTO {
  classId: string;
  className: string;
  range: ReportRange;
  rows: ClassComparisonStudentRow[];
}

export type ComparisonSortField =
  | "name"
  | "number"
  | "Ödev"
  | "Defter"
  | "Kitap"
  | "Materyal"
  | "suggestedScore";

export type SortDirection = "asc" | "desc";


/**
 * Belirli bir durum dizisi için TypeBreakdown hesaplar.
 *
 * Puanlama kuralı:
 * - complete = 100
 * - partial  = 50
 * - missing  = 0
 * - absent   = hesap dışı (score ve evaluatedCount paydasına girmez)
 *
 * evaluatedCount = complete + partial + missing
 * score = evaluatedCount > 0 ? (complete * 100 + partial * 50) / evaluatedCount : null
 */
export function calculateTypeBreakdown(
  statuses: (CheckStatus | undefined | null)[],
  type: CheckType
): TypeBreakdown {
  let complete = 0;
  let partial = 0;
  let missing = 0;
  let absent = 0;

  for (const s of statuses) {
    if (s === "complete") complete++;
    else if (s === "partial") partial++;
    else if (s === "missing") missing++;
    else if (s === "absent") absent++;
  }

  const evaluatedCount = complete + partial + missing;
  const score =
    evaluatedCount > 0 ? (complete * 100 + partial * 50) / evaluatedCount : null;

  return {
    type,
    complete,
    partial,
    missing,
    absent,
    evaluatedCount,
    score,
  };
}

/**
 * Puanı belirtilen ondalık basamağa yuvarlar.
 * Core engine ham decimal döndürürken UI / PDF katmanları bu helper ile sunum yapar.
 */
export function roundScore(score: number | null, decimals = 1): number | null {
  if (score === null || Number.isNaN(score)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(score * factor) / factor;
}

/**
 * Gözlemlenen yokluk oranını hesaplar.
 * Resmi yoklama/devamsızlık terimlerinden kesinlikle kaçınılır.
 */
export function calculateObservedAbsenceRate(
  observedAbsenceCount: number,
  totalObservations: number
): number | null {
  if (totalObservations <= 0) return null;
  return observedAbsenceCount / totalObservations;
}

/**
 * Bir session'ın geçerli weekStart değerini çözer.
 * Varsa session.weekStart, yoksa resolveSessionWeekStart(session.date, calendar) kullanılır.
 */
export function resolveEffectiveWeekStart(
  session: CheckSession,
  calendar?: WorkCalendar
): string {
  return session.weekStart ?? resolveSessionWeekStart(session.date, calendar);
}

/**
 * Bir weekStart'ın belirtilen ReportRange içine düşüp düşmediğini kontrol eder.
 */
export function isWeekInRange(weekStart: string, range?: ReportRange): boolean {
  if (!range) return true;
  if (range.fromWeekStart && weekStart < range.fromWeekStart) return false;
  if (range.toWeekStart && weekStart > range.toWeekStart) return false;
  return true;
}

/**
 * Verilen kontrol türü dağılımlarına göre DataSufficiency hesaplar.
 *
 * Yeterlilik Kriterleri:
 * 1. evaluatedTypeCount >= MIN_EVALUATED_TYPES_FOR_SCORE (en az 3 tür)
 * 2. Hesaba katılan her türde evaluatedCount >= MIN_VALID_CHECKS_PER_INCLUDED_TYPE (en az 2 gözlem)
 * 3. totalValidCheckCount >= MIN_TOTAL_VALID_CHECKS_FOR_SCORE (en az 8 toplam gözlem)
 */
export function calculateDataSufficiency(
  breakdowns: Record<CheckType, TypeBreakdown>
): DataSufficiency {
  const perTypeValidCheckCount = {} as Record<CheckType, number>;
  const missingTypes: CheckType[] = [];

  for (const type of ALL_CHECK_TYPES) {
    const count = breakdowns[type]?.evaluatedCount ?? 0;
    perTypeValidCheckCount[type] = count;
    if (count === 0) {
      missingTypes.push(type);
    }
  }

  const evaluatedTypes = ALL_CHECK_TYPES.filter(
    (t) => perTypeValidCheckCount[t] > 0
  );
  const evaluatedTypeCount = evaluatedTypes.length;

  const totalValidCheckCount = ALL_CHECK_TYPES.reduce(
    (sum, t) => sum + perTypeValidCheckCount[t],
    0
  );

  const hasMinTypes = evaluatedTypeCount >= MIN_EVALUATED_TYPES_FOR_SCORE;
  const allIncludedTypesMeetMin =
    hasMinTypes &&
    evaluatedTypes.every(
      (t) => perTypeValidCheckCount[t] >= MIN_VALID_CHECKS_PER_INCLUDED_TYPE
    );
  const hasMinTotal = totalValidCheckCount >= MIN_TOTAL_VALID_CHECKS_FOR_SCORE;

  const sufficientData = hasMinTypes && allIncludedTypesMeetMin && hasMinTotal;

  let coverageStatus: CoverageStatus;
  let coverageNote: string;

  if (sufficientData) {
    coverageStatus = "sufficient";
    coverageNote = "Değerlendirme için yeterli veri mevcut.";
  } else if (totalValidCheckCount === 0) {
    coverageStatus = "insufficient";
    coverageNote = "Henüz değerlendirme için yeterli kontrol kaydı bulunmuyor.";
  } else {
    coverageStatus = "partial_preview";
    if (!hasMinTypes) {
      coverageNote = "Öneri notu için daha fazla kontrol türünde veri gerekiyor.";
    } else if (!allIncludedTypesMeetMin) {
      coverageNote = "Bazı kontrol türlerinde yeterli sayıda gözlem bulunmuyor.";
    } else {
      coverageNote = "Öneri notu için toplam gözlem sayısı henüz yeterli düzeye ulaşmadı.";
    }
  }

  return {
    sufficientData,
    coverageStatus,
    evaluatedTypeCount,
    totalValidCheckCount,
    perTypeValidCheckCount,
    missingTypes,
    coverageNote,
  };
}

/**
 * Tek bir öğrenci için saf StudentReportCoreDTO hesaplar.
 *
 * Girdi nesneleri kesinlikle mutate edilmez.
 */
export function calculateStudentReportCore(
  student: Student,
  schoolClass: SchoolClass,
  sessions: CheckSession[],
  options?: { range?: ReportRange; calendar?: WorkCalendar }
): StudentReportCoreDTO {
  const matchingSessions = sessions.filter((session) => {
    if (session.classId !== schoolClass.id) return false;
    if (!(student.id in session.statuses)) return false;
    const weekStart = resolveEffectiveWeekStart(session, options?.calendar);
    return isWeekInRange(weekStart, options?.range);
  });

  const breakdowns = {} as Record<CheckType, TypeBreakdown>;

  for (const type of ALL_CHECK_TYPES) {
    const typeSessions = matchingSessions.filter((s) => s.type === type);
    const statuses = typeSessions.map((s) => s.statuses[student.id]);
    breakdowns[type] = calculateTypeBreakdown(statuses, type);
  }

  const totalValidCheckCount = ALL_CHECK_TYPES.reduce(
    (sum, t) => sum + breakdowns[t].evaluatedCount,
    0
  );

  const totalAbsentCount = ALL_CHECK_TYPES.reduce(
    (sum, t) => sum + breakdowns[t].absent,
    0
  );

  const typeCoverage = ALL_CHECK_TYPES.filter(
    (t) => breakdowns[t].evaluatedCount > 0
  ).length;

  const validScores = ALL_CHECK_TYPES
    .map((t) => breakdowns[t].score)
    .filter((s): s is number => s !== null);

  const participationRawAverage =
    validScores.length > 0
      ? validScores.reduce((sum, s) => sum + s, 0) / validScores.length
      : null;

  const dataSufficiency = calculateDataSufficiency(breakdowns);

  const suggestedParticipationScore =
    dataSufficiency.sufficientData && participationRawAverage !== null
      ? Math.round(participationRawAverage)
      : null;

  const weeklyHistory = calculateStudentWeeklyHistory(student, schoolClass, sessions, options);

  return {
    studentId: student.id,
    studentNumber: student.number,
    studentName: student.name,
    classId: schoolClass.id,
    className: schoolClass.name,
    breakdowns,
    totalValidCheckCount,
    totalAbsentCount,
    observedAbsenceCount: totalAbsentCount,
    typeCoverage,
    participationRawAverage,
    dataSufficiency,
    suggestedParticipationScore,
    weeklyHistory,
  };
}

/**
 * Bir öğrenci için haftalık geçmişi hesaplar.
 *
 * Sıralama kuralı:
 * - Öğretmenin veli görüşmesinde ve değerlendirmede güncel durumu önce görmesi için
 *   haftalar YENİDEN ESKİYE (descending / en yeni hafta üstte) sıralanır.
 * - Hafta içinde ziyaretler (visits) ise 1. Giriş, 2. Giriş, ... şeklinde ARTAN (ascending) sırada,
 *   en sonda ise legacy (giriş bilgisi olmayan) ziyaret gösterilir.
 *
 * Girdi nesneleri kesinlikle mutate edilmez.
 */
export function calculateStudentWeeklyHistory(
  student: Student,
  schoolClass: SchoolClass,
  sessions: CheckSession[],
  options?: { range?: ReportRange; calendar?: WorkCalendar }
): StudentWeeklyHistory[] {
  const weekMap = new Map<string, CheckSession[]>();

  for (const session of sessions) {
    if (session.classId !== schoolClass.id) continue;
    if (!(student.id in session.statuses)) continue;
    const weekStart = resolveEffectiveWeekStart(session, options?.calendar);
    if (!isWeekInRange(weekStart, options?.range)) continue;

    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, []);
    }
    weekMap.get(weekStart)!.push(session);
  }

  // En yeni hafta üstte (descending)
  const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => b.localeCompare(a));

  const validCalendar = options?.calendar && isValidWorkCalendar(options.calendar) ? options.calendar : undefined;
  const planWeeks = validCalendar ? buildPlanWeeks(validCalendar) : [];

  return sortedWeeks.map((weekStart) => {
    const weekSessions = weekMap.get(weekStart)!;

    // Hafta için typeBreakdowns
    const typeBreakdowns = {} as Record<CheckType, TypeBreakdown>;
    for (const type of ALL_CHECK_TYPES) {
      const typeSessions = weekSessions.filter((s) => s.type === type);
      const statuses = typeSessions.map((s) => s.statuses[student.id]);
      typeBreakdowns[type] = calculateTypeBreakdown(statuses, type);
    }

    const observedAbsenceCount = ALL_CHECK_TYPES.reduce(
      (sum, t) => sum + typeBreakdowns[t].absent,
      0
    );

    // Hafta numarası (varsa)
    const planWeek = planWeeks.find((w) => w.startDate === weekStart);
    const weekNumber = planWeek?.number;

    // Visit gruplama
    const visitIndices = Array.from(
      new Set(
        weekSessions
          .map((s) => s.visitIndex)
          .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1)
      )
    ).sort((a, b) => a - b);

    const hasLegacyVisits = weekSessions.some((s) => s.visitIndex === undefined);

    const visits: StudentVisitHistory[] = [];

    for (const vIdx of visitIndices) {
      const vSessions = weekSessions.filter((s) => s.visitIndex === vIdx);
      // Oturumları kronolojik (tarihe göre) sırala
      vSessions.sort((a, b) => a.date.localeCompare(b.date));
      const checks: StudentVisitCheck[] = vSessions.map((s) => ({
        type: s.type,
        status: s.statuses[student.id],
        date: s.date,
      }));
      visits.push({
        visitIndex: vIdx,
        checks,
      });
    }

    if (hasLegacyVisits) {
      const legacySessions = weekSessions.filter((s) => s.visitIndex === undefined);
      legacySessions.sort((a, b) => a.date.localeCompare(b.date));
      const checks: StudentVisitCheck[] = legacySessions.map((s) => ({
        type: s.type,
        status: s.statuses[student.id],
        date: s.date,
      }));
      visits.push({
        visitIndex: undefined,
        checks,
      });
    }

    return {
      weekStart,
      weekNumber,
      visits,
      typeBreakdowns,
      observedAbsenceCount,
    };
  });
}

/**
 * Bir sınıf için haftalık özetleri kronolojik sırayla hesaplar.
 *
 * Girdi nesneleri kesinlikle mutate edilmez.
 */
export function calculateWeeklyClassSummaries(
  schoolClass: SchoolClass,
  sessions: CheckSession[],
  options?: { range?: ReportRange; calendar?: WorkCalendar }
): WeeklyClassSummaryDTO[] {
  const classStudentIds = new Set(schoolClass.students.map((s) => s.id));
  const weekMap = new Map<string, CheckSession[]>();

  for (const session of sessions) {
    if (session.classId !== schoolClass.id) continue;
    const weekStart = resolveEffectiveWeekStart(session, options?.calendar);
    if (!isWeekInRange(weekStart, options?.range)) continue;

    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, []);
    }
    weekMap.get(weekStart)!.push(session);
  }

  const sortedWeeks = Array.from(weekMap.keys()).sort();

  return sortedWeeks.map((weekStart) => {
    const weekSessions = weekMap.get(weekStart)!;
    const typeBreakdowns = {} as Record<CheckType, TypeBreakdown>;

    for (const type of ALL_CHECK_TYPES) {
      const typeSessions = weekSessions.filter((s) => s.type === type);
      const typeStatuses: CheckStatus[] = [];
      for (const s of typeSessions) {
        for (const [studentId, status] of Object.entries(s.statuses)) {
          if (classStudentIds.has(studentId)) {
            typeStatuses.push(status);
          }
        }
      }
      typeBreakdowns[type] = calculateTypeBreakdown(typeStatuses, type);
    }

    const observedAbsenceCount = ALL_CHECK_TYPES.reduce(
      (sum, t) => sum + typeBreakdowns[t].absent,
      0
    );

    const visitIndices = Array.from(
      new Set(
        weekSessions
          .map((s) => s.visitIndex)
          .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1)
      )
    ).sort((a, b) => a - b);

    const hasLegacyVisits = weekSessions.some((s) => s.visitIndex === undefined);

    const visitSummaries: WeeklyVisitSummary[] = [];
    for (const vIdx of visitIndices) {
      const vSessions = weekSessions.filter((s) => s.visitIndex === vIdx);
      const sessionTypes: CheckType[] = [];
      for (const s of vSessions) {
        if (!sessionTypes.includes(s.type)) {
          sessionTypes.push(s.type);
        }
      }
      visitSummaries.push({
        visitIndex: vIdx,
        sessionTypes,
        sessionCount: vSessions.length,
      });
    }

    if (hasLegacyVisits) {
      const legacySessions = weekSessions.filter((s) => s.visitIndex === undefined);
      const sessionTypes: CheckType[] = [];
      for (const s of legacySessions) {
        if (!sessionTypes.includes(s.type)) {
          sessionTypes.push(s.type);
        }
      }
      visitSummaries.push({
        visitIndex: undefined,
        sessionTypes,
        sessionCount: legacySessions.length,
      });
    }

    return {
      weekStart,
      sessionCount: weekSessions.length,
      typeBreakdowns,
      observedAbsenceCount,
      visitIndices,
      hasLegacyVisits,
      visitSummaries,
    };
  });
}

/**
 * Bir sınıf için saf ClassReportCoreDTO hesaplar.
 *
 * typeAverages:
 * Sınıfın tüm geçerli gözlemleri (observations) üzerinden hesaplanan aggregate puanlardır.
 * Bu yöntem, farklı gözlem sayılarına sahip öğrencilerin ağırlığını adil biçimde birleştirir.
 *
 * Girdi nesneleri kesinlikle mutate edilmez.
 */
export function calculateClassReportCore(
  schoolClass: SchoolClass,
  sessions: CheckSession[],
  options?: { range?: ReportRange; calendar?: WorkCalendar }
): ClassReportCoreDTO {
  const classStudentIds = new Set(schoolClass.students.map((s) => s.id));
  const matchingSessions = sessions.filter((session) => {
    if (session.classId !== schoolClass.id) return false;
    const weekStart = resolveEffectiveWeekStart(session, options?.calendar);
    return isWeekInRange(weekStart, options?.range);
  });

  const typeAverages = {} as Record<CheckType, TypeBreakdown>;

  for (const type of ALL_CHECK_TYPES) {
    const typeSessions = matchingSessions.filter((s) => s.type === type);
    const typeStatuses: CheckStatus[] = [];
    for (const s of typeSessions) {
      for (const [studentId, status] of Object.entries(s.statuses)) {
        if (classStudentIds.has(studentId)) {
          typeStatuses.push(status);
        }
      }
    }
    typeAverages[type] = calculateTypeBreakdown(typeStatuses, type);
  }

  const weeklySummaries = calculateWeeklyClassSummaries(schoolClass, sessions, options);

  let studentsWithSufficientData = 0;
  let studentsWithInsufficientData = 0;

  for (const student of schoolClass.students) {
    const studentReport = calculateStudentReportCore(student, schoolClass, sessions, options);
    if (studentReport.dataSufficiency.sufficientData) {
      studentsWithSufficientData++;
    } else {
      studentsWithInsufficientData++;
    }
  }

  return {
    classId: schoolClass.id,
    className: schoolClass.name,
    totalStudents: schoolClass.students.length,
    activeStudents: schoolClass.students.filter((s) => s.active !== false).length,
    typeAverages,
    totalSessions: matchingSessions.length,
    weeklySummaries,
    studentsWithSufficientData,
    studentsWithInsufficientData,
  };
}

export type ReportRangePresetType = "current_week" | "last_4_weeks" | "term" | "year";

/**
 * Bir WorkCalendar içerisindeki semantik yarıyıl tatilini (semester break) bulur.
 * Belirli bir akademik yıla hardcode id veya tarih kullanmadan
 * semantik id veya title deseni (semester, yarıyıl, sömestr) üzerinden tespit eder.
 */
export function findSemesterBreak(calendar?: WorkCalendar) {
  if (!calendar?.breaks?.length) return null;
  return (
    calendar.breaks.find((b) => {
      const idLower = (b.id || "").toLowerCase();
      const titleLower = (b.title || "").toLowerCase();
      return (
        idLower.includes("semester") ||
        idLower.includes("yariyil") ||
        titleLower.includes("yarıyıl") ||
        titleLower.includes("sömestr") ||
        titleLower.includes("sömestir")
      );
    }) ?? null
  );
}

/**
 * ReportRangePreset değerini (current_week, last_4_weeks, term, year)
 * takvim ve güncel tarih referansıyla somut bir ReportRange { fromWeekStart, toWeekStart } nesnesine dönüştürür.
 *
 * Deterministik ve saftır.
 */
export function resolveReportRange(
  preset: ReportRangePresetType,
  calendar?: WorkCalendar,
  now = new Date()
): ReportRange {
  const currentWeekStart = resolveSessionWeekStart(now.toISOString(), calendar);

  if (preset === "current_week") {
    return {
      fromWeekStart: currentWeekStart,
      toWeekStart: currentWeekStart,
    };
  }

  const validCalendar = calendar && isValidWorkCalendar(calendar) ? calendar : undefined;
  const planWeeks = validCalendar ? buildPlanWeeks(validCalendar) : [];

  if (preset === "year") {
    if (planWeeks.length > 0) {
      return {
        fromWeekStart: planWeeks[0].startDate,
        toWeekStart: planWeeks[planWeeks.length - 1].startDate,
      };
    }
    const calendarStart = calendar?.startDate ?? "2026-09-14";
    const calendarEnd = calendar?.endDate ?? "2027-06-25";
    return {
      fromWeekStart: resolveSessionWeekStart(calendarStart, calendar),
      toWeekStart: resolveSessionWeekStart(calendarEnd, calendar),
    };
  }

  if (preset === "last_4_weeks") {
    if (planWeeks.length > 0) {
      // 1. currentWeekStart'ın PlanWeek listesindeki indeksini bul
      let currentIndex = planWeeks.findIndex((w) => w.startDate === currentWeekStart);
      if (currentIndex === -1) {
        // Eğer güncel tarih takvimden önceyse ilk hafta, sonrasındaysa son hafta
        if (currentWeekStart < planWeeks[0].startDate) {
          currentIndex = 0;
        } else {
          currentIndex = planWeeks.length - 1;
        }
      }

      // 2. Geriye doğru en fazla 4 mevcut PlanWeek seç
      const startIndex = Math.max(0, currentIndex - 3);
      return {
        fromWeekStart: planWeeks[startIndex].startDate,
        toWeekStart: planWeeks[currentIndex].startDate,
      };
    }

    // Takvim yoksa fallback olarak tek hafta
    return {
      fromWeekStart: currentWeekStart,
      toWeekStart: currentWeekStart,
    };
  }

  if (preset === "term") {
    const semesterBreak = findSemesterBreak(calendar);

    if (planWeeks.length > 0 && semesterBreak) {
      // Yarıyıl tatilinin kapsadığı haftalar: break.startDate <= w.endDate && break.endDate >= w.startDate
      const term1Weeks = planWeeks.filter((w) => w.startDate < semesterBreak.startDate);
      const term2Weeks = planWeeks.filter((w) => w.startDate > semesterBreak.endDate);

      const isTerm1 = currentWeekStart < semesterBreak.startDate;

      if (isTerm1 && term1Weeks.length > 0) {
        return {
          fromWeekStart: term1Weeks[0].startDate,
          toWeekStart: term1Weeks[term1Weeks.length - 1].startDate,
        };
      } else if (!isTerm1 && term2Weeks.length > 0) {
        return {
          fromWeekStart: term2Weeks[0].startDate,
          toWeekStart: term2Weeks[term2Weeks.length - 1].startDate,
        };
      }
    }

    // Fallback if calendar/semester break not found
    if (planWeeks.length > 0) {
      return {
        fromWeekStart: planWeeks[0].startDate,
        toWeekStart: planWeeks[planWeeks.length - 1].startDate,
      };
    }

    return {
      fromWeekStart: currentWeekStart,
      toWeekStart: currentWeekStart,
    };
  }

  return {};
}

/**
 * Seçili sınıf ve aralık için öğretmen içi öğrenci karşılaştırma raporu hesaplar.
 *
 * Hesap kaynakları:
 * Her öğrenci satırı authoritative calculateStudentReportCore(...) fonksiyonundan türetilir.
 * Yeni bağımsız formül yazılmaz; tamamlanma, kısmi, eksik ve gelmedi kuralları doğrudan yeniden kullanılır.
 *
 * Girdi nesneleri kesinlikle mutate edilmez.
 */
export function calculateClassComparisonReport(
  schoolClass: SchoolClass,
  sessions: CheckSession[],
  options?: { range?: ReportRange; calendar?: WorkCalendar }
): ClassComparisonReportDTO {
  let resolvedRange: ReportRange;
  if (options?.range?.fromWeekStart && options?.range?.toWeekStart) {
    resolvedRange = options.range;
  } else if (options?.range?.fromWeekStart || options?.range?.toWeekStart) {
    resolvedRange = {
      fromWeekStart: options.range.fromWeekStart ?? options.range.toWeekStart,
      toWeekStart: options.range.toWeekStart ?? options.range.fromWeekStart,
    };
  } else {
    // Range belirtilmemişse:
    // Varsa mevcut sınıf oturumlarından sınırları çöz, yoksa takvimden veya güncel haftadan çöz
    const sessionWeekStarts = sessions
      .filter((s) => s.classId === schoolClass.id)
      .map((s) => resolveEffectiveWeekStart(s, options?.calendar))
      .sort();

    if (sessionWeekStarts.length > 0) {
      resolvedRange = {
        fromWeekStart: sessionWeekStarts[0],
        toWeekStart: sessionWeekStarts[sessionWeekStarts.length - 1],
      };
    } else if (options?.calendar && isValidWorkCalendar(options.calendar)) {
      const planWeeks = buildPlanWeeks(options.calendar);
      resolvedRange = {
        fromWeekStart: planWeeks[0]?.startDate ?? resolveSessionWeekStart(new Date().toISOString(), options.calendar),
        toWeekStart: planWeeks[planWeeks.length - 1]?.startDate ?? resolveSessionWeekStart(new Date().toISOString(), options.calendar),
      };
    } else {
      const currentWeek = resolveSessionWeekStart(new Date().toISOString(), options?.calendar);
      resolvedRange = {
        fromWeekStart: currentWeek,
        toWeekStart: currentWeek,
      };
    }
  }

  const effectiveOptions = { ...options, range: resolvedRange };

  const rows: ClassComparisonStudentRow[] = schoolClass.students.map((student) => {
    const studentReport = calculateStudentReportCore(student, schoolClass, sessions, effectiveOptions);

    const typeScores = {} as Record<CheckType, number | null>;
    const evaluatedCounts = {} as Record<CheckType, number>;

    for (const type of ALL_CHECK_TYPES) {
      const breakdown = studentReport.breakdowns[type];
      typeScores[type] = breakdown.score !== null ? roundScore(breakdown.score, 0) : null;
      evaluatedCounts[type] = breakdown.evaluatedCount;
    }

    return {
      studentId: student.id,
      studentNumber: student.number,
      studentName: student.name,
      active: student.active !== false,
      typeScores,
      evaluatedCounts,
      suggestedParticipationScore: studentReport.suggestedParticipationScore,
      coverageStatus: studentReport.dataSufficiency.coverageStatus,
      sufficientData: studentReport.dataSufficiency.sufficientData,
    };
  });

  const defaultSortedRows = sortComparisonRowsByDefault(rows);

  return {
    classId: schoolClass.id,
    className: schoolClass.name,
    range: resolvedRange,
    rows: defaultSortedRows,
  };
}

/**
 * Karşılaştırma satırlarını varsayılan düzende sıralar:
 * 1. Aktif öğrenciler önce, arşivlenmiş (inactive) öğrenciler listenin sonunda
 * 2. Öğrenci numarası artan (ascending)
 * 3. Eşit/eksik numara durumunda öğrenci adı alfabetik ('tr')
 */
export function sortComparisonRowsByDefault(
  rows: ClassComparisonStudentRow[]
): ClassComparisonStudentRow[] {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    if (a.studentNumber !== b.studentNumber) {
      return a.studentNumber - b.studentNumber;
    }
    return a.studentName.localeCompare(b.studentName, "tr");
  });
}

/**
 * Karşılaştırma satırlarını belirtilen alana ve yöne göre sıralar.
 *
 * Kural: Null değerler her zaman listenin sonundadır (hem asc hem desc sıralamada).
 * Eşitlik durumunda öğrenci numarası / adı deterministik tie-breaker olarak kullanılır.
 */
export function sortComparisonRows(
  rows: ClassComparisonStudentRow[],
  field: ComparisonSortField,
  direction: SortDirection = "asc"
): ClassComparisonStudentRow[] {
  return [...rows].sort((a, b) => {
    if (field === "name") {
      const comparison = a.studentName.localeCompare(b.studentName, "tr");
      if (comparison !== 0) {
        return direction === "desc" ? -comparison : comparison;
      }
      return a.studentNumber - b.studentNumber;
    }

    if (field === "number") {
      const comparison = a.studentNumber - b.studentNumber;
      if (comparison !== 0) {
        return direction === "desc" ? -comparison : comparison;
      }
      return a.studentName.localeCompare(b.studentName, "tr");
    }

    if (field === "suggestedScore") {
      const valA = a.suggestedParticipationScore;
      const valB = b.suggestedParticipationScore;

      if (valA === null && valB === null) {
        return a.studentNumber - b.studentNumber;
      }
      if (valA === null) return 1;
      if (valB === null) return -1;

      const comparison = valA - valB;
      if (comparison !== 0) {
        return direction === "desc" ? -comparison : comparison;
      }
      return a.studentNumber - b.studentNumber;
    }

    // CheckType: "Ödev" | "Defter" | "Kitap" | "Materyal"
    const valA = a.typeScores[field];
    const valB = b.typeScores[field];

    if (valA === null && valB === null) {
      return a.studentNumber - b.studentNumber;
    }
    if (valA === null) return 1;
    if (valB === null) return -1;

    const comparison = valA - valB;
    if (comparison !== 0) {
      return direction === "desc" ? -comparison : comparison;
    }
    return a.studentNumber - b.studentNumber;
  });
}
