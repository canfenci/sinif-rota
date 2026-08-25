import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade7SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";

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

export function getGrade7ScienceTermWeeks(calendar: WorkCalendar) {
  const weeks = buildPlanWeeks(calendar, 7);
  const firstTerm = weeks.filter((week) => week.startDate >= "2026-09-14" && week.startDate < "2027-01-18" && week.teachingDays > 0);
  const secondTerm = weeks.filter((week) => week.startDate >= "2027-02-08" && week.startDate < "2027-06-21" && week.teachingDays > 0);
  return firstTerm.length === 17 && secondTerm.length === 18 ? { firstTerm, secondTerm } : null;
}

export function buildGrade7SciencePlan(calendar: WorkCalendar): Grade7SciencePlan | null {
  if (!isSupportedSciencePlanCalendar(calendar)) return null;
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
    schoolYear: SCIENCE_PLAN_SCHOOL_YEAR,
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
