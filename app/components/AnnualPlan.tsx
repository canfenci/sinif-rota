import { useMemo, useState } from "react";
import { buildPlanWeeks, isValidWorkCalendar, type PlanWeek } from "../lib/planning";
import type { AnnualPlanEntry, CalendarBreak, SchoolClass, WorkCalendar } from "../lib/types";
import { Sheet } from "./Sheet";

type EntryDraft = { week: PlanWeek; topic: string; note: string; completed: boolean };

const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function AnnualPlan({ classes, calendar, entries, onCalendar, onEntry, onNotify }: {
  classes: SchoolClass[];
  calendar: WorkCalendar;
  entries: AnnualPlanEntry[];
  onCalendar: (calendar: WorkCalendar) => void;
  onEntry: (classId: string, weekStart: string, patch: Pick<AnnualPlanEntry, "topic" | "note" | "completed">) => void;
  onNotify: (message: string) => void;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "planned" | "completed" | "empty">("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0];
  const selectedClassId = selectedClass?.id ?? "";
  const weeks = useMemo(() => buildPlanWeeks(calendar), [calendar]);
  const planEntries = entries.filter((item) => item.classId === selectedClassId && item.schoolYear === calendar.schoolYear);
  const byWeek = new Map(planEntries.map((item) => [item.weekStart, item]));
  const teachable = weeks.filter((week) => week.teachingDays > 0);
  const completed = teachable.filter((week) => byWeek.get(week.startDate)?.completed).length;
  const planned = teachable.filter((week) => byWeek.get(week.startDate)?.topic).length;
  const visible = weeks.filter((week) => {
    const entry = byWeek.get(week.startDate);
    if (filter === "planned") return Boolean(entry?.topic) && !entry?.completed;
    if (filter === "completed") return Boolean(entry?.completed);
    if (filter === "empty") return week.teachingDays > 0 && !entry?.topic;
    return true;
  });

  function openWeek(week: PlanWeek) {
    const entry = byWeek.get(week.startDate);
    setEntryDraft({ week, topic: entry?.topic ?? "", note: entry?.note ?? "", completed: entry?.completed ?? false });
  }
  function saveWeek() {
    if (!entryDraft || !selectedClassId) return;
    onEntry(selectedClassId, entryDraft.week.startDate, { topic: entryDraft.topic, note: entryDraft.note, completed: entryDraft.completed });
    setEntryDraft(null); onNotify("Haftalık plan kaydedildi");
  }

  return <>
    <header className="page-header"><div className="brand-mark" aria-label="Sınıf Rota">SR</div><div><p className="eyebrow">{calendar.schoolYear} EĞİTİM YILI</p><h1>Yıllık Plan</h1></div></header>
    {!classes.length ? <div className="plan-empty"><strong>Plan için aktif sınıf yok</strong><p>Önce Sınıflar bölümünden bir sınıf oluşturun.</p></div> : <>
      <section className="plan-summary">
        <div><p className="kicker">İŞ TAKVİMİNE GÖRE</p><h2>Hafta hafta<br />ders akışı.</h2></div>
        <button type="button" onClick={() => setCalendarOpen(true)}>Takvimi düzenle</button>
        <dl><div><dt>Planlanan</dt><dd>{planned}/{teachable.length}</dd></div><div><dt>Tamamlanan</dt><dd>{completed}/{teachable.length}</dd></div><div><dt>İş günü</dt><dd>{teachable.reduce((sum, week) => sum + week.teachingDays, 0)}</dd></div></dl>
      </section>
      <div className="plan-controls">
        <label><span>Sınıf</span><select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>Göster</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Tüm haftalar</option><option value="planned">Planlanan</option><option value="completed">Tamamlanan</option><option value="empty">Konu girilmeyen</option></select></label>
      </div>
      <div className="calendar-note"><strong>{fullDate.format(asDate(calendar.startDate))} – {fullDate.format(asDate(calendar.endDate))}</strong><span>Başlangıç, bitiş ve tatil dönemleri iş takviminden hesaplanır.</span></div>
      <section className="week-list" aria-label={`${selectedClass?.name} yıllık planı`}>
        {visible.map((week) => {
          const entry = byWeek.get(week.startDate); const closed = week.teachingDays === 0;
          return <article className={`week-row ${closed ? "week-closed" : ""} ${entry?.completed ? "week-completed" : ""}`} key={week.startDate}>
            <button type="button" onClick={() => !closed && openWeek(week)} disabled={closed}>
              <span className="week-number">{String(week.number).padStart(2, "0")}</span>
              <span className="week-copy"><small>{shortDate.format(asDate(week.startDate))} – {shortDate.format(asDate(week.endDate))} · {week.teachingDays} iş günü</small><strong>{closed ? week.breakTitles.join(" · ") || "Ders yapılmayan hafta" : entry?.topic || "Konu ekleyin"}</strong>{entry?.note && <em>{entry.note}</em>}</span>
              <span className="week-state">{entry?.completed ? "✓ Tamam" : closed ? "Tatil" : entry?.topic ? "Planlandı" : "+ Ekle"}</span>
            </button>
          </article>;
        })}
        {!visible.length && <div className="plan-empty"><strong>Bu filtrede hafta yok</strong><p>Başka bir görünüm seçebilirsiniz.</p></div>}
      </section>
    </>}
    {calendarOpen && <CalendarSheet value={calendar} onClose={() => setCalendarOpen(false)} onSave={(next) => { onCalendar(next); setCalendarOpen(false); onNotify("İş takvimi güncellendi"); }} />}
    {entryDraft && <Sheet title={`${entryDraft.week.number}. hafta planı`} onClose={() => setEntryDraft(null)}><div className="week-form"><p>{fullDate.format(asDate(entryDraft.week.startDate))} – {fullDate.format(asDate(entryDraft.week.endDate))} · {entryDraft.week.teachingDays} iş günü</p><label>Konu / kazanım<textarea data-autofocus rows={3} value={entryDraft.topic} onChange={(event) => setEntryDraft({ ...entryDraft, topic: event.target.value })} placeholder="Bu hafta işlenecek konu" /></label><label>Öğretmen notu<textarea rows={3} value={entryDraft.note} onChange={(event) => setEntryDraft({ ...entryDraft, note: event.target.value })} placeholder="İsteğe bağlı not" /></label><label className="complete-check"><input type="checkbox" checked={entryDraft.completed} onChange={(event) => setEntryDraft({ ...entryDraft, completed: event.target.checked })} /> Bu hafta tamamlandı</label><button className="primary-action" type="button" onClick={saveWeek}>Haftayı kaydet <span>→</span></button></div></Sheet>}
  </>;
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
    if (!isValidWorkCalendar(draft)) { setError("Eğitim yılı ile başlangıç ve bitiş tarihlerini kontrol edin."); return; }
    onSave(draft);
  }
  return <Sheet title="İş takvimini düzenle" onClose={onClose}><div className="calendar-form"><p>Yıllık plan haftaları bu tarihlere göre otomatik oluşturulur. Tatil günleri iş günü sayısından düşülür.</p><div className="calendar-main-fields"><label>Eğitim yılı<input data-autofocus value={draft.schoolYear} onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })} placeholder="2026-2027" /></label><label>Başlangıç<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label>Bitiş<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label></div><div className="break-editor"><strong>Tatil / ders yapılmayan dönem</strong><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Örn. Ara tatil" /><div><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Tatil başlangıcı" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Tatil bitişi" /><button type="button" onClick={addBreak}>Ekle</button></div></div>{draft.breaks.length > 0 && <div className="break-list">{draft.breaks.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{shortDate.format(asDate(item.startDate))} – {shortDate.format(asDate(item.endDate))}</small></span><button type="button" onClick={() => setDraft({ ...draft, breaks: draft.breaks.filter((entry) => entry.id !== item.id) })} aria-label={`${item.title} dönemini sil`}>Sil</button></div>)}</div>}{error && <p className="calendar-error">{error}</p>}<button className="primary-action" type="button" onClick={submit}>Takvimi uygula <span>→</span></button></div></Sheet>;
}
