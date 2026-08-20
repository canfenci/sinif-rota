import type { AppData, CheckSession, CheckStatus, CheckType, SchoolClass } from "./types";

const firstNames = ["Ahmet","Ayşe","Mehmet","Zeynep","Emir","Elif","Arda","Ece","Kerem","Defne","Mert","Selin","Can","Duru","Eren","İrem","Berk","Nisa","Kaan","Sude","Deniz","Ceren","Ali","Naz","Yiğit","Ada","Ömer","Yağmur","Burak","Melis","Umut","İlayda","Ozan","Eylül","Baran","Mina","Doruk","Aslı","Onur","Lara","Tuna","Pelin"];
const lastNames = ["Demir","Yılmaz","Kaya","Çelik","Şahin","Aydın","Öztürk","Arslan","Koç","Kurt","Aksoy","Polat","Güneş","Yıldız"];
const classNames = ["5-A", "5-B", "5-C", "5-D", "5-E"];

export const seedClasses: SchoolClass[] = classNames.map((name, classIndex) => ({
  id: `class-${classIndex + 1}`,
  name,
  students: firstNames.map((firstName, index) => ({
    id: `c${classIndex + 1}-s${index + 1}`,
    number: index + 1,
    name: `${firstName} ${lastNames[(index * 3 + classIndex) % lastNames.length]}`,
  })),
}));

const types: CheckType[] = ["Ödev", "Defter", "Kitap", "Materyal"];
const statusFor = (index: number, session: number): CheckStatus => {
  if ((index + session * 3) % 19 === 0) return "absent";
  if ((index * 2 + session) % 17 === 0) return "missing";
  if ((index + session) % 11 === 0) return "partial";
  return "complete";
};

const sessions: CheckSession[] = Array.from({ length: 12 }, (_, sessionIndex) => {
  const schoolClass = seedClasses[sessionIndex % 3];
  return {
    id: `seed-session-${sessionIndex}`,
    classId: schoolClass.id,
    className: schoolClass.name,
    type: types[sessionIndex % types.length],
    date: new Date(2026, 7, 19 - sessionIndex).toISOString(),
    statuses: Object.fromEntries(schoolClass.students.map((student, index) => [student.id, statusFor(index, sessionIndex)])),
  };
});

export const seedData: AppData = { classes: seedClasses, sessions };
