"use client";

import { useState } from "react";
import type { ScheduleWeekday, SchoolClass, WeeklyScheduleEntry } from "../lib/types";
import {
  entriesForWeekday,
  formatLessonLabel,
  MAX_SCHEDULE_LESSON_INPUT,
  SCHEDULE_WEEKDAYS,
  validateScheduleInput,
  WEEKDAY_LABELS,
} from "../lib/weekly-schedule";
import { activeStudentCount } from "../lib/data";
import { Sheet } from "./Sheet";

export interface ScheduleDraft {
  id?: string;
  classId: string;
  weekday: ScheduleWeekday;
  lessonNumber: string;
}

export function emptyScheduleDraft(defaultClassId: string): ScheduleDraft {
  return { classId: defaultClassId, weekday: 1, lessonNumber: "" };
}

export function ScheduleView({ classes, entries, onBack, onAdd, onUpdate, onDelete }: {
  classes: SchoolClass[];
  entries: WeeklyScheduleEntry[];
  onBack: () => void;
  onAdd: (input: { classId: string; weekday: ScheduleWeekday; lessonNumber: number }) => void;
  onUpdate: (id: string, patch: { classId: string; weekday: ScheduleWeekday; lessonNumber: number }) => void;
  onDelete: (id: string) => void;
}) {
  const activeClasses = classes.filter((item) => !item.archived);
  const [day, setDay] = useState<ScheduleWeekday>(1);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [formError, setFormError] = useState("");
  const dayEntries = entriesForWeekday(entries, day);
  const byId = new Map(classes.map((item) => [item.id, item]));

  function openAdd() {
    setFormError("");
    setDraft(emptyScheduleDraft(activeClasses[0]?.id ?? ""));
  }
  function openEdit(entry: WeeklyScheduleEntry) {
    setFormError("");
    setDraft({ id: entry.id, classId: entry.classId, weekday: entry.weekday, lessonNumber: String(entry.lessonNumber) });
  }
  function saveDraft() {
    if (!draft) return;
    const lessonNumber = Number(draft.lessonNumber);
    const error = validateScheduleInput(entries, classes, { classId: draft.classId, weekday: draft.weekday, lessonNumber }, draft.id);
    if (error) { setFormError(error); return; }
    const clean = { classId: draft.classId, weekday: draft.weekday, lessonNumber };
    if (draft.id) onUpdate(draft.id, clean);
    else onAdd(clean);
    setDraft(null);
    setFormError("");
  }
  function removeEntry(entry: WeeklyScheduleEntry) {
    if (window.confirm(`${WEEKDAY_LABELS[entry.weekday]} ${formatLessonLabel(entry.lessonNumber)} kaydı silinsin mi?`)) {
      onDelete(entry.id);
    }
  }

  return <>
    <header className="page-header"><button className="back-button" onClick={onBack} aria-label="Geri">←</button><div><p className="eyebrow">HAFTALIK PROGRAM</p><h1>Ders Programı</h1></div></header>
    <div className="schedule-day-tabs" role="tablist" aria-label="Haftanın günleri">
      {SCHEDULE_WEEKDAYS.map((value) => <button key={value} type="button" role="tab" aria-selected={day === value} className={day === value ? "selected" : ""} onClick={() => setDay(value)}>{WEEKDAY_LABELS[value]}</button>)}
    </div>
    {dayEntries.length ? <div className="class-list schedule-list">{dayEntries.map((entry) => {
      const schoolClass = byId.get(entry.classId);
      return <div className="class-row-wrap schedule-row-wrap" key={entry.id}><div className="class-row schedule-row"><span className="class-name">{formatLessonLabel(entry.lessonNumber)}</span><span className="class-meta">{schoolClass ? `${schoolClass.name} · ${activeStudentCount(schoolClass)} öğrenci` : "Silinmiş sınıf"}</span></div><div className="schedule-row-actions"><button type="button" className="row-edit" onClick={() => openEdit(entry)} aria-label="Ders kaydını düzenle">•••</button><button type="button" className="row-delete" onClick={() => removeEntry(entry)} aria-label="Ders kaydını sil">Sil</button></div></div>;
    })}</div> : <div className="empty-state" role="status"><strong>Bu gün için ders kaydı yok</strong><p>{WEEKDAY_LABELS[day]} gününe ilk dersi ekleyin.</p></div>}
    <div className="class-tool-row schedule-add-row"><button type="button" className="secondary-action" onClick={openAdd} disabled={!activeClasses.length}>+ Ders ekle</button></div>
    {!activeClasses.length && <p className="archive-note">Ders eklemek için önce aktif bir sınıf oluşturun.</p>}
    {draft && <Sheet title={draft.id ? "Ders kaydını düzenle" : "Ders ekle"} onClose={() => setDraft(null)}><div className="form-stack">
      <label><span>Gün</span><select data-autofocus value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) as ScheduleWeekday })}>{SCHEDULE_WEEKDAYS.map((value) => <option key={value} value={value}>{WEEKDAY_LABELS[value]}</option>)}</select></label>
      <label><span>Ders numarası</span><input type="number" inputMode="numeric" min={1} max={MAX_SCHEDULE_LESSON_INPUT} value={draft.lessonNumber} onChange={(event) => setDraft({ ...draft, lessonNumber: event.target.value })} placeholder="Örn. 3" /></label>
      <label><span>Sınıf</span><select value={draft.classId} onChange={(event) => setDraft({ ...draft, classId: event.target.value })}>{activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {formError && <p className="delete-warning" role="alert">{formError}</p>}
      <button className="primary-action" type="button" onClick={saveDraft}>Kaydet <span>→</span></button>
    </div></Sheet>}
  </>;
}

export function formatScheduleRowLabel(entry: WeeklyScheduleEntry, classes: SchoolClass[]): string {
  const schoolClass = classes.find((item) => item.id === entry.classId);
  return `${formatLessonLabel(entry.lessonNumber)} · ${schoolClass ? schoolClass.name : "?"}`;
}

