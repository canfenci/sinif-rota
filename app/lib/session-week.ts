import type { WorkCalendar } from "./types";
import { buildPlanWeeks, isValidWorkCalendar } from "./planning/calendar";
import { addDays, dateOnly, isoDate } from "./planning/date-utils";

/**
 * Sınıf Rota ve MEB çalışma takvimi için authoritative zaman dilimi.
 * Türkiye'de okullar ve dersler kalıcı UTC+3 (Europe/Istanbul) zaman diliminde yürütülür.
 */
export const SESSION_TIME_ZONE = "Europe/Istanbul";

/**
 * ISO session timestamp'ini veya YYYY-MM-DD tarih dizgisini, Europe/Istanbul
 * yerel takvim gününe (YYYY-MM-DD) deterministik olarak çevirir.
 *
 * Gerekçe:
 * Türkiye yerel saatinde (UTC+3) gece yarısından sonra (örn. Pazartesi 00:30)
 * kaydedilen bir oturumun UTC karşılığı Pazar 21:30 olur. Doğrudan UTC tabanlı
 * .toISOString().slice(0, 10) kullanılırsa kayıt önceki güne/haftaya kayar.
 * Bu helper Intl.DateTimeFormat ile CI runner veya işletim sistemi saat diliminden
 * bağımsız olarak Europe/Istanbul takvim gününü deterministik çıkarır.
 */
export function extractCalendarDate(dateStr: string, timeZone = SESSION_TIME_ZONE): string {
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid date string provided: "${dateStr}"`);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Herhangi bir YYYY-MM-DD takvim gününün içinde bulunduğu haftanın Pazartesi gününü döndürür.
 * Saf UTC hesaplamasıyla çalışır; yerel saat dilimi kayması oluşturmaz.
 */
export function findCalendarMonday(calendarDate: string): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new TypeError(`Invalid calendar date provided: "${calendarDate}"`);
  }

  const dayOfWeek = utcDate.getUTCDay() || 7; // 1 = Pazartesi, 7 = Pazar
  const diffToMonday = 1 - dayOfWeek;
  const monday = new Date(utcDate.getTime() + diffToMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * Bir kontrol oturumunun tarihini (date) ilgili haftanın Pazartesi gününe (YYYY-MM-DD)
 * deterministik olarak eşler.
 *
 * Kurallar:
 * 1. Tarih Europe/Istanbul yerel takvim gününe çevrilir.
 * 2. Geçerli bir WorkCalendar mevcutsa ve tarih bir PlanWeek (eğitim haftası veya tatil)
 *    aralığına düşüyorsa, takvim motorunun o haftaya ait startDate (Pazartesi) değeri döndürülür.
 * 3. Tarih takvim aralığı dışındaysa veya takvim sağlanmamışsa, o takvim gününün içinde bulunduğu
 *    haftanın Pazartesi günü güvenli fallback olarak döndürülür.
 */
export function resolveSessionWeekStart(date: string, calendar?: WorkCalendar): string {
  const calendarDate = extractCalendarDate(date, SESSION_TIME_ZONE);

  if (calendar && isValidWorkCalendar(calendar)) {
    const planWeeks = buildPlanWeeks(calendar);
    const matchedWeek = planWeeks.find((week) => {
      const monday = week.startDate;
      const sunday = isoDate(addDays(dateOnly(monday), 6));
      return calendarDate >= monday && calendarDate <= sunday;
    });

    if (matchedWeek) {
      return matchedWeek.startDate;
    }
  }

  return findCalendarMonday(calendarDate);
}
