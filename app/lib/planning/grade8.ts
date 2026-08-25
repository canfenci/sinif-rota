import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade8SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";

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

export function buildGrade8SciencePlan(calendar: WorkCalendar): Grade8SciencePlan | null {
  if (!isSupportedSciencePlanCalendar(calendar)) return null;
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
    schoolYear: SCIENCE_PLAN_SCHOOL_YEAR,
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
