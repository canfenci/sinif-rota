import { useMemo, useState, useSyncExternalStore } from "react";
import { isSupportedAcademicYear, type CalendarSupportState } from "../lib/academic-year";
import { buildPlanWeeks, buildSciencePlanForClass, isValidWorkCalendar, type PlanWeek, type SciencePlanItem } from "../lib/planning";
import type { AnnualPlanEntry, CalendarBreak, SchoolClass, WorkCalendar } from "../lib/types";
import { Sheet } from "./Sheet";

type EntryDraft = { week: PlanWeek; topic: string; note: string; completed: boolean };

const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const noopSubscribe = () => () => {};

export function useClientLocalDateString(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => toLocalDateString(new Date()),
    () => null,
  );
}

export function formatWeekDateRange(startDateStr: string, endDateStr: string): string {
  const start = asDate(startDateStr);
  const end = asDate(endDateStr);

  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = start.toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" }).toLocaleUpperCase("tr-TR");
  const endMonth = end.toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" }).toLocaleUpperCase("tr-TR");

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

/**
 * Semantik: Öğretim haftası gösterim bitiş tarihini belirler.
 *
 * Kurallar:
 * 1. Yalnızca standart Pazartesi–Pazar takvim bloğunda (diffDays === 6 ve end Pazar günü)
 *    öğretim haftası gösterim bitişi Cuma (startDate + 4 gün) olarak hesaplanır.
 * 2. PlanWeek.endDate zaten Cuma veya kısaltılmış bir tarih olarak geliyorsa (diffDays < 6
 *    veya özel ara tatil/dönem sonu), bu orijinal endDate korunur, değiştirilmez.
 * 3. PlanWeek verisini mutate etmez; planning engine ve takvim hesaplamalarına dokunmaz,
 *    yalnızca UI gösterim katmanında çalışır.
 */
export function getWeekDisplayEndDate(week: PlanWeek): string {
  const start = asDate(week.startDate);
  const end = asDate(week.endDate);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  // Yalnızca standart Pazartesi-Pazar (diffDays === 6 ve Pazar) durumunda Cuma (+4 gün)
  if (diffDays === 6 && end.getUTCDay() === 0) {
    const friday = new Date(start.getTime() + 4 * 24 * 60 * 60 * 1000);
    return friday.toISOString().slice(0, 10);
  }
  // Kısaltılmış veya özel takvim tarihi korunur
  return week.endDate;
}

export const getTeachingWeekDisplayEndDate = getWeekDisplayEndDate;

export function findInitialWeekIndex(weeks: PlanWeek[], target: Date | string = new Date()): number {
  if (!weeks.length) return 0;
  const today = typeof target === "string" ? target : toLocalDateString(target);
  const found = weeks.findIndex((w) => today >= w.startDate && today <= w.endDate);
  return found >= 0 ? found : 0;
}

export function getNextWeekIndex(currentIndex: number, totalWeeks: number): number {
  if (totalWeeks <= 0) return 0;
  return Math.min(currentIndex + 1, totalWeeks - 1);
}

export function getPreviousWeekIndex(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

export function AnnualPlan({ classes, calendar, calendarSupportState, entries, onCalendar, onEntry, onNotify }: {
  classes: SchoolClass[];
  calendar: WorkCalendar;
  calendarSupportState: CalendarSupportState;
  entries: AnnualPlanEntry[];
  onCalendar: (calendar: WorkCalendar) => void;
  onEntry: (classId: string, weekStart: string, patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">) => void;
  onNotify: (message: string) => void;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);

  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0];
  const selectedClassId = selectedClass?.id ?? "";
  const isHistorical = calendarSupportState === "supported_historical";

  const sciencePlan = useMemo(() => selectedClass ? buildSciencePlanForClass(selectedClass.name, calendar) : null, [calendar, selectedClass]);
  const weeks = useMemo(() => buildPlanWeeks(calendar, sciencePlan?.grade), [calendar, sciencePlan?.grade]);
  const clientLocalDate = useClientLocalDateString();
  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);

  const scienceByWeek = new Map(sciencePlan?.weeks.map((week) => [week.weekStart, week]) ?? []);
  const planEntries = entries.filter((item) => item.classId === selectedClassId && item.schoolYear === calendar.schoolYear);
  const byWeek = new Map(planEntries.map((item) => [item.weekStart, item]));
  const teachable = weeks.filter((week) => week.teachingDays > 0 || scienceByWeek.has(week.startDate));
  const completed = teachable.filter((week) => byWeek.get(week.startDate)?.completed).length;
  const planned = teachable.filter((week) => byWeek.get(week.startDate)?.topic || scienceByWeek.has(week.startDate)).length;

  const rawIndex = userSelectedIndex !== null
    ? userSelectedIndex
    : (clientLocalDate ? findInitialWeekIndex(weeks, clientLocalDate) : 0);
  const activeWeekIndex = Math.max(0, Math.min(rawIndex, Math.max(0, weeks.length - 1)));
  const selectedWeek = weeks[activeWeekIndex];
  const canPrev = activeWeekIndex > 0;
  const canNext = activeWeekIndex < weeks.length - 1;

  const selectedEntry = selectedWeek ? byWeek.get(selectedWeek.startDate) : undefined;
  const selectedAutomatic = selectedWeek ? scienceByWeek.get(selectedWeek.startDate) : undefined;
  const closed = Boolean(selectedWeek && selectedWeek.teachingDays === 0 && !selectedAutomatic);

  function openWeek(week: PlanWeek) {
    const entry = byWeek.get(week.startDate);
    const automatic = scienceByWeek.get(week.startDate);
    const automaticTopic = automatic?.items.map((item) => `${item.title} — ${item.hours} saat`).join("\n") ?? "";
    setEntryDraft({ week, topic: entry?.topic ?? automaticTopic, note: entry?.note ?? "", completed: entry?.completed ?? false });
  }

  function saveWeek() {
    if (!entryDraft || !selectedClassId) return;
    onEntry(selectedClassId, entryDraft.week.startDate, { topic: entryDraft.topic, note: entryDraft.note, completed: entryDraft.completed });
    setEntryDraft(null);
    onNotify("Haftalık plan kaydedildi");
  }

  return <>
    <header className="page-header"><div className="brand-mark" aria-label="Sınıf Rota">SR</div><div><p className="eyebrow">{calendar.schoolYear} EĞİTİM YILI</p><h1>Yıllık Plan</h1>{calendarSupportState === "supported_historical" && <p className="historical-year-badge" role="status">Geçmiş Eğitim Yılı ({calendar.schoolYear.replace("-", "–")})</p>}</div></header>
    {!classes.length ? <div className="plan-empty"><strong>Plan için aktif sınıf yok</strong><p>Önce Sınıflar bölümünden bir sınıf oluşturun.</p></div> : <>
      <section className="plan-summary">
        <div><p className="kicker">İŞ TAKVİMİNE GÖRE</p><h2>Hafta hafta<br />ders akışı.</h2></div>
        {!isHistorical && <button type="button" onClick={() => setCalendarOpen(true)}>Takvimi düzenle</button>}
        {sciencePlan && <div className="science-plan-rule"><strong>{sciencePlan.grade}. Sınıf Fen Bilimleri</strong><span>{sciencePlan.grade === 5 ? "Haftada 4 saat · 4 saat laboratuvar güvenliği + 136 saat öğrenme çıktıları" : sciencePlan.grade === 8 ? "Haftada 4 saat · 132 saat kazanım + 8 saat mühendislik / proje" : "Haftada 4 saat · 138 saat resmî program + 2 saat öğretmen planlama"}</span><small>Toplam 140 saat · 1. dönem {sciencePlan.firstTermHours} saat · 2. dönem {sciencePlan.secondTermHours} saat</small></div>}
        <dl><div><dt>Planlanan</dt><dd>{planned}/{sciencePlan ? sciencePlan.weeks.length : teachable.length}</dd></div><div><dt>Tamamlanan</dt><dd>{completed}/{sciencePlan ? sciencePlan.weeks.length : teachable.length}</dd></div><div><dt>{sciencePlan ? "Ders saati" : "İş günü"}</dt><dd>{sciencePlan ? sciencePlan.totalHours : teachable.reduce((sum, week) => sum + week.teachingDays, 0)}</dd></div></dl>
      </section>

      <div className="plan-controls single-control">
        <label><span>Sınıf</span><select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </div>

      <nav className="week-navigator" aria-label="Hafta navigasyonu">
        <button
          type="button"
          className="week-nav-button"
          onClick={() => setUserSelectedIndex(getPreviousWeekIndex(activeWeekIndex))}
          disabled={!canPrev}
          aria-label="Önceki hafta"
        >
          ‹
        </button>
        <div className="week-nav-info">
          <strong className="week-nav-title">
            {selectedWeek ? `${selectedWeek.number}. HAFTA · ${formatWeekDateRange(selectedWeek.startDate, getWeekDisplayEndDate(selectedWeek))}` : "—"}
          </strong>
          <span className="week-nav-meta">
            {closed
              ? (selectedWeek?.breakTitles.join(" · ") || "Ders yapılmayan hafta")
              : selectedWeek
              ? `${selectedWeek.teachingDays} iş günü${selectedAutomatic ? ` · ${selectedAutomatic.term}. Dönem` : ""}${selectedEntry?.completed ? " · ✓ Tamamlandı" : ""}`
              : ""}
          </span>
        </div>
        <button
          type="button"
          className="week-nav-button"
          onClick={() => setUserSelectedIndex(getNextWeekIndex(activeWeekIndex, weeks.length))}
          disabled={!canNext}
          aria-label="Sonraki hafta"
        >
          ›
        </button>
      </nav>

      {selectedWeek && (
        <section className="single-week-view" aria-label={`${selectedClass?.name} ${selectedWeek.number}. hafta planı`}>
          {closed ? (
            <div className="plan-week-card week-closed-card">
              <span className="week-closed-badge">Tatil / Ders Yapılmayan Dönem</span>
              <strong>{selectedWeek.breakTitles.join(" · ") || "Ders yapılmayan hafta"}</strong>
              <p>{fullDate.format(asDate(selectedWeek.startDate))} – {fullDate.format(asDate(selectedWeek.endDate))} · 0 iş günü</p>
            </div>
          ) : selectedAutomatic ? (
            <div className="plan-week-card">
              <ScienceDetailCards items={selectedAutomatic.items} className={selectedClass?.name ?? "—"} week={selectedWeek} />
              {(selectedEntry?.topic || selectedEntry?.note || selectedEntry?.completed) && (
                <div className="week-manual-overlay">
                  <strong>Manuel plan / öğretmen kaydı</strong>
                  {selectedEntry.completed && <span className="week-completed-badge">✓ Bu hafta tamamlandı</span>}
                  {selectedEntry.topic && <p className="week-manual-topic-text"><strong>Özel Konu:</strong> {selectedEntry.topic}</p>}
                  {selectedEntry.note && <p className="week-manual-note-text"><strong>Öğretmen Notu:</strong> {selectedEntry.note}</p>}
                </div>
              )}
              <div className="week-card-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => !closed && !isHistorical && openWeek(selectedWeek)}
                  disabled={closed || isHistorical}
                >
                  {isHistorical ? "Geçmiş kayıt" : selectedEntry?.topic || selectedEntry?.note ? "Öğretmen Notunu / Planı Düzenle" : "+ Not / Manuel Plan Ekle"}
                </button>
              </div>
            </div>
          ) : selectedEntry?.topic ? (
            <div className="plan-week-card manual-only-card">
              <div className="manual-card-header">
                <span className="kicker">MANUEL PLAN</span>
                <strong className="week-manual-topic">{selectedEntry.topic}</strong>
                {selectedEntry.completed && <span className="week-completed-badge">✓ Bu hafta tamamlandı</span>}
              </div>
              {selectedEntry.note && <p className="week-manual-note-text"><strong>Öğretmen Notu:</strong> {selectedEntry.note}</p>}
              <p className="week-card-meta">{selectedWeek.teachingDays} iş günü · {fullDate.format(asDate(selectedWeek.startDate))} – {fullDate.format(asDate(selectedWeek.endDate))}</p>
              <div className="week-card-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => !closed && !isHistorical && openWeek(selectedWeek)}
                  disabled={closed || isHistorical}
                >
                  {isHistorical ? "Geçmiş kayıt" : "Planı Düzenle"}
                </button>
              </div>
            </div>
          ) : (
            <div className="plan-week-card empty-week-card">
              <div className="empty-week-info">
                <strong>Bu hafta için konu girilmedi</strong>
                <p>{selectedWeek.teachingDays} iş günü · Bu sınıf için özel konu veya kazanım planı ekleyebilirsiniz.</p>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={() => !closed && !isHistorical && openWeek(selectedWeek)}
                disabled={closed || isHistorical}
              >
                {isHistorical ? "Geçmiş kayıt" : "+ Konu / Not Ekle"} <span>→</span>
              </button>
            </div>
          )}
        </section>
      )}
    </>}

    {calendarOpen && <CalendarSheet value={calendar} onClose={() => setCalendarOpen(false)} onSave={(next) => { onCalendar(next); setCalendarOpen(false); onNotify("İş takvimi güncellendi"); }} />}
    {entryDraft && <Sheet title={`${entryDraft.week.number}. hafta planı`} onClose={() => setEntryDraft(null)}><div className="week-form"><p>{fullDate.format(asDate(entryDraft.week.startDate))} – {fullDate.format(asDate(entryDraft.week.endDate))} · {entryDraft.week.teachingDays} iş günü</p>{scienceByWeek.get(entryDraft.week.startDate) && <ScienceDetailCards items={scienceByWeek.get(entryDraft.week.startDate)!.items} className={selectedClass?.name ?? "—"} week={entryDraft.week} />}<div className="manual-plan-editor"><strong>Manuel plan / öğretmen kaydı</strong><small>Buradaki değişiklik otomatik planı silmez; bu hafta için manuel görünüm olarak saklanır.</small></div><label>Konu / kazanım<textarea data-autofocus rows={3} value={entryDraft.topic} onChange={(event) => setEntryDraft({ ...entryDraft, topic: event.target.value })} placeholder="Bu hafta işlenecek konu" /></label><label>Öğretmen notu<textarea rows={3} value={entryDraft.note} onChange={(event) => setEntryDraft({ ...entryDraft, note: event.target.value })} placeholder="İsteğe bağlı not" /></label><label className="complete-check"><input type="checkbox" checked={entryDraft.completed} onChange={(event) => setEntryDraft({ ...entryDraft, completed: event.target.checked })} /> Bu hafta tamamlandı</label><button className="primary-action" type="button" onClick={saveWeek}>Haftayı kaydet <span>→</span></button></div></Sheet>}
  </>;
}

export function ScienceDetailCards({ items, className, week }: { items: SciencePlanItem[]; className: string; week: PlanWeek }) {
  const isAnyGrade8 = items.some((item) => item.allocation.grade === 8);
  return <section className="science-detail-list" aria-label={isAnyGrade8 ? "Haftanın kazanımları" : "Haftanın öğrenme çıktıları"}>{items.map((item, index) => {
    const allocation = item.allocation;
    const isGrade8 = allocation.grade === 8;
    const curricula = item.curricula?.length ? item.curricula : item.curriculum ? [item.curriculum] : [];
    const outcomeCodes = item.outcomeCodes?.length ? item.outcomeCodes : item.outcomeCode ? [item.outcomeCode] : [];
    const codeLabel = isGrade8 ? "Kazanım Kodu" : "Öğrenme Çıktısı Kodu";
    const descriptionHeading = isGrade8 ? "Kazanım" : "Öğrenme Çıktısı";

    return <article className="science-detail-card" key={`${item.outcomeCode ?? item.title}-${index}`}>
      <header><span>{item.unit === 0 ? "Uygulama" : `${item.unit}. Ünite`}</span><strong>{item.title}</strong></header>
      <dl>
        <div><dt>Hafta</dt><dd>{shortDate.format(asDate(week.startDate))} – {shortDate.format(asDate(week.endDate))}</dd></div>
        <div><dt>Sınıf</dt><dd>{className}</dd></div>
        <div><dt>Ünite</dt><dd>{item.unitTitle}</dd></div>
        <div><dt>{codeLabel}</dt><dd>{outcomeCodes.join(" · ") || "—"}</dd></div>
        <div className="detail-wide">
          <dt>{descriptionHeading}</dt>
          <dd>
            {curricula.length > 0 ? (
              curricula.map((entry) => (
                <div className="official-outcome-entry" key={entry.code}>
                  <div className="official-outcome-header">
                    <span className="official-outcome-code">{entry.code}</span>
                    {entry.officialSource && (
                      <a
                        href={entry.officialSource}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="official-source-link"
                      >
                        Resmî Kaynak ↗
                      </a>
                    )}
                  </div>
                  <p className="official-outcome-text">
                    {entry.officialDescription ?? "Resmî açıklama bulunamadı."}
                  </p>
                  {!isGrade8 && entry.processComponents && entry.processComponents.length > 0 && (
                    <div className="process-components-block">
                      <span className="process-components-title">Süreç Bileşenleri</span>
                      <ol className="process-components-list">
                        {entry.processComponents.map((comp, compIdx) => (
                          <li key={compIdx}>{comp}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <span className="official-description-missing">Resmî açıklama bulunamadı.</span>
            )}
          </dd>
        </div>
        <div><dt>Bu hafta</dt><dd>{allocation.allocatedHours} saat</dd></div>
        <div><dt>Toplam plan</dt><dd>{allocation.plannedTotalHours} saat</dd></div>
        <div><dt>Önce işlenen</dt><dd>{allocation.completedBeforeHours} saat</dd></div>
        <div><dt>Hafta sonu</dt><dd>{allocation.completedAfterHours} saat</dd></div>
        {allocation.teacherNote && <div className="detail-wide"><dt>Öğretmen notu</dt><dd>{allocation.teacherNote}</dd></div>}
      </dl>
    </article>;
  })}</section>;
}

function CalendarSheet({ value, onClose, onSave }: { value: WorkCalendar; onClose: () => void; onSave: (calendar: WorkCalendar) => void }) {
  const [draft, setDraft] = useState<WorkCalendar>({ ...value, breaks: value.breaks.map((item) => ({ ...item })) });
  const [title, setTitle] = useState(""); const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState(""); const [error, setError] = useState("");
  function addBreak() {
    if (!title.trim() || !startDate || !endDate || startDate > endDate) { setError("Tatil adı ve geçerli tarih aralığı girin."); return; }
    const item: CalendarBreak = { id: crypto.randomUUID(), title: title.trim(), startDate, endDate };
    setDraft({ ...draft, breaks: [...draft.breaks, item].sort((a, b) => a.startDate.localeCompare(b.startDate)) }); setTitle(""); setStartDate(""); setEndDate(""); setError("");
  }
  function submit() {
    if (!isSupportedAcademicYear(draft.schoolYear)) { setError("Bu eğitim yılı için resmî MEB çalışma takvimi henüz sisteme eklenmemiştir."); return; }
    if (!isValidWorkCalendar(draft)) { setError("Eğitim yılı ile başlangıç ve bitiş tarihlerini kontrol edin."); return; }
    onSave(draft);
  }
  return <Sheet title="İş takvimini düzenle" onClose={onClose}><div className="calendar-form"><p>Yıllık plan haftaları bu tarihlere göre otomatik oluşturulur. Tatil günleri iş günü sayısından düşülür.</p><div className="calendar-main-fields"><label>Eğitim yılı<input data-autofocus value={draft.schoolYear} onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })} placeholder="2026-2027" /></label><label>Başlangıç<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label>Bitiş<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label></div><div className="break-editor"><strong>Tatil / ders yapılmayan dönem</strong><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Örn. Ara tatil" /><div><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Tatil başlangıcı" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Tatil bitişi" /><button type="button" onClick={addBreak}>Ekle</button></div></div>{draft.breaks.length > 0 && <div className="break-list">{draft.breaks.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{shortDate.format(asDate(item.startDate))} – {shortDate.format(asDate(item.endDate))}</small></span><button type="button" onClick={() => setDraft({ ...draft, breaks: draft.breaks.filter((entry) => entry.id !== item.id) })} aria-label={`${item.title} dönemini sil`}>Sil</button></div>)}</div>}{error && <p className="calendar-error">{error}</p>}<button className="primary-action" type="button" onClick={submit}>Takvimi uygula <span>→</span></button></div></Sheet>;
}
