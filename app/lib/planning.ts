import type { AnnualPlanEntry, AppData, WorkCalendar } from "./types";

const DAY = 86_400_000;

function dateOnly(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(value: Date, count: number) { return new Date(value.getTime() + count * DAY); }

export interface PlanWeek {
  number: number;
  startDate: string;
  endDate: string;
  teachingDays: number;
  breakTitles: string[];
}

export interface SciencePlanItem {
  unit: number;
  unitTitle: string;
  title: string;
  hours: number;
  outcomeCode?: string;
  outcomeCodes?: string[];
  badge?: string;
  curriculum: CurriculumOutcome | null;
  curricula?: CurriculumOutcome[];
  allocation: AnnualPlanAllocation;
}

export interface CurriculumOutcome {
  grade: number;
  curriculumVersion: string;
  unitId: string;
  unitTitle: string;
  code: string;
  officialDescription: string | null;
  officialSource: string | null;
  sectionTitle?: string | null;
  topicHours?: number | null;
  outcomeNotes?: string[];
  processComponents: string[];
  contentFramework: string[];
  keyConcepts: string[];
  learningEvidence: string[];
  learningTeachingExperiences: string[];
  differentiation: string[];
  skills: string[];
  values: string[];
  literacySkills: string[];
}

export interface AnnualPlanAllocation {
  schoolYear: string;
  grade: number;
  classId: string | null;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  outcomeCode: string | null;
  outcomeCodes?: string[];
  allocatedHours: number;
  plannedTotalHours: number;
  completedBeforeHours: number;
  completedAfterHours: number;
  source: "auto" | "manual";
  teacherNote: string | null;
  completed: boolean;
}

export interface SciencePlanWeek {
  weekStart: string;
  term: 1 | 2;
  items: SciencePlanItem[];
  totalHours: number;
}

export interface SciencePlan {
  grade: 5 | 6 | 7 | 8;
  schoolYear: "2026-2027";
  weeklyHours: 4;
  curriculumHours: number;
  capacityAdjustmentHours: number;
  totalHours: number;
  firstTermHours: number;
  secondTermHours: number;
  weeks: SciencePlanWeek[];
}

export type Grade5SciencePlanItem = SciencePlanItem;
export type Grade5SciencePlanWeek = SciencePlanWeek;
export type Grade5SciencePlan = SciencePlan & { grade: 5; curriculumHours: 140; capacityAdjustmentHours: 0; totalHours: 140; secondTermHours: 72 };
export type Grade6SciencePlan = SciencePlan & { grade: 6; curriculumHours: 138; capacityAdjustmentHours: 2; totalHours: 140; secondTermHours: 72 };
export type Grade7SciencePlan = SciencePlan & { grade: 7; curriculumHours: 138; capacityAdjustmentHours: 2; totalHours: 140; secondTermHours: 72 };
export type Grade8SciencePlan = SciencePlan & { grade: 8; curriculumHours: 132; capacityAdjustmentHours: 8; totalHours: 140; firstTermHours: 72; secondTermHours: 68 };

type ScienceBlock = {
  grade?: number;
  unit: number;
  unitTitle: string;
  title: string;
  hours: number;
  outcomeCode?: string;
  outcomeCodes?: string[];
  badge?: string;
  curriculum?: CurriculumOutcome | null;
  curricula?: CurriculumOutcome[];
  plannedTotalHours?: number;
  initialCompletedHours?: number;
};

export const grade5ScienceUnitHours = [
  { unit: 1, title: "Gökyüzündeki Komşularımız ve Biz", hours: 22 },
  { unit: 2, title: "Kuvveti Tanıyalım", hours: 24 },
  { unit: 3, title: "Canlıların Yapısına Yolculuk", hours: 22 },
  { unit: 4, title: "Işığın Dünyası", hours: 14 },
  { unit: 5, title: "Maddenin Doğası", hours: 26 },
  { unit: 6, title: "Yaşamımızdaki Elektrik", hours: 16 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Geri Dönüşüm", hours: 12 },
] as const;

const grade5UnitTitles = new Map<number, string>(grade5ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade5Outcome(unit: number, code: string): CurriculumOutcome {
  return {
    grade: 5,
    curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
    unitId: `FB.5.${unit}`,
    unitTitle: grade5UnitTitles.get(unit) ?? `${unit}. Ünite`,
    code,
    officialDescription: null,
    officialSource: null,
    processComponents: [],
    contentFramework: [],
    keyConcepts: [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade5ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.5.1.1.1", "FB.5.1.2.1", "FB.5.1.2.2", "FB.5.1.3.1"].map((code) => grade5Outcome(1, code)),
  ...["FB.5.2.1.1", "FB.5.2.1.2", "FB.5.2.2.1", "FB.5.2.3.1", "FB.5.2.3.2"].map((code) => grade5Outcome(2, code)),
  ...["FB.5.3.1.1", "FB.5.3.1.2", "FB.5.3.2.1", "FB.5.3.2.2"].map((code) => grade5Outcome(3, code)),
  ...["FB.5.4.1.1", "FB.5.4.2.1", "FB.5.4.3.1"].map((code) => grade5Outcome(4, code)),
  ...["FB.5.5.1.1", "FB.5.5.2.1", "FB.5.5.2.2", "FB.5.5.3.1", "FB.5.5.4.1", "FB.5.5.4.2"].map((code) => grade5Outcome(5, code)),
  ...["FB.5.6.1.1", "FB.5.6.1.2", "FB.5.6.2.1"].map((code) => grade5Outcome(6, code)),
  ...["FB.5.7.1.1", "FB.5.7.1.2", "FB.5.7.1.3"].map((code) => grade5Outcome(7, code)),
];

const grade5CurriculumByCode = new Map(grade5ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade5Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade5CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

export const grade6ScienceUnitHours = [
  { unit: 1, title: "Güneş Sistemi ve Tutulmalar", curriculumHours: 12, planHours: 12 },
  { unit: 2, title: "Kuvvetin Etkisinde Hareket", curriculumHours: 14, planHours: 14 },
  { unit: 3, title: "Canlılarda Sistemler", curriculumHours: 22, planHours: 24 },
  { unit: 4, title: "Işığın Yansıması ve Renkler", curriculumHours: 22, planHours: 22 },
  { unit: 5, title: "Maddenin Ayırt Edici Özellikleri", curriculumHours: 32, planHours: 32 },
  { unit: 6, title: "Elektriğin İletimi ve Direnç", curriculumHours: 18, planHours: 18 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Etkileşim", curriculumHours: 18, planHours: 18 },
] as const;

const grade6UnitTitles = new Map<number, string>(grade6ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade6Outcome(unit: number, code: string): CurriculumOutcome {
  return {
    grade: 6,
    curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
    unitId: `FB.6.${unit}`,
    unitTitle: grade6UnitTitles.get(unit) ?? `${unit}. Ünite`,
    code,
    officialDescription: null,
    officialSource: null,
    processComponents: [],
    contentFramework: [],
    keyConcepts: [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade6ScienceCurriculum: CurriculumOutcome[] = [
  ...["FB.6.1.1.1", "FB.6.1.1.2", "FB.6.1.2.1", "FB.6.1.2.2"].map((code) => grade6Outcome(1, code)),
  ...["FB.6.2.1.1", "FB.6.2.1.2", "FB.6.2.2.1"].map((code) => grade6Outcome(2, code)),
  ...["FB.6.3.1.1", "FB.6.3.1.2", "FB.6.3.1.3", "FB.6.3.1.4", "FB.6.3.1.5", "FB.6.3.2.1", "FB.6.3.2.2", "FB.6.3.2.3", "FB.6.3.2.4"].map((code) => grade6Outcome(3, code)),
  ...["FB.6.4.1.1", "FB.6.4.1.2", "FB.6.4.2.1", "FB.6.4.3.1", "FB.6.4.3.2", "FB.6.4.3.3", "FB.6.4.3.4"].map((code) => grade6Outcome(4, code)),
  ...["FB.6.5.1.1", "FB.6.5.2.1", "FB.6.5.3.1", "FB.6.5.3.2", "FB.6.5.3.3", "FB.6.5.3.4"].map((code) => grade6Outcome(5, code)),
  ...["FB.6.6.1.1", "FB.6.6.2.1", "FB.6.6.2.2"].map((code) => grade6Outcome(6, code)),
  ...["FB.6.7.1.1", "FB.6.7.1.2", "FB.6.7.2.1", "FB.6.7.2.2"].map((code) => grade6Outcome(7, code)),
];

const grade6CurriculumByCode = new Map(grade6ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade6Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "badge" | "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade6CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

export const grade7ScienceUnitHours = [
  { unit: 1, title: "Uzay Çağı", curriculumHours: 14, planHours: 14 },
  { unit: 2, title: "Kuvvet ve Enerjiyi Keşfedelim", curriculumHours: 20, planHours: 20 },
  { unit: 3, title: "Vücudumuzdaki Sistemler", curriculumHours: 32, planHours: 32 },
  { unit: 4, title: "Işığın Kırılması ve Mercekler", curriculumHours: 14, planHours: 14 },
  { unit: 5, title: "Maddenin Doğasına Yolculuk", curriculumHours: 34, planHours: 36 },
  { unit: 6, title: "Elektriklenme", curriculumHours: 12, planHours: 12 },
  { unit: 7, title: "Sürdürülebilir Yaşam ve Enerji", curriculumHours: 12, planHours: 12 },
] as const;

const grade7UnitTitles = new Map<number, string>(grade7ScienceUnitHours.map((item) => [item.unit, item.title]));
const grade7Sources = new Map<number, string>([416, 429, 430, 431, 432, 433, 434].map((id, index) => [index + 1, `https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/${id}`]));

function grade7Outcome(unit: number, code: string, officialDescription: string): CurriculumOutcome {
  return {
    grade: 7,
    curriculumVersion: "Türkiye Yüzyılı Maarif Modeli",
    unitId: `FB.7.${unit}`,
    unitTitle: grade7UnitTitles.get(unit) ?? `${unit}. Ünite`,
    code,
    officialDescription,
    officialSource: grade7Sources.get(unit) ?? null,
    processComponents: [],
    contentFramework: [],
    keyConcepts: [],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade7ScienceCurriculum: CurriculumOutcome[] = [
  grade7Outcome(1, "FB.7.1.1.1", "Uzay araştırmaları için geliştirilen teknolojileri karşılaştırabilme"),
  grade7Outcome(1, "FB.7.1.1.2", "Uzay gözlem araçları ile ilgili bilimsel model oluşturabilme"),
  grade7Outcome(1, "FB.7.1.1.3", "Uzay araştırmalarının yol açabileceği problemleri çözebilme"),
  grade7Outcome(1, "FB.7.1.2.1", "Yıldızların yaşamını açıklayarak yapılandırabilme"),
  grade7Outcome(1, "FB.7.1.2.2", "Yıldız, galaksi ve evren kavramlarını açıklayarak yapılandırabilme"),
  grade7Outcome(2, "FB.7.2.1.1", "Fiziksel anlamda yapılan işin bağlı olduğu faktörlere ilişkin bilimsel çıkarım yapabilme"),
  grade7Outcome(2, "FB.7.2.1.2", "Enerji çeşitlerinden kinetik ve potansiyel enerjiyi karşılaştırabilme"),
  grade7Outcome(2, "FB.7.2.2.1", "Enerji dönüşümünden hareketle enerjinin korunduğuna tümevarımsal akıl yürütebilme"),
  grade7Outcome(3, "FB.7.3.1.1", "Sindirim sistemini oluşturan yapı ve organların görevlerini model üzerinde gözlemleyebilme"),
  grade7Outcome(3, "FB.7.3.1.2", "Sindirim sisteminin sağlığı için yapılması gerekenler konusunda bilgi toplayabilme"),
  grade7Outcome(3, "FB.7.3.2.1", "Dolaşım sistemini oluşturan yapı ve organların görevlerini model üzerinde gözlemleyebilme"),
  grade7Outcome(3, "FB.7.3.2.2", "Kan bağışının toplumsal dayanışma açısından önemini tartışabilme"),
  grade7Outcome(3, "FB.7.3.2.3", "Dolaşım sisteminin sağlığı için yapılması gerekenler konusunda bilgi toplayabilme"),
  grade7Outcome(3, "FB.7.3.3.1", "Solunum sistemini oluşturan yapı ve organların görevlerini model üzerinde gözlemleyebilme"),
  grade7Outcome(3, "FB.7.3.3.2", "Solunum sisteminin sağlığı için yapılması gerekenler konusunda bilgi toplayabilme"),
  grade7Outcome(3, "FB.7.3.4.1", "Boşaltım sistemini oluşturan yapı ve organları model üzerinde gözlemleyebilme"),
  grade7Outcome(3, "FB.7.3.4.2", "Boşaltım sisteminin sağlığı için yapılması gerekenler konusunda bilgi toplayabilme"),
  grade7Outcome(4, "FB.7.4.1.1", "Ortam değiştiren ışığın izlediği yolu gözlemleyerek kırılma olayına yönelik bilimsel çıkarım yapabilme"),
  grade7Outcome(4, "FB.7.4.2.1", "Mercek çeşitlerine yönelik bilimsel çıkarım yapabilme"),
  grade7Outcome(4, "FB.7.4.2.2", "Merceklerin günlük hayatta kullanım alanlarını örneklerle sınıflandırabilme"),
  grade7Outcome(5, "FB.7.5.1.1", "Atomun yapısını ve yapısındaki temel parçacıkları çözümleyebilme"),
  grade7Outcome(5, "FB.7.5.1.2", "Geçmişten günümüze atom kavramı ile ilgili bilimsel bilgilerin değişebileceğini sorgulayabilme"),
  grade7Outcome(5, "FB.7.5.1.3", "Farklı molekül modelleri oluşturabilme"),
  grade7Outcome(5, "FB.7.5.1.4", "Atomların elektron dizilimlerini yapılandırabilme"),
  grade7Outcome(5, "FB.7.5.2.1", "Saf maddeleri element ve bileşik olarak sınıflandırabilme"),
  grade7Outcome(5, "FB.7.5.2.2", "Periyodik tablodaki ilk 18 elementin isimlerini sembolleriyle ifade edebilme"),
  grade7Outcome(5, "FB.7.5.2.3", "Periyodik tabloda grup ve periyotları karşılaştırabilme"),
  grade7Outcome(5, "FB.7.5.2.4", "Bileşiklerin isimlerini formülleriyle yapılandırabilme"),
  grade7Outcome(5, "FB.7.5.3.1", "Karışımları homojen ve heterojen olarak sınıflandırabilme"),
  grade7Outcome(5, "FB.7.5.3.2", "Çözünme hızına etki eden faktörler ile ilgili hipotez oluşturabilme"),
  grade7Outcome(5, "FB.7.5.4.1", "Karışımları ayırmak için çeşitli deneyler yapabilme"),
  grade7Outcome(6, "FB.7.6.1.1", "Elektriklenme ile ilgili bilgi toplayabilme"),
  grade7Outcome(6, "FB.7.6.1.2", "Elektriklenme çeşitlerini belirlemeye yönelik deney yapabilme"),
  grade7Outcome(6, "FB.7.6.1.3", "Cisimlerin elektrik yüklerini sınıflandırabilme"),
  grade7Outcome(7, "FB.7.7.1.1", "Besin zincirindeki canlılar arasındaki ilişkileri yapılandırabilme"),
  grade7Outcome(7, "FB.7.7.2.1", "Kaynakların tasarruflu kullanımının önemini sorgulayabilme"),
];

const grade7CurriculumByCode = new Map(grade7ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade7Block(unit: number, code: string, hours: number, options: Pick<ScienceBlock, "badge" | "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curriculum = grade7CurriculumByCode.get(code)!;
  return { unit, unitTitle: curriculum.unitTitle, title: code, outcomeCode: code, curriculum, hours, ...options };
}

const grade8OfficialSource = "https://mufredat.meb.gov.tr/Dosyalar/201812312311937-FEN%20B%C4%B0L%C4%B0MLER%C4%B0%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI2018.pdf";

export const grade8ScienceUnitHours = [
  { unit: 1, title: "Mevsimler ve İklim", outcomes: 3, curriculumHours: 14, planHours: 14 },
  { unit: 2, title: "DNA ve Genetik Kod", outcomes: 13, curriculumHours: 22, planHours: 22 },
  { unit: 3, title: "Basınç", outcomes: 3, curriculumHours: 10, planHours: 10 },
  { unit: 4, title: "Madde ve Endüstri", outcomes: 17, curriculumHours: 28, planHours: 28 },
  { unit: 5, title: "Basit Makineler", outcomes: 2, curriculumHours: 10, planHours: 10 },
  { unit: 6, title: "Enerji Dönüşümleri ve Çevre Bilimi", outcomes: 12, curriculumHours: 24, planHours: 24 },
  { unit: 7, title: "Elektrik Yükleri ve Elektrik Enerjisi", outcomes: 11, curriculumHours: 24, planHours: 24 },
] as const;

const grade8UnitTitles = new Map<number, string>(grade8ScienceUnitHours.map((item) => [item.unit, item.title]));

function grade8Outcome(unit: number, sectionTitle: string, topicHours: number, code: string, officialDescription: string): CurriculumOutcome {
  return {
    grade: 8,
    curriculumVersion: "2018 Fen Bilimleri Dersi Öğretim Programı",
    unitId: `F.8.${unit}`,
    unitTitle: grade8UnitTitles.get(unit) ?? `${unit}. Ünite`,
    sectionTitle,
    topicHours,
    code,
    officialDescription,
    officialSource: grade8OfficialSource,
    outcomeNotes: [],
    processComponents: [],
    contentFramework: [],
    keyConcepts: [sectionTitle],
    learningEvidence: [],
    learningTeachingExperiences: [],
    differentiation: [],
    skills: [],
    values: [],
    literacySkills: [],
  };
}

export const grade8ScienceCurriculum: CurriculumOutcome[] = [
  grade8Outcome(1, "Mevsimlerin Oluşumu", 8, "F.8.1.1.1", "Mevsimlerin oluşumuna yönelik tahminlerde bulunur."),
  grade8Outcome(1, "İklim ve Hava Hareketleri", 6, "F.8.1.2.1", "İklim ve hava olayları arasındaki farkı açıklar."),
  grade8Outcome(1, "İklim ve Hava Hareketleri", 6, "F.8.1.2.2", "İklim biliminin (klimatoloji) bir bilim dalı olduğunu ve bu alanda çalışan uzmanlara iklim bilimci (klimatolog) adı verildiğini söyler."),

  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.1", "Nükleotid, gen, DNA ve kromozom kavramlarını açıklayarak bu kavramlar arasında ilişki kurar."),
  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.2", "DNA’nın yapısını model üzerinde gösterir."),
  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.3", "DNA’nın kendini nasıl eşlediğini ifade eder."),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.1", "Kalıtım ile ilgili kavramları tanımlar."),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.2", "Tek karakter çaprazlamaları ile ilgili problemler çözerek sonuçlar hakkında yorum yapar."),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.3", "Akraba evliliklerinin genetik sonuçlarını tartışır."),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.1", "Örneklerden yola çıkarak mutasyonu açıklar."),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.2", "Örneklerden yola çıkarak modifikasyonu açıklar."),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.3", "Mutasyonla modifikasyon arasındaki farklar ile ilgili çıkarımda bulunur."),
  grade8Outcome(2, "Adaptasyon (Çevreye Uyum)", 2, "F.8.2.4.1", "Canlıların yaşadıkları çevreye uyumlarını gözlem yaparak açıklar."),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.1", "Genetik mühendisliğini ve biyoteknolojiyi ilişkilendirir."),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.2", "Biyoteknolojik uygulamalar kapsamında oluşturulan ikilemlerle bu uygulamaların insanlık için yararlı ve zararlı yönlerini tartışır."),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.3", "Gelecekteki genetik mühendisliği ve biyoteknoloji uygulamalarının neler olabileceği hakkında tahminde bulunur."),

  grade8Outcome(3, "Basınç", 10, "F.8.3.1.1", "Katı basıncını etkileyen değişkenleri deneyerek keşfeder."),
  grade8Outcome(3, "Basınç", 10, "F.8.3.1.2", "Sıvı basıncını etkileyen değişkenleri tahmin eder ve tahminlerini test eder."),
  grade8Outcome(3, "Basınç", 10, "F.8.3.1.3", "Katı, sıvı ve gazların basınç özelliklerinin günlük yaşam ve teknolojideki uygulamalarına örnekler verir."),

  grade8Outcome(4, "Periyodik Sistem", 4, "F.8.4.1.1", "Periyodik sistemde, grup ve periyotların nasıl oluşturulduğunu açıklar."),
  grade8Outcome(4, "Periyodik Sistem", 4, "F.8.4.1.2", "Elementleri periyodik tablo üzerinde metal, yarımetal ve ametal olarak sınıflandırır."),
  grade8Outcome(4, "Fiziksel ve Kimyasal Değişimler", 4, "F.8.4.2.1", "Fiziksel ve kimyasal değişim arasındaki farkları, çeşitli olayları gözlemleyerek açıklar."),
  grade8Outcome(4, "Kimyasal Tepkimeler", 3, "F.8.4.3.1", "Bileşiklerin kimyasal tepkime sonucunda oluştuğunu bilir."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.1", "Asit ve bazların genel özelliklerini ifade eder."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.2", "Asit ve bazlara günlük yaşamdan örnekler verir."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.3", "Günlük hayatta ulaşılabilecek malzemeleri asit-baz ayracı olarak kullanır."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.4", "Maddelerin asitlik ve bazlık durumlarına ilişkin pH değerlerini kullanarak çıkarımda bulunur."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.5", "Asit ve bazların çeşitli maddeler üzerindeki etkilerini gözlemler."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.6", "Asit ve bazların temizlik malzemesi olarak kullanılması esnasında oluşabilecek tehlikelerle ilgili gerekli tedbirleri alır."),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.7", "Asit yağmurlarının önlenmesine yönelik çözüm önerileri sunar."),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.1", "Isınmanın maddenin cinsine, kütlesine ve/veya sıcaklık değişimine bağlı olduğunu deney yaparak keşfeder."),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.2", "Hâl değiştirmek için gerekli ısının maddenin cinsi ve kütlesiyle ilişkili olduğunu deney yaparak keşfeder."),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.3", "Maddelerin hâl değişimi ve ısınma grafiğini çizerek yorumlar."),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.4", "Günlük yaşamda meydana gelen hâl değişimleri ile ısı alışverişini ilişkilendirir."),
  grade8Outcome(4, "Türkiye’de Kimya Endüstrisi", 4, "F.8.4.6.1", "Geçmişten günümüze Türkiye’deki kimya endüstrisinin gelişimini araştırır."),
  grade8Outcome(4, "Türkiye’de Kimya Endüstrisi", 4, "F.8.4.6.2", "Kimya endüstrisinde meslek dallarını araştırır ve gelecekteki yeni meslek alanları hakkında öneriler sunar."),

  grade8Outcome(5, "Basit Makineler", 10, "F.8.5.1.1", "Basit makinelerin sağladığı avantajları örnekler üzerinden açıklar."),
  grade8Outcome(5, "Basit Makineler", 10, "F.8.5.1.2", "Basit makinelerden yararlanarak günlük yaşamda iş kolaylığı sağlayacak bir düzenek tasarlar."),

  grade8Outcome(6, "Besin Zinciri ve Enerji Akışı", 2, "F.8.6.1.1", "Besin zincirindeki üretici, tüketici, ayrıştırıcılara örnekler verir."),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.1", "Bitkilerde besin üretiminde fotosentezin önemini fark eder."),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.2", "Fotosentez hızını etkileyen faktörler ile ilgili çıkarımlarda bulunur."),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.3", "Canlılarda solunumun önemini belirtir."),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.1", "Madde döngülerini şema üzerinde göstererek açıklar."),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.2", "Madde döngülerinin yaşam açısından önemini sorgular."),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.3", "Küresel iklim değişikliklerinin nedenlerini ve olası sonuçlarını tartışır."),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.1", "Kaynakların kullanımında tasarruflu davranmaya özen gösterir."),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.2", "Kaynakların tasarruflu kullanımına yönelik proje tasarlar."),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.3", "Geri dönüşüm için katı atıkların ayrıştırılmasının önemini açıklar."),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.4", "Geri dönüşümün ülke ekonomisine katkısına ilişkin araştırma verilerini kullanarak çözüm önerileri sunar."),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.5", "Kaynakların tasarruflu kullanılmaması durumunda gelecekte karşılaşılabilecek problemleri belirterek çözüm önerileri sunar."),

  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.1", "Elektriklenmeyi, bazı doğa olayları ve teknolojideki uygulama örnekleri ile açıklar."),
  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.2", "Elektrik yüklerini sınıflandırarak aynı ve farklı cins elektrik yüklerinin birbirlerine etkisini açıklar."),
  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.3", "Deneyler yaparak elektriklenme çeşitlerini fark eder."),
  grade8Outcome(7, "Elektrik Yüklü Cisimler", 8, "F.8.7.2.1", "Cisimleri, sahip oldukları elektrik yükleri bakımından sınıflandırır."),
  grade8Outcome(7, "Elektrik Yüklü Cisimler", 8, "F.8.7.2.2", "Topraklamayı açıklar."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.1", "Elektrik enerjisinin ısı, ışık ve hareket enerjisine dönüştüğü uygulamalara örnekler verir."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.2", "Elektirik enerjisinin ısı, ışık veya hareket enerjisine dönüşümü temel alan bir model tasarlar."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.3", "Güç santrallerinde elektrik enerjisinin nasıl üretildiğini açıklar."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.4", "Güç santrallerinin avantaj ve dezavantajları konusunda fikirler üretir."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.5", "Elektrik enerjisinin bilinçli ve tasarruflu kullanılmasının aile ve ülke ekonomisi bakımından önemini tartışır."),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.6", "Evlerde elektriği tasarruflu kullanmaya özen gösterir."),
];

const grade8CurriculumByCode = new Map(grade8ScienceCurriculum.map((outcome) => [outcome.code, outcome]));

function grade8Block(unit: number, title: string, codes: string[], hours: number, options: Pick<ScienceBlock, "badge" | "initialCompletedHours" | "plannedTotalHours"> = {}): ScienceBlock {
  const curricula = codes.map((code) => grade8CurriculumByCode.get(code)!);
  return { grade: 8, unit, unitTitle: grade8UnitTitles.get(unit) ?? `${unit}. Ünite`, title, outcomeCode: codes[0], outcomeCodes: codes, curriculum: curricula[0], curricula, hours, ...options };
}

const calendar20262027: WorkCalendar = {
  schoolYear: "2026-2027",
  startDate: "2026-09-14",
  endDate: "2027-06-25",
  breaks: [
    { id: "2026-first-break", title: "1. Dönem Ara Tatili", startDate: "2026-11-16", endDate: "2026-11-20" },
    { id: "2027-first-social", title: "Sosyal Etkinlik Haftası", startDate: "2027-01-18", endDate: "2027-01-22", grades: [5, 6, 7] },
    { id: "2027-semester-break", title: "Yarıyıl Tatili", startDate: "2027-01-25", endDate: "2027-02-05" },
    { id: "2027-second-break", title: "2. Dönem Ara Tatili", startDate: "2027-03-08", endDate: "2027-03-12" },
    { id: "2027-second-social-2", title: "Sosyal Etkinlik Haftası", startDate: "2027-06-21", endDate: "2027-06-25", grades: [5, 6, 7] },
  ],
};

export function createDefaultWorkCalendar(now = new Date()): WorkCalendar {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  if (year === 2026) return { ...calendar20262027, breaks: calendar20262027.breaks.map((item) => ({ ...item })) };
  let start = new Date(Date.UTC(year, 8, 1));
  while (start.getUTCDay() !== 1) start = addDays(start, 1);
  const june = new Date(Date.UTC(year + 1, 5, 1));
  let fridayCount = 0;
  let end = june;
  for (let day = june; day.getUTCMonth() === 5; day = addDays(day, 1)) {
    if (day.getUTCDay() === 5 && ++fridayCount === 3) { end = day; break; }
  }
  return { schoolYear: `${year}-${year + 1}`, startDate: isoDate(start), endDate: isoDate(end), breaks: [] };
}

export function isValidWorkCalendar(calendar: WorkCalendar) {
  if (!/^\d{4}-\d{4}$/.test(calendar.schoolYear) || Number.isNaN(dateOnly(calendar.startDate).getTime()) || Number.isNaN(dateOnly(calendar.endDate).getTime()) || calendar.startDate > calendar.endDate) return false;
  return calendar.breaks.every((item) => item.title.trim() && !Number.isNaN(dateOnly(item.startDate).getTime()) && !Number.isNaN(dateOnly(item.endDate).getTime()) && item.startDate <= item.endDate);
}

export function buildPlanWeeks(calendar: WorkCalendar, grade?: number): PlanWeek[] {
  if (!isValidWorkCalendar(calendar)) return [];
  const calendarStart = dateOnly(calendar.startDate);
  const calendarEnd = dateOnly(calendar.endDate);
  const day = calendarStart.getUTCDay() || 7;
  let weekStart = addDays(calendarStart, 1 - day);
  const weeks: PlanWeek[] = [];
  while (weekStart <= calendarEnd) {
    const weekEnd = addDays(weekStart, 6);
    let teachingDays = 0;
    const titles = new Set<string>();
    for (let offset = 0; offset < 5; offset++) {
      const current = addDays(weekStart, offset);
      if (current < calendarStart || current > calendarEnd) continue;
      const currentIso = isoDate(current);
      const breaks = calendar.breaks.filter((item) => {
        const legacyGrade8JanuaryException = grade === 8 && item.id === "2027-first-social" && item.startDate === "2027-01-18" && item.endDate === "2027-01-22" && !item.grades?.length;
        return !legacyGrade8JanuaryException && item.startDate <= currentIso && item.endDate >= currentIso && (grade === undefined || !item.grades?.length || item.grades.includes(grade));
      });
      if (breaks.length) breaks.forEach((item) => titles.add(item.title));
      else teachingDays++;
    }
    weeks.push({ number: weeks.length + 1, startDate: isoDate(weekStart), endDate: isoDate(weekEnd > calendarEnd ? calendarEnd : weekEnd), teachingDays, breakTitles: [...titles] });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

export function isGrade5Class(name: string) {
  return /^5(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade6Class(name: string) {
  return /^6(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade7Class(name: string) {
  return /^7(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

export function isGrade8Class(name: string) {
  return /^8(?:\s*[-/.]\s*|\s+|$)/i.test(name.trim());
}

function getGrade6ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 6);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

function getGrade7ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 7);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

function allocateScienceWeeks(weeks: PlanWeek[], term: 1 | 2, blocks: ScienceBlock[]) {
  let blockIndex = 0;
  let blockRemaining = blocks[0]?.hours ?? 0;
  let completedInBlock = blocks[0]?.initialCompletedHours ?? 0;
  return weeks.map<SciencePlanWeek>((week) => {
    let capacity = 4;
    const items: SciencePlanItem[] = [];
    while (capacity > 0 && blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      const hours = Math.min(capacity, blockRemaining);
      const completedBeforeHours = completedInBlock;
      completedInBlock += hours;
      items.push({
        unit: block.unit,
        unitTitle: block.unitTitle,
        title: block.title,
        outcomeCode: block.outcomeCode,
        outcomeCodes: block.outcomeCodes,
        badge: block.badge,
        hours,
        curriculum: block.curriculum ?? null,
        curricula: block.curricula,
        allocation: {
          schoolYear: "2026-2027",
          grade: block.grade ?? block.curriculum?.grade ?? (block.outcomeCode?.startsWith("FB.7") ? 7 : block.outcomeCode?.startsWith("FB.6") ? 6 : 5),
          classId: null,
          weekId: week.startDate,
          weekStart: week.startDate,
          weekEnd: week.endDate,
          outcomeCode: block.outcomeCode ?? null,
          outcomeCodes: block.outcomeCodes,
          allocatedHours: hours,
          plannedTotalHours: block.plannedTotalHours ?? block.hours,
          completedBeforeHours,
          completedAfterHours: completedInBlock,
          source: "auto",
          teacherNote: null,
          completed: false,
        },
      });
      capacity -= hours;
      blockRemaining -= hours;
      if (blockRemaining === 0) {
        blockIndex++;
        blockRemaining = blocks[blockIndex]?.hours ?? 0;
        completedInBlock = blocks[blockIndex]?.initialCompletedHours ?? 0;
      }
    }
    return { weekStart: week.startDate, term, items, totalHours: items.reduce((sum, item) => sum + item.hours, 0) };
  });
}

export function buildGrade5SciencePlan(calendar: WorkCalendar): Grade5SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const weeks = buildPlanWeeks(calendar, 5);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  if (firstTerm.length !== 17 || secondTerm.length !== 18) return null;

  const firstTermBlocks: ScienceBlock[] = [
    { unit: 0, unitTitle: "Dönem Hazırlığı", title: "LABORATUVAR GÜVENLİĞİ VE LABORATUVAR KURALLARI", badge: "hazırlık", hours: 4 },
    grade5Block(1, "FB.5.1.1.1", 8), grade5Block(1, "FB.5.1.2.1", 4), grade5Block(1, "FB.5.1.2.2", 6), grade5Block(1, "FB.5.1.3.1", 4),
    grade5Block(2, "FB.5.2.1.1", 6), grade5Block(2, "FB.5.2.1.2", 4), grade5Block(2, "FB.5.2.2.1", 4), grade5Block(2, "FB.5.2.3.1", 4), grade5Block(2, "FB.5.2.3.2", 6),
    grade5Block(3, "FB.5.3.1.1", 6), grade5Block(3, "FB.5.3.1.2", 6), grade5Block(3, "FB.5.3.2.1", 6, { plannedTotalHours: 8 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade5Block(3, "FB.5.3.2.1", 2, { initialCompletedHours: 6, plannedTotalHours: 8 }), grade5Block(3, "FB.5.3.2.2", 2),
    grade5Block(4, "FB.5.4.1.1", 4), grade5Block(4, "FB.5.4.2.1", 4), grade5Block(4, "FB.5.4.3.1", 6),
    grade5Block(5, "FB.5.5.1.1", 4), grade5Block(5, "FB.5.5.2.1", 4), grade5Block(5, "FB.5.5.2.2", 4), grade5Block(5, "FB.5.5.3.1", 6), grade5Block(5, "FB.5.5.4.1", 4), grade5Block(5, "FB.5.5.4.2", 4),
    grade5Block(6, "FB.5.6.1.1", 2), grade5Block(6, "FB.5.6.1.2", 4), grade5Block(6, "FB.5.6.2.1", 4, { plannedTotalHours: 10 }), grade5Block(6, "FB.5.6.2.1", 6, { initialCompletedHours: 4, plannedTotalHours: 10 }),
    grade5Block(7, "FB.5.7.1.1", 4), grade5Block(7, "FB.5.7.1.2", 4), grade5Block(7, "FB.5.7.1.3", 4),
  ];

  return {
    grade: 5,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 140,
    capacityAdjustmentHours: 0,
    totalHours: 140,
    firstTermHours: 68,
    secondTermHours: 72,
    weeks: [
      ...allocateScienceWeeks(firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildGrade6SciencePlan(calendar: WorkCalendar): Grade6SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const termWeeks = getGrade6ScienceTermWeeks(calendar);
  if (!termWeeks) return null;

  const firstTermBlocks: ScienceBlock[] = [
    grade6Block(1, "FB.6.1.1.1", 4), grade6Block(1, "FB.6.1.1.2", 4), grade6Block(1, "FB.6.1.2.1", 2), grade6Block(1, "FB.6.1.2.2", 2),
    grade6Block(2, "FB.6.2.1.1", 4), grade6Block(2, "FB.6.2.1.2", 4), grade6Block(2, "FB.6.2.2.1", 6),
    grade6Block(3, "FB.6.3.1.1", 2), grade6Block(3, "FB.6.3.1.2", 4), grade6Block(3, "FB.6.3.1.3", 4), grade6Block(3, "FB.6.3.1.4", 2), grade6Block(3, "FB.6.3.1.5", 4, { badge: "+2 öğretmen planlama" }), grade6Block(3, "FB.6.3.2.1", 2), grade6Block(3, "FB.6.3.2.2", 2), grade6Block(3, "FB.6.3.2.3", 2), grade6Block(3, "FB.6.3.2.4", 2),
    grade6Block(4, "FB.6.4.1.1", 2), grade6Block(4, "FB.6.4.1.2", 4), grade6Block(4, "FB.6.4.2.1", 4), grade6Block(4, "FB.6.4.3.1", 2), grade6Block(4, "FB.6.4.3.2", 4), grade6Block(4, "FB.6.4.3.3", 2, { plannedTotalHours: 4 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade6Block(4, "FB.6.4.3.3", 2, { initialCompletedHours: 2, plannedTotalHours: 4 }), grade6Block(4, "FB.6.4.3.4", 2),
    grade6Block(5, "FB.6.5.1.1", 6), grade6Block(5, "FB.6.5.2.1", 6), grade6Block(5, "FB.6.5.3.1", 6), grade6Block(5, "FB.6.5.3.2", 6), grade6Block(5, "FB.6.5.3.3", 4), grade6Block(5, "FB.6.5.3.4", 4),
    grade6Block(6, "FB.6.6.1.1", 4), grade6Block(6, "FB.6.6.2.1", 8), grade6Block(6, "FB.6.6.2.2", 6),
    grade6Block(7, "FB.6.7.1.1", 4), grade6Block(7, "FB.6.7.1.2", 4), grade6Block(7, "FB.6.7.2.1", 4), grade6Block(7, "FB.6.7.2.2", 6),
  ];

  return {
    grade: 6,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 138,
    capacityAdjustmentHours: 2,
    totalHours: 140,
    firstTermHours: 68,
    secondTermHours: 72,
    weeks: [
      ...allocateScienceWeeks(termWeeks.firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(termWeeks.secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildGrade7SciencePlan(calendar: WorkCalendar): Grade7SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const termWeeks = getGrade7ScienceTermWeeks(calendar);
  if (!termWeeks) return null;

  const firstTermBlocks: ScienceBlock[] = [
    grade7Block(1, "FB.7.1.1.1", 2), grade7Block(1, "FB.7.1.1.2", 4), grade7Block(1, "FB.7.1.1.3", 2), grade7Block(1, "FB.7.1.2.1", 4), grade7Block(1, "FB.7.1.2.2", 2),
    grade7Block(2, "FB.7.2.1.1", 6), grade7Block(2, "FB.7.2.1.2", 6), grade7Block(2, "FB.7.2.2.1", 8),
    grade7Block(3, "FB.7.3.1.1", 6), grade7Block(3, "FB.7.3.1.2", 2), grade7Block(3, "FB.7.3.2.1", 6), grade7Block(3, "FB.7.3.2.2", 2), grade7Block(3, "FB.7.3.2.3", 2), grade7Block(3, "FB.7.3.3.1", 6), grade7Block(3, "FB.7.3.3.2", 2), grade7Block(3, "FB.7.3.4.1", 4), grade7Block(3, "FB.7.3.4.2", 2),
    grade7Block(4, "FB.7.4.1.1", 2, { plannedTotalHours: 6 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade7Block(4, "FB.7.4.1.1", 4, { initialCompletedHours: 2, plannedTotalHours: 6 }), grade7Block(4, "FB.7.4.2.1", 4), grade7Block(4, "FB.7.4.2.2", 4),
    grade7Block(5, "FB.7.5.1.1", 4), grade7Block(5, "FB.7.5.1.2", 2), grade7Block(5, "FB.7.5.1.3", 2), grade7Block(5, "FB.7.5.1.4", 6, { badge: "+2 öğretmen planlama" }), grade7Block(5, "FB.7.5.2.1", 4), grade7Block(5, "FB.7.5.2.2", 2), grade7Block(5, "FB.7.5.2.3", 2), grade7Block(5, "FB.7.5.2.4", 2), grade7Block(5, "FB.7.5.3.1", 2), grade7Block(5, "FB.7.5.3.2", 6), grade7Block(5, "FB.7.5.4.1", 4),
    grade7Block(6, "FB.7.6.1.1", 2), grade7Block(6, "FB.7.6.1.2", 6), grade7Block(6, "FB.7.6.1.3", 4),
    grade7Block(7, "FB.7.7.1.1", 6), grade7Block(7, "FB.7.7.2.1", 6),
  ];

  return {
    grade: 7,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 138,
    capacityAdjustmentHours: 2,
    totalHours: 140,
    firstTermHours: 68,
    secondTermHours: 72,
    weeks: [
      ...allocateScienceWeeks(termWeeks.firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(termWeeks.secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildGrade8SciencePlan(calendar: WorkCalendar): Grade8SciencePlan | null {
  if (calendar.schoolYear !== "2026-2027") return null;
  const weeks = buildPlanWeeks(calendar, 8);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-25" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-14" && week.teachingDays > 0);
  if (firstTerm.length !== 18 || secondTerm.length !== 17) return null;

  const firstTermBlocks: ScienceBlock[] = [
    grade8Block(1, "Mevsimlerin Oluşumu", ["F.8.1.1.1"], 8),
    grade8Block(1, "İklim ve Hava Olayları", ["F.8.1.2.1", "F.8.1.2.2"], 6),
    grade8Block(2, "DNA ve Genetik Kod", ["F.8.2.1.1", "F.8.2.1.2", "F.8.2.1.3"], 4),
    grade8Block(2, "Kalıtım", ["F.8.2.2.1", "F.8.2.2.2", "F.8.2.2.3"], 10),
    grade8Block(2, "Mutasyon ve Modifikasyon", ["F.8.2.3.1", "F.8.2.3.2", "F.8.2.3.3"], 2),
    grade8Block(2, "Adaptasyon", ["F.8.2.4.1"], 2),
    grade8Block(2, "Biyoteknoloji", ["F.8.2.5.1", "F.8.2.5.2", "F.8.2.5.3"], 4),
    grade8Block(3, "Basınç", ["F.8.3.1.1", "F.8.3.1.2", "F.8.3.1.3"], 10),
    grade8Block(4, "Periyodik Sistem", ["F.8.4.1.1", "F.8.4.1.2"], 4),
    grade8Block(4, "Fiziksel ve Kimyasal Değişimler", ["F.8.4.2.1"], 4),
    grade8Block(4, "Kimyasal Tepkimeler", ["F.8.4.3.1"], 3),
    grade8Block(4, "Asitler ve Bazlar", ["F.8.4.4.1", "F.8.4.4.2", "F.8.4.4.3", "F.8.4.4.4", "F.8.4.4.5", "F.8.4.4.6", "F.8.4.4.7"], 8),
    grade8Block(4, "Maddenin Isı ile Etkileşimi", ["F.8.4.5.1", "F.8.4.5.2", "F.8.4.5.3", "F.8.4.5.4"], 5),
    grade8Block(4, "Türkiye’de Kimya Endüstrisi", ["F.8.4.6.1", "F.8.4.6.2"], 2, { plannedTotalHours: 4 }),
  ];
  const secondTermBlocks: ScienceBlock[] = [
    grade8Block(4, "Türkiye’de Kimya Endüstrisi", ["F.8.4.6.1", "F.8.4.6.2"], 2, { initialCompletedHours: 2, plannedTotalHours: 4 }),
    grade8Block(5, "Basit Makineler", ["F.8.5.1.1", "F.8.5.1.2"], 10),
    grade8Block(6, "Besin Zinciri ve Enerji Akışı", ["F.8.6.1.1"], 2),
    grade8Block(6, "Enerji Dönüşümleri", ["F.8.6.2.1", "F.8.6.2.2", "F.8.6.2.3"], 8),
    grade8Block(6, "Madde Döngüleri ve Çevre Sorunları", ["F.8.6.3.1", "F.8.6.3.2", "F.8.6.3.3"], 8),
    grade8Block(6, "Sürdürülebilir Kalkınma", ["F.8.6.4.1", "F.8.6.4.2", "F.8.6.4.3", "F.8.6.4.4", "F.8.6.4.5"], 6),
    grade8Block(7, "Elektrik Yükleri ve Elektriklenme", ["F.8.7.1.1", "F.8.7.1.2", "F.8.7.1.3"], 6),
    grade8Block(7, "Elektrik Yüklü Cisimler", ["F.8.7.2.1", "F.8.7.2.2"], 8),
    grade8Block(7, "Elektrik Enerjisinin Dönüşümü", ["F.8.7.3.1", "F.8.7.3.2", "F.8.7.3.3", "F.8.7.3.4", "F.8.7.3.5", "F.8.7.3.6"], 10),
    { grade: 8, unit: 0, unitTitle: "Fen, Mühendislik ve Girişimcilik Uygulamaları", title: "Fen, Mühendislik ve Girişimcilik Uygulamaları", badge: "mühendislik / proje", hours: 8 },
  ];

  return {
    grade: 8,
    schoolYear: "2026-2027",
    weeklyHours: 4,
    curriculumHours: 132,
    capacityAdjustmentHours: 8,
    totalHours: 140,
    firstTermHours: 72,
    secondTermHours: 68,
    weeks: [
      ...allocateScienceWeeks(firstTerm, 1, firstTermBlocks),
      ...allocateScienceWeeks(secondTerm, 2, secondTermBlocks),
    ],
  };
}

export function buildSciencePlanForClass(className: string, calendar: WorkCalendar): SciencePlan | null {
  if (isGrade5Class(className)) return buildGrade5SciencePlan(calendar);
  if (isGrade6Class(className)) return buildGrade6SciencePlan(calendar);
  if (isGrade7Class(className)) return buildGrade7SciencePlan(calendar);
  if (isGrade8Class(className)) return buildGrade8SciencePlan(calendar);
  return null;
}

export function distributeHoursToWeeks(durations: number[], weeklyHours = 4) {
  const weeks: number[][] = [];
  let current: number[] = [];
  let capacity = weeklyHours;
  for (const duration of durations) {
    let remaining = duration;
    while (remaining > 0) {
      const hours = Math.min(capacity, remaining);
      current.push(hours);
      capacity -= hours;
      remaining -= hours;
      if (capacity === 0) { weeks.push(current); current = []; capacity = weeklyHours; }
    }
  }
  if (current.length) weeks.push(current);
  return weeks;
}

export function updateAnnualPlanEntry(data: AppData, classId: string, calendar: WorkCalendar, weekStart: string, patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">, idFactory: () => string): AppData {
  const entries = data.annualPlanEntries ?? [];
  const existing = entries.find((item) => item.classId === classId && item.schoolYear === calendar.schoolYear && item.weekStart === weekStart);
  const clean = { topic: patch.topic.trim(), note: patch.note.trim(), completed: patch.completed };
  if (!clean.topic && !clean.note && !clean.completed) return { ...data, annualPlanEntries: entries.filter((item) => item !== existing) };
  const entry: AnnualPlanEntry = { id: existing?.id ?? idFactory(), classId, schoolYear: calendar.schoolYear, weekStart, ...clean };
  return { ...data, annualPlanEntries: existing ? entries.map((item) => item === existing ? entry : item) : [...entries, entry] };
}
