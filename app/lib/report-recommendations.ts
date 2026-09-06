import type { CheckType } from "./types";
import { ALL_CHECK_TYPES } from "./reports";
import type {
  StudentReportCoreDTO,
  ClassGeneralReportDTO,
} from "./reports";

/**
 * Öneri önem / durum seviyesi.
 */
export type RecommendationSeverity =
  | "info"
  | "attention"
  | "positive";

/**
 * Öneri kategorisi.
 */
export type RecommendationCategory =
  | "homework"
  | "notebook"
  | "book"
  | "material"
  | "attendance_observation"
  | "data_coverage"
  | "general";

/**
 * Tek bir açıklanabilir öneri / değerlendirme öğesi.
 */
export interface ReportRecommendation {
  id: string;
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  title: string;
  message: string;
  evidence: string[];
}

/**
 * Bireysel öğrenci öneri ve değerlendirme raporu DTO'su.
 */
export interface StudentRecommendationReport {
  summary: string[];
  recommendations: ReportRecommendation[];
}

/**
 * Sınıf genel öneri ve değerlendirme raporu DTO'su.
 *
 * Gizlilik Sözleşmesi:
 * Bu DTO ve alt nesneleri ASLA studentId, studentName, studentNumber
 * veya herhangi bir bireysel öğrenci kimliği taşımaz.
 */
export interface ClassGeneralRecommendationReport {
  summary: string[];
  recommendations: ReportRecommendation[];
}

/**
 * Değerlendirme ve öneri motoru eşik sabitleri.
 * Bunlar Sınıf Rota ürün kurallarıdır; resmi mevzuat veya MEB standardı iddiası taşımaz.
 */
export const RECOMMENDATION_THRESHOLDS = {
  HIGH_SCORE: 80,
  MEDIUM_SCORE: 60,
  TREND_DELTA: 10,
  MIN_WEEKS_FOR_TREND: 3,
  MAX_RECOMMENDATIONS: 4,
  CLASS_INSUFFICIENT_RATIO_THRESHOLD: 0.5,
} as const;

/**
 * Öncelik / durum seviyelerinin erişilebilir ve nötr etiketleri.
 */
export const RECOMMENDATION_SEVERITY_LABELS: Record<RecommendationSeverity, string> = {
  info: "Bilgilendirme",
  attention: "Odak Alanı",
  positive: "Güçlü Alan",
};

/**
 * Kategorilerin kullanıcı dostu etiketleri.
 */
export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  homework: "Ödev",
  notebook: "Defter",
  book: "Kitap",
  material: "Materyal",
  attendance_observation: "Kontrol Gözlemi",
  data_coverage: "Veri Kapsamı",
  general: "Genel",
};

/**
 * Kontrol türünü öneri kategorisine dönüştürür.
 */
export function checkTypeToCategory(type: CheckType): RecommendationCategory {
  switch (type) {
    case "Ödev":
      return "homework";
    case "Defter":
      return "notebook";
    case "Kitap":
      return "book";
    case "Materyal":
      return "material";
  }
}

/**
 * Bireysel öğrenci raporu için deterministik, kural tabanlı değerlendirme ve çalışma önerileri üretir.
 *
 * Prensipler:
 * - Girdi DTO'su kesinlikle mutate edilmez (saf fonksiyon).
 * - Yeni iş puanı veya resmi devamsızlık yorumu üretmez.
 * - Kişilik, motivasyon, veli veya tanı çıkarımları kesinlikle yasaktır.
 * - Yetersiz veride kesin başarı/başarısızlık yorumu yapılmaz.
 */
export function generateStudentRecommendations(
  studentReport: StudentReportCoreDTO
): StudentRecommendationReport {
  const summary: string[] = [];
  const recommendations: ReportRecommendation[] = [];

  const coverageStatus = studentReport.dataSufficiency.coverageStatus;

  // 1. KURAL: Veri Yetersizliği Durumu
  if (coverageStatus === "insufficient") {
    const insufficientMsg = "Bu dönem için yorum oluşturmak adına daha fazla kontrol verisi gereklidir.";
    summary.push(insufficientMsg);
    recommendations.push({
      id: "student-coverage",
      category: "data_coverage",
      severity: "info",
      title: "Veri Yeterliliği",
      message: insufficientMsg,
      evidence: [
        studentReport.dataSufficiency.coverageNote || "Geçerli kontrol kaydı bulunmuyor",
      ],
    });

    return {
      summary,
      recommendations,
    };
  }

  // 2. KURAL: Ön İzleme (Kısmi Veri) Uyarısı
  if (coverageStatus === "partial_preview") {
    const previewMsg = "Mevcut kayıtlar ilk bir görünüm sunuyor; daha fazla kontrol ile değerlendirme güçlenecektir.";
    summary.push(previewMsg);
    recommendations.push({
      id: "student-coverage",
      category: "data_coverage",
      severity: "info",
      title: "Ön Görünüm",
      message: previewMsg,
      evidence: [
        studentReport.dataSufficiency.coverageNote || "Kayıt sayısı henüz öneri notu eşiklerini karşılamıyor",
      ],
    });
  }

  // 3. KURAL: Kontrollerde Gelmedi Gözlemi
  if (studentReport.observedAbsenceCount > 0) {
    const absenceMsg = "Kontrollerde 'Gelmedi' olarak işaretlenen kayıtlar bulunmaktadır. İlgili haftaların ders materyallerinin gözden geçirilmesi yararlı olabilir.";
    recommendations.push({
      id: "student-absence",
      category: "attendance_observation",
      severity: "info",
      title: "Kontrollerde Gelmedi Kayıtları",
      message: absenceMsg,
      evidence: [
        `Kontrollerde Gelmedi: ${studentReport.observedAbsenceCount} kayıt`,
      ],
    });
  }

  // 4. KURAL: Kontrol Türleri Değerlendirmesi
  // Yalnız değerlendirilmiş (skoru non-null) türleri puanına göre küçükten büyüğe sırala
  const evaluatedTypes = ALL_CHECK_TYPES
    .filter((type) => {
      const breakdown = studentReport.breakdowns[type];
      return breakdown && breakdown.score !== null && breakdown.evaluatedCount > 0;
    })
    .map((type) => {
      const breakdown = studentReport.breakdowns[type];
      return {
        type,
        score: breakdown.score as number,
        evaluatedCount: breakdown.evaluatedCount,
      };
    })
    .sort((a, b) => a.score - b.score);

  // Odak alanı gerekenler (< 80)
  const attentionTypes = evaluatedTypes.filter(
    (item) => item.score < RECOMMENDATION_THRESHOLDS.HIGH_SCORE
  );

  // Güçlü alanlar (>= 80)
  const strongTypes = evaluatedTypes.filter(
    (item) => item.score >= RECOMMENDATION_THRESHOLDS.HIGH_SCORE
  );

  // Odak alanı önerilerini öncelik sırasına göre ekle (en fazla 2 adet odak alanı)
  for (const item of attentionTypes.slice(0, 2)) {
    const category = checkTypeToCategory(item.type);
    let title = "";
    let message = "";

    if (item.type === "Ödev") {
      title = "Ödev Tamamlama";
      if (item.score < RECOMMENDATION_THRESHOLDS.MEDIUM_SCORE) {
        message = "Ödevleri küçük parçalara bölerek ve kısa günlük tekrarlarla tamamlamak yararlı olabilir.";
      } else {
        message = "Ödev tamamlama düzenini daha istikrarlı hâle getirmek yararlı olabilir.";
      }
    } else if (item.type === "Defter") {
      title = "Defter Hazırlığı";
      message = "Ders öncesi çanta kontrolü veya sabit hazırlık listesi kullanmak yararlı olabilir.";
    } else if (item.type === "Kitap") {
      title = "Ders Kitabı Hazırlığı";
      message = "Ders kitabını hazırlama rutini oluşturmak yararlı olabilir.";
    } else if (item.type === "Materyal") {
      title = "Ders Materyali Hazırlığı";
      message = "Ders materyalleri için ders öncesi kısa kontrol listesi kullanmak yararlı olabilir.";
    }

    recommendations.push({
      id: `student-${category}`,
      category,
      severity: "attention",
      title,
      message,
      evidence: [
        `${item.type} puanı: %${item.score}`,
        `${item.evaluatedCount} değerlendirme`,
      ],
    });
  }

  // 5. KURAL: Olumlu Pekiştirme (Positive Reinforcement)
  // En fazla 1 adet olumlu mesaj ekle
  if (strongTypes.length > 0) {
    // En yüksek puanlı güçlü türü seç
    const bestType = strongTypes[strongTypes.length - 1];
    const category = checkTypeToCategory(bestType.type);
    let title = "";
    let message = "";

    if (bestType.type === "Ödev") {
      title = "Ödev Düzeni";
      message = "Ödev tamamlama kayıtları düzenli görünüyor; bu çalışma alışkanlığını sürdürmek yararlı olacaktır.";
    } else if (bestType.type === "Defter") {
      title = "Defter Hazırlığı";
      message = "Defter getirme kayıtları düzenli görünüyor; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    } else if (bestType.type === "Kitap") {
      title = "Ders Kitabı Hazırlığı";
      message = "Ders kitabı getirme kayıtları düzenli görünüyor; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    } else if (bestType.type === "Materyal") {
      title = "Ders Materyali Hazırlığı";
      message = "Ders materyali getirme kayıtları düzenli görünüyor; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    }

    recommendations.push({
      id: `student-positive-${category}`,
      category,
      severity: "positive",
      title,
      message,
      evidence: [
        `${bestType.type} puanı: %${bestType.score}`,
        `${bestType.evaluatedCount} değerlendirme`,
      ],
    });
  }

  // 6. KURAL: Haftalık Trend (Tür bazında, en az 3 geçerli hafta)
  // Sentetik genel haftalık ortalama ASLA üretilmez.
  // Yalnızca mevcut authoritative type score üzerinden incelenir.
  for (const type of ALL_CHECK_TYPES) {
    if (recommendations.length >= RECOMMENDATION_THRESHOLDS.MAX_RECOMMENDATIONS) {
      break;
    }

    const validWeeksForType: { weekStart: string; score: number }[] = [];
    for (const week of studentReport.weeklyHistory) {
      const tb = week.typeBreakdowns[type];
      if (tb && tb.score !== null && tb.evaluatedCount > 0) {
        validWeeksForType.push({
          weekStart: week.weekStart,
          score: tb.score,
        });
      }
    }

    if (validWeeksForType.length >= RECOMMENDATION_THRESHOLDS.MIN_WEEKS_FOR_TREND) {
      const firstWeek = validWeeksForType[0];
      const lastWeek = validWeeksForType[validWeeksForType.length - 1];
      const diff = lastWeek.score - firstWeek.score;

      if (diff >= RECOMMENDATION_THRESHOLDS.TREND_DELTA) {
        const trendMsg = `${type} kayıtları son haftalarda önceki haftalara göre daha yüksek bir düzey gösteriyor.`;
        summary.push(trendMsg);
        recommendations.push({
          id: `student-trend-${checkTypeToCategory(type)}`,
          category: checkTypeToCategory(type),
          severity: "info",
          title: `${type} Haftalık Değişim`,
          message: trendMsg,
          evidence: [
            `${type} — ilk geçerli hafta: %${firstWeek.score}`,
            `${type} — son geçerli hafta: %${lastWeek.score}`,
          ],
        });
        break;
      } else if (diff <= -RECOMMENDATION_THRESHOLDS.TREND_DELTA) {
        const trendMsg = `${type} kayıtları son haftalarda önceki haftalara göre daha düşük bir düzey gösteriyor.`;
        summary.push(trendMsg);
        recommendations.push({
          id: `student-trend-${checkTypeToCategory(type)}`,
          category: checkTypeToCategory(type),
          severity: "info",
          title: `${type} Haftalık Değişim`,
          message: trendMsg,
          evidence: [
            `${type} — ilk geçerli hafta: %${firstWeek.score}`,
            `${type} — son geçerli hafta: %${lastWeek.score}`,
          ],
        });
        break;
      }
    }
  }

  // Summary oluştur
  if (coverageStatus === "sufficient") {
    summary.push(
      `Dönem boyunca toplam ${studentReport.totalValidCheckCount} geçerli kontrol değerlendirilmiştir.`
    );
    if (strongTypes.length > 0) {
      summary.push("Güçlü görülen alanlardaki hazırlık ve çalışma rutinlerinin korunması önerilir.");
    }
    if (attentionTypes.length > 0) {
      summary.push("Düzenliliği artırmaya yönelik çalışma teknikleri önerilmektedir.");
    }
  }

  // Maksimum öneri sayısını ve benzersizliği garanti et
  const uniqueRecommendations: ReportRecommendation[] = [];
  const seenIds = new Set<string>();

  for (const rec of recommendations) {
    if (!seenIds.has(rec.id)) {
      seenIds.add(rec.id);
      uniqueRecommendations.push(rec);
    }
    if (uniqueRecommendations.length >= RECOMMENDATION_THRESHOLDS.MAX_RECOMMENDATIONS) {
      break;
    }
  }

  return {
    summary,
    recommendations: uniqueRecommendations,
  };
}

/**
 * Sınıf genel raporu için deterministik, kural tabanlı değerlendirme ve çalışma önerileri üretir.
 *
 * Gizlilik Sözleşmesi:
 * - Kesinlikle öğrenci kimliği (isim, numara, studentId) içermez.
 * - Sınıf başarı puanı veya genel katılım notu üretmez.
 * - Girdi DTO'sunu mutate etmez.
 */
export function generateClassGeneralRecommendations(
  generalReport: ClassGeneralReportDTO
): ClassGeneralRecommendationReport {
  const summary: string[] = [];
  const recommendations: ReportRecommendation[] = [];

  // Kontrol oturumu yoksa nötr çıkış
  if (generalReport.totalControlSessionCount === 0) {
    summary.push("Seçilen dönemde bu sınıf için henüz kontrol kaydı bulunmuyor.");
    return {
      summary,
      recommendations,
    };
  }

  // 1. KURAL: Veri Kapsamı / Yetersizlik Uyarısı
  const activeCount = generalReport.activeStudentCount;
  const insufficientCount = generalReport.dataCoverage.studentsWithInsufficientData;

  if (
    activeCount > 0 &&
    insufficientCount / activeCount >= RECOMMENDATION_THRESHOLDS.CLASS_INSUFFICIENT_RATIO_THRESHOLD
  ) {
    const coverageMsg = "Mevcut kayıtlar sınıf geneli için sınırlı bir görünüm sunuyor; daha fazla veri ile sınıf genel resmi netleşecektir.";
    summary.push(coverageMsg);
    recommendations.push({
      id: "class-coverage",
      category: "data_coverage",
      severity: "info",
      title: "Veri Kapsamı",
      message: coverageMsg,
      evidence: [
        `Yeterli veri: ${generalReport.dataCoverage.studentsWithSufficientData} öğrenci`,
        `Yetersiz veri: ${insufficientCount} öğrenci`,
      ],
    });
  }

  // 2. KURAL: Kontrollerde Gelmedi Gözlemi
  if (generalReport.totalObservedAbsenceCount > 0) {
    const absenceMsg = "Kontrollerde 'Gelmedi' olarak işaretlenen kayıtlar bulunmaktadır. İlgili haftaların konu ve materyallerinin sınıf genelinde özetlenmesi yararlı olabilir.";
    recommendations.push({
      id: "class-absence",
      category: "attendance_observation",
      severity: "info",
      title: "Kontrollerde Gelmedi Kayıtları",
      message: absenceMsg,
      evidence: [
        `Kontrollerde Gelmedi: ${generalReport.totalObservedAbsenceCount} kayıt`,
      ],
    });
  }

  // 3. KURAL: Sınıf Düzeyi Kontrol Türleri Değerlendirmesi
  const evaluatedMetrics = ALL_CHECK_TYPES
    .filter((type) => {
      const metric = generalReport.typeMetrics[type];
      return metric && metric.score !== null && metric.evaluatedCount > 0;
    })
    .map((type) => {
      const metric = generalReport.typeMetrics[type];
      return {
        type,
        score: metric.score as number,
        evaluatedCount: metric.evaluatedCount,
      };
    })
    .sort((a, b) => a.score - b.score);

  const attentionMetrics = evaluatedMetrics.filter(
    (m) => m.score < RECOMMENDATION_THRESHOLDS.HIGH_SCORE
  );

  const strongMetrics = evaluatedMetrics.filter(
    (m) => m.score >= RECOMMENDATION_THRESHOLDS.HIGH_SCORE
  );

  // Odak alanı önerileri (en fazla 2 adet)
  for (const m of attentionMetrics.slice(0, 2)) {
    const category = checkTypeToCategory(m.type);
    let title = "";
    let message = "";

    if (m.type === "Ödev") {
      title = "Ödev Takibi";
      message = "Sınıf genelinde ödev tamamlama kayıtlarını desteklemek için kısa ve düzenli takip yararlı olabilir.";
    } else if (m.type === "Defter") {
      title = "Defter Hazırlığı";
      message = "Ders öncesi hazırlık rutininin sınıf genelinde hatırlatılması yararlı olabilir.";
    } else if (m.type === "Kitap") {
      title = "Ders Kitabı Hazırlığı";
      message = "Ders kitabı hazırlığının sınıf düzeyinde önceden hatırlatılması yararlı olabilir.";
    } else if (m.type === "Materyal") {
      title = "Ders Materyali Hazırlığı";
      message = "Ders materyalleri için sınıf panosunda veya ortak duyuruda kontrol listesi paylaşılması yararlı olabilir.";
    }

    recommendations.push({
      id: `class-${category}`,
      category,
      severity: "attention",
      title,
      message,
      evidence: [
        `${m.type} sınıf puanı: %${m.score}`,
        `${m.evaluatedCount} değerlendirme`,
      ],
    });
  }

  // 4. KURAL: Sınıf Düzeyi Olumlu Pekiştirme (En fazla 1 adet)
  if (strongMetrics.length > 0) {
    const bestMetric = strongMetrics[strongMetrics.length - 1];
    const category = checkTypeToCategory(bestMetric.type);
    let title = "";
    let message = "";

    if (bestMetric.type === "Ödev") {
      title = "Ödev Düzeni";
      message = "Sınıf genelinde ödev tamamlama kayıtları düzenli bir görünüm sergilemektedir; bu çalışma alışkanlığını sürdürmek yararlı olacaktır.";
    } else if (bestMetric.type === "Defter") {
      title = "Defter Hazırlığı";
      message = "Sınıf genelinde defter getirme hazırlığı düzenli bir görünüm sergilemektedir; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    } else if (bestMetric.type === "Kitap") {
      title = "Ders Kitabı Hazırlığı";
      message = "Sınıf genelinde ders kitabı getirme hazırlığı düzenli bir görünüm sergilemektedir; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    } else if (bestMetric.type === "Materyal") {
      title = "Ders Materyali Hazırlığı";
      message = "Sınıf genelinde ders materyali getirme hazırlığı düzenli bir görünüm sergilemektedir; bu hazırlık rutinini sürdürmek yararlı olacaktır.";
    }

    recommendations.push({
      id: `class-positive-${category}`,
      category,
      severity: "positive",
      title,
      message,
      evidence: [
        `${bestMetric.type} sınıf puanı: %${bestMetric.score}`,
        `${bestMetric.evaluatedCount} değerlendirme`,
      ],
    });
  }

  // 5. KURAL: Sınıf Haftalık Trendi (Tür bazında, en az 3 geçerli hafta)
  // Sentetik genel sınıf haftalık ortalaması ASLA üretilmez.
  // Yalnızca ClassGeneralReportDTO.weeklyTrend içindeki typeScores[type] kullanılır.
  for (const type of ALL_CHECK_TYPES) {
    if (recommendations.length >= RECOMMENDATION_THRESHOLDS.MAX_RECOMMENDATIONS) {
      break;
    }

    const validWeeksForType: { weekStart: string; score: number }[] = [];
    for (const week of generalReport.weeklyTrend) {
      const sc = week.typeScores[type];
      if (sc !== null && sc !== undefined) {
        validWeeksForType.push({
          weekStart: week.weekStart,
          score: sc,
        });
      }
    }

    if (validWeeksForType.length >= RECOMMENDATION_THRESHOLDS.MIN_WEEKS_FOR_TREND) {
      const firstWeek = validWeeksForType[0];
      const lastWeek = validWeeksForType[validWeeksForType.length - 1];
      const diff = lastWeek.score - firstWeek.score;

      if (diff >= RECOMMENDATION_THRESHOLDS.TREND_DELTA) {
        const trendMsg = `${type} kayıtları son haftalarda önceki haftalara göre daha yüksek bir düzey gösteriyor.`;
        summary.push(trendMsg);
        recommendations.push({
          id: `class-trend-${checkTypeToCategory(type)}`,
          category: checkTypeToCategory(type),
          severity: "info",
          title: `${type} Haftalık Değişim`,
          message: trendMsg,
          evidence: [
            `${type} — ilk geçerli hafta: %${firstWeek.score}`,
            `${type} — son geçerli hafta: %${lastWeek.score}`,
          ],
        });
        break;
      } else if (diff <= -RECOMMENDATION_THRESHOLDS.TREND_DELTA) {
        const trendMsg = `${type} kayıtları son haftalarda önceki haftalara göre daha düşük bir düzey gösteriyor.`;
        summary.push(trendMsg);
        recommendations.push({
          id: `class-trend-${checkTypeToCategory(type)}`,
          category: checkTypeToCategory(type),
          severity: "info",
          title: `${type} Haftalık Değişim`,
          message: trendMsg,
          evidence: [
            `${type} — ilk geçerli hafta: %${firstWeek.score}`,
            `${type} — son geçerli hafta: %${lastWeek.score}`,
          ],
        });
        break;
      }
    }
  }

  // Sınıf genel summary oluştur
  summary.push(
    `Sınıf genelinde toplam ${generalReport.totalControlSessionCount} kontrol oturumu değerlendirilmiştir.`
  );
  if (strongMetrics.length > 0) {
    summary.push("Sınıf genelinde güçlü görülen hazırlık alışkanlıklarının korunması önerilir.");
  }
  if (attentionMetrics.length > 0) {
    summary.push("Ders öncesi hazırlık ve takiplerin düzenli hatırlatılması yararlı olacaktır.");
  }

  // Maksimum öneri sayısını ve benzersizliği garanti et
  const uniqueRecommendations: ReportRecommendation[] = [];
  const seenIds = new Set<string>();

  for (const rec of recommendations) {
    if (!seenIds.has(rec.id)) {
      seenIds.add(rec.id);
      uniqueRecommendations.push(rec);
    }
    if (uniqueRecommendations.length >= RECOMMENDATION_THRESHOLDS.MAX_RECOMMENDATIONS) {
      break;
    }
  }

  return {
    summary,
    recommendations: uniqueRecommendations,
  };
}
