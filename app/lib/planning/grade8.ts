import type { WorkCalendar } from "../types";
import type { CurriculumOutcome, Grade8SciencePlan, ScienceBlock } from "./types";
import { buildPlanWeeks, isSupportedSciencePlanCalendar, SCIENCE_PLAN_SCHOOL_YEAR } from "./calendar";
import { allocateScienceWeeks } from "./allocation";
import { createPlanningCurriculumOutcome } from "./curriculum-resolver";

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

function grade8Outcome(unit: number, sectionTitle: string, topicHours: number, code: string): CurriculumOutcome {
  return createPlanningCurriculumOutcome(8, unit, code, { sectionTitle, topicHours }, grade8UnitTitles.get(unit));
}

export const grade8ScienceCurriculum: CurriculumOutcome[] = [
  grade8Outcome(1, "Mevsimlerin Oluşumu", 8, "F.8.1.1.1"),
  grade8Outcome(1, "İklim ve Hava Hareketleri", 6, "F.8.1.2.1"),
  grade8Outcome(1, "İklim ve Hava Hareketleri", 6, "F.8.1.2.2"),

  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.1"),
  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.2"),
  grade8Outcome(2, "DNA ve Genetik Kod", 4, "F.8.2.1.3"),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.1"),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.2"),
  grade8Outcome(2, "Kalıtım", 10, "F.8.2.2.3"),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.1"),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.2"),
  grade8Outcome(2, "Mutasyon ve Modifikasyon", 2, "F.8.2.3.3"),
  grade8Outcome(2, "Adaptasyon (Çevreye Uyum)", 2, "F.8.2.4.1"),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.1"),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.2"),
  grade8Outcome(2, "Biyoteknoloji", 4, "F.8.2.5.3"),

  grade8Outcome(3, "Basınç", 10, "F.8.3.1.1"),
  grade8Outcome(3, "Basınç", 10, "F.8.3.1.2"),
  grade8Outcome(3, "Basınç", 10, "F.8.3.1.3"),

  grade8Outcome(4, "Periyodik Sistem", 4, "F.8.4.1.1"),
  grade8Outcome(4, "Periyodik Sistem", 4, "F.8.4.1.2"),
  grade8Outcome(4, "Fiziksel ve Kimyasal Değişimler", 4, "F.8.4.2.1"),
  grade8Outcome(4, "Kimyasal Tepkimeler", 3, "F.8.4.3.1"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.1"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.2"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.3"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.4"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.5"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.6"),
  grade8Outcome(4, "Asitler ve Bazlar", 8, "F.8.4.4.7"),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.1"),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.2"),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.3"),
  grade8Outcome(4, "Maddenin Isı ile Etkileşimi", 5, "F.8.4.5.4"),
  grade8Outcome(4, "Türkiye’de Kimya Endüstrisi", 4, "F.8.4.6.1"),
  grade8Outcome(4, "Türkiye’de Kimya Endüstrisi", 4, "F.8.4.6.2"),

  grade8Outcome(5, "Basit Makineler", 10, "F.8.5.1.1"),
  grade8Outcome(5, "Basit Makineler", 10, "F.8.5.1.2"),

  grade8Outcome(6, "Besin Zinciri ve Enerji Akışı", 2, "F.8.6.1.1"),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.1"),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.2"),
  grade8Outcome(6, "Enerji Dönüşümleri", 8, "F.8.6.2.3"),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.1"),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.2"),
  grade8Outcome(6, "Madde Döngüleri ve Çevre Sorunları", 8, "F.8.6.3.3"),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.1"),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.2"),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.3"),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.4"),
  grade8Outcome(6, "Sürdürülebilir Kalkınma", 6, "F.8.6.4.5"),

  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.1"),
  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.2"),
  grade8Outcome(7, "Elektrik Yükleri ve Elektriklenme", 6, "F.8.7.1.3"),
  grade8Outcome(7, "Elektrik Yüklü Cisimler", 8, "F.8.7.2.1"),
  grade8Outcome(7, "Elektrik Yüklü Cisimler", 8, "F.8.7.2.2"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.1"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.2"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.3"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.4"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.5"),
  grade8Outcome(7, "Elektrik Enerjisinin Dönüşümü", 10, "F.8.7.3.6"),
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
