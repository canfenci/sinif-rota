import type { CheckSession, CheckStatus, CheckType, SchoolClass, Student, WorkCalendar } from "./types";
import { resolveSessionWeekStart } from "./session-week";

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
  };
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

    return {
      weekStart,
      sessionCount: weekSessions.length,
      typeBreakdowns,
      observedAbsenceCount,
      visitIndices,
      hasLegacyVisits,
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
