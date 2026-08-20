"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./components/Sheet";
import { StatusSelector } from "./components/StatusSelector";
import { StudentImport } from "./components/StudentImport";
import { activeStudentCount, applyBulkStudentAction, classNameExists, duplicateClass, nextStudentNumber, removeClass, removeStudent, studentNumberExists, transferConflicts, type BulkStudentAction } from "./lib/data";
import { seedData } from "./lib/seed";
import { checkTypes, studentStats } from "./lib/stats";
import { localRepository } from "./lib/storage";
import type { AppData, CheckStatus, CheckType, SchoolClass, Student } from "./lib/types";

type View = "home" | "classes" | "class" | "quick" | "student" | "import";
type EditTarget = { kind: "class"; item?: SchoolClass } | { kind: "student"; item?: Student };
type BulkRequest = { action: BulkStudentAction; studentIds: string[] };

export default function Home() {
  const [data, setData] = useState<AppData>(seedData);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [classId, setClassId] = useState(seedData.classes[0].id);
  const [studentId, setStudentId] = useState("");
  const [checkType, setCheckType] = useState<CheckType>("Ödev");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus> | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [toast, setToast] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<AppData | null>(null);
  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
  const [bulkVersion, setBulkVersion] = useState(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setData(localRepository.load());
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) localRepository.save(data); }, [data, ready]);

  const schoolClass = data.classes.find((item) => item.id === classId) ?? data.classes[0];
  const activeClasses = data.classes.filter((item) => !item.archived);
  const student = schoolClass?.students.find((item) => item.id === studentId);
  const recent = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const counts = useMemo(() => statuses ? Object.values(statuses).reduce((acc, value) => ({ ...acc, [value]: acc[value] + 1 }), { complete: 0, partial: 0, missing: 0, absent: 0 }) : null, [statuses]);

  function navigate(next: View) { setView(next); if (next !== "quick") setStatuses(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function showToast(message: string, undo?: AppData) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message); setUndoSnapshot(undo ?? null);
    toastTimer.current = window.setTimeout(() => { setToast(""); setUndoSnapshot(null); }, undo ? 6000 : 2400);
  }
  function undoLast() {
    if (!undoSnapshot) return;
    setData(undoSnapshot); setUndoSnapshot(null); setToast("İşlem geri alındı");
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }
  function openEdit(target: EditTarget) {
    setEditTarget(target);
    setDraftName(target.item?.name ?? "");
    setDraftNumber(target.kind === "student" ? String(target.item?.number ?? nextStudentNumber(schoolClass?.students ?? [])) : "");
    setDeleteArmed(false);
  }

  function saveEdit() {
    const name = draftName.trim();
    if (!name) { showToast("Ad alanı boş bırakılamaz"); return; }
    if (editTarget?.kind === "class") {
      if (classNameExists(data.classes, name, editTarget.item?.id)) { showToast("Bu sınıf adı zaten kullanılıyor"); return; }
      if (editTarget.item) {
        const editedId = editTarget.item.id;
        setData((current) => ({
          classes: current.classes.map((item) => item.id === editedId ? { ...item, name } : item),
          sessions: current.sessions.map((session) => session.classId === editedId ? { ...session, className: name } : session),
        }));
      } else {
        const id = crypto.randomUUID();
        setData((current) => ({ ...current, classes: [...current.classes, { id, name, students: [] }] }));
        setClassId(id);
      }
    } else if (editTarget?.kind === "student" && schoolClass) {
      const number = Number(draftNumber);
      if (!Number.isInteger(number) || number < 1 || number > 999) { showToast("Geçerli bir öğrenci numarası girin"); return; }
      if (studentNumberExists(schoolClass.students, number, editTarget.item?.id)) { showToast("Bu öğrenci numarası zaten kullanılıyor"); return; }
      const editedId = editTarget.item?.id;
      setData((current) => ({ ...current, classes: current.classes.map((item) => item.id !== schoolClass.id ? item : {
        ...item,
        students: (editedId ? item.students.map((person) => person.id === editedId ? { ...person, name, number } : person) : [...item.students, { id: crypto.randomUUID(), name, number }]).sort((a, b) => a.number - b.number),
      }) }));
    }
    setEditTarget(null); showToast("Değişiklik kaydedildi");
  }

  function deleteTarget() {
    if (!editTarget?.item) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    if (editTarget.kind === "class") {
      const deletedId = editTarget.item.id;
      const nextClass = data.classes.find((item) => item.id !== deletedId);
      setData((current) => removeClass(current, deletedId));
      setClassId(nextClass?.id ?? "");
      navigate("classes");
    } else if (schoolClass) {
      setData((current) => removeStudent(current, schoolClass.id, editTarget.item!.id));
    }
    setEditTarget(null); showToast("Kayıt silindi");
  }

  function startCheck() {
    const checkClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0];
    const activeStudents = checkClass?.students.filter((student) => student.active !== false) ?? [];
    if (!checkClass || !activeStudents.length) { showToast("Kontrol için önce aktif öğrenci ekleyin"); return; }
    if (checkClass.id !== classId) setClassId(checkClass.id);
    setStatuses(Object.fromEntries(activeStudents.map((person) => [person.id, "complete"]))); window.scrollTo(0, 0);
  }
  function saveCheck() {
    const checkClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0];
    if (!checkClass || !statuses) return;
    setData((current) => ({ ...current, sessions: [...current.sessions, { id: crypto.randomUUID(), classId: checkClass.id, className: checkClass.name, type: checkType, date: new Date().toISOString(), statuses }] }));
    showToast("Kontrol kaydedildi"); navigate("class");
  }
  function leaveQuickCheck() {
    if (!statuses || window.confirm("Kaydedilmemiş kontrol silinsin mi?")) {
      if (statuses) setStatuses(null); else navigate("home");
    }
  }
  function importStudents(students: Student[], summary: { added: number; updated: number }) {
    if (!schoolClass) return;
    setData((current) => ({ ...current, classes: current.classes.map((item) => item.id === schoolClass.id ? { ...item, students } : item) }));
    navigate("class");
    showToast(`${summary.added} öğrenci eklendi${summary.updated ? ` · ${summary.updated} güncellendi` : ""}`);
  }
  function runBulkAction(targetClassId?: string) {
    if (!schoolClass || !bulkRequest) return;
    const before = data;
    const result = applyBulkStudentAction(data, schoolClass.id, bulkRequest.studentIds, bulkRequest.action, targetClassId, () => crypto.randomUUID());
    if (!result.processed) { showToast("İşlenebilecek öğrenci bulunamadı"); return; }
    setData(result.data); setBulkRequest(null); setBulkVersion((value) => value + 1);
    const labels: Record<BulkStudentAction, string> = { delete: "silindi", activate: "aktif yapıldı", deactivate: "pasif yapıldı", move: "taşındı", copy: "kopyalandı" };
    showToast(`${result.processed} öğrenci ${labels[bulkRequest.action]}${result.skipped ? ` · ${result.skipped} atlandı` : ""}`, before);
  }
  function duplicateSelectedClass() {
    if (editTarget?.kind !== "class" || !editTarget.item) return;
    const before = data;
    const result = duplicateClass(data, editTarget.item.id, () => crypto.randomUUID());
    if (!result.classId) return;
    setData(result.data); setClassId(result.classId); setEditTarget(null); navigate("class");
    showToast("Sınıf ve öğrenci listesi çoğaltıldı", before);
  }
  function toggleClassArchive() {
    if (editTarget?.kind !== "class" || !editTarget.item) return;
    const before = data; const targetId = editTarget.item.id; const archived = !editTarget.item.archived;
    setData((current) => ({ ...current, classes: current.classes.map((item) => item.id === targetId ? { ...item, archived } : item) }));
    setEditTarget(null); navigate("classes"); showToast(archived ? "Sınıf arşivlendi" : "Sınıf yeniden etkinleştirildi", before);
  }

  return <main className={`app-shell ${view === "quick" && statuses ? "quick-open" : ""}`}>
    {view === "home" && <HomeView classes={activeClasses} recent={recent} onQuick={() => navigate("quick")} onClass={(id) => { setClassId(id); navigate("class"); }} />}
    {view === "classes" && <ClassesView classes={data.classes} onAdd={() => openEdit({ kind: "class" })} onOpen={(id) => { setClassId(id); navigate("class"); }} onEdit={(item) => openEdit({ kind: "class", item })} />}
    {view === "class" && schoolClass && <ClassView key={`${schoolClass.id}-${bulkVersion}`} item={schoolClass} onBack={() => navigate("classes")} onQuick={() => navigate("quick")} onAdd={() => openEdit({ kind: "student" })} onImport={() => navigate("import")} onBulk={(action, studentIds) => setBulkRequest({ action, studentIds })} onOpen={(id) => { setStudentId(id); navigate("student"); }} onEdit={(item) => openEdit({ kind: "student", item })} />}
    {view === "quick" && <QuickView classes={activeClasses} classId={classId} type={checkType} statuses={statuses} counts={counts} onClass={setClassId} onType={setCheckType} onStart={startCheck} onChange={(id, status) => setStatuses((current) => current ? { ...current, [id]: status } : current)} onBack={leaveQuickCheck} onSave={saveCheck} />}
    {view === "student" && student && <StudentView student={student} schoolClass={schoolClass} sessions={data.sessions} onBack={() => navigate("class")} />}
    {view === "import" && schoolClass && <StudentImport schoolClass={schoolClass} onBack={() => navigate("class")} onImport={importStudents} />}

    {view !== "quick" && view !== "student" && view !== "import" && <nav className="bottom-nav" aria-label="Ana menü"><button className={view === "home" ? "nav-active" : ""} onClick={() => navigate("home")}>Ana Sayfa</button><button className={view !== "home" ? "nav-active" : ""} onClick={() => navigate("classes")}>Sınıflar</button></nav>}
    {editTarget && <Sheet title={`${editTarget.item ? "Düzenle" : "Yeni"} ${editTarget.kind === "class" ? "sınıf" : "öğrenci"}`} onClose={() => setEditTarget(null)}><div className="form-stack"><label>Adı<input data-autofocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={editTarget.kind === "class" ? "Örn. 5-F" : "Ad Soyad"} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>{editTarget.kind === "student" && <label>Okul numarası<input inputMode="numeric" min="1" max="999" type="number" value={draftNumber} onChange={(event) => setDraftNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>}<button className="primary-action" onClick={saveEdit}>Kaydet <span>→</span></button>{editTarget.kind === "class" && editTarget.item && <div className="class-record-actions"><button type="button" onClick={duplicateSelectedClass}>Sınıfı çoğalt</button><button type="button" onClick={toggleClassArchive}>{editTarget.item.archived ? "Arşivden çıkar" : "Sınıfı arşivle"}</button></div>}{editTarget.item && <>{deleteArmed && <p className="delete-warning">Bu işlem ilgili geçmiş kayıtları da kalıcı olarak siler.</p>}<button className={`danger-action ${deleteArmed ? "danger-confirm" : ""}`} onClick={deleteTarget}>{deleteArmed ? "Silme işlemini onayla" : "Kaydı sil"}</button></>}</div></Sheet>}
    {bulkRequest && schoolClass && <BulkActionSheet request={bulkRequest} source={schoolClass} classes={activeClasses} onClose={() => setBulkRequest(null)} onConfirm={runBulkAction} />}
    {toast && <div className="toast" role="status"><span>✓ {toast}</span>{undoSnapshot && <button type="button" onClick={undoLast}>Geri al</button>}</div>}
  </main>;
}

function AppHeader({ eyebrow, title, back }: { eyebrow: string; title: string; back?: () => void }) {
  return <header className="page-header">{back ? <button className="back-button" onClick={back} aria-label="Geri">←</button> : <div className="brand-mark" aria-label="Sınıf Rota">SR</div>}<div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></header>;
}

function HomeView({ classes, recent, onQuick, onClass }: { classes: SchoolClass[]; recent: AppData["sessions"]; onQuick: () => void; onClass: (id: string) => void }) {
  const date = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
  return <><AppHeader eyebrow={date.toLocaleUpperCase("tr-TR")} title="Günaydın, Öğretmenim" /><section className="hero"><p className="kicker">GÜNLÜK TAKİP</p><h2>Sınıf kontrolüne<br />hemen başlayın.</h2><button className="primary-action" onClick={onQuick}>Hızlı Kontrol <span>→</span></button></section><section className="content-section"><div className="section-heading"><div><p className="kicker">SINIFLAR</p><h3>Bugün nereden devam?</h3></div></div>{classes.length ? <div className="class-list">{classes.slice(0, 3).map((item) => <button className="class-row" key={item.id} onClick={() => onClass(item.id)}><span className="class-name">{item.name}</span><span className="class-meta">{activeStudentCount(item)} aktif öğrenci</span><span className="arrow">→</span></button>)}</div> : <EmptyState title="Henüz sınıf yok" text="Sınıflar bölümünden ilk sınıfınızı ekleyin." />}</section>{recent.length > 0 && <section className="content-section compact"><p className="kicker">SON KONTROLLER</p>{recent.map((item) => <div className="recent-row" key={item.id}><strong>{item.className}</strong><span>{item.type}</span><time dateTime={item.date}>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(item.date))}</time></div>)}</section>}</>;
}

function ClassesView({ classes, onAdd, onOpen, onEdit }: { classes: SchoolClass[]; onAdd: () => void; onOpen: (id: string) => void; onEdit: (item: SchoolClass) => void }) {
  const active = classes.filter((item) => !item.archived); const archived = classes.filter((item) => item.archived);
  const rows = (items: SchoolClass[]) => <div className="class-list management-list">{items.map((item) => <div className="class-row-wrap" key={item.id}><button className="class-row" onClick={() => onOpen(item.id)}><span className="class-name">{item.name}</span><span className="class-meta">{activeStudentCount(item)} aktif · {item.students.length} toplam</span><span className="arrow">→</span></button><button className="row-edit" onClick={() => onEdit(item)} aria-label={`${item.name} sınıfını düzenle`}>•••</button></div>)}</div>;
  return <><AppHeader eyebrow="SINIF YÖNETİMİ" title="Sınıflar" /><div className="title-action"><p>{active.length} aktif sınıf · {active.reduce((sum, item) => sum + activeStudentCount(item), 0)} öğrenci</p><button onClick={onAdd}>+ Sınıf ekle</button></div>{active.length ? rows(active) : <EmptyState title="Aktif sınıf yok" text="Yeni bir sınıf oluşturabilir veya arşivden çıkarabilirsiniz." />}{archived.length > 0 && <section className="archived-classes"><p className="kicker">ARŞİVLENEN SINIFLAR · {archived.length}</p>{rows(archived)}</section>}</>;
}

function ClassView({ item, onBack, onQuick, onAdd, onImport, onBulk, onOpen, onEdit }: { item: SchoolClass; onBack: () => void; onQuick: () => void; onAdd: () => void; onImport: () => void; onBulk: (action: BulkStudentAction, ids: string[]) => void; onOpen: (id: string) => void; onEdit: (item: Student) => void }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState<"number" | "name">("number"); const [filter, setFilter] = useState<"active" | "inactive" | "all">("active"); const [selecting, setSelecting] = useState(false); const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = item.students.filter((student) => filter === "all" || (filter === "active" ? student.active !== false : student.active === false)).filter((student) => !query.trim() || `${student.number} ${student.name}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))).sort((a, b) => sort === "number" ? a.number - b.number : a.name.localeCompare(b.name, "tr"));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allVisibleSelected = visible.length > 0 && visible.every((student) => selected.has(student.id));
  return <><AppHeader eyebrow={`${activeStudentCount(item)} AKTİF · ${item.students.length} TOPLAM`} title={item.name} back={onBack} /><div className="class-actions"><button className="primary-action" onClick={onQuick} disabled={item.archived || !activeStudentCount(item)}>Kontrol başlat <span>→</span></button><div className="class-tool-row"><button className="secondary-action" onClick={onAdd}>+ Öğrenci</button><button className="secondary-action" onClick={onImport}>Dosyadan aktar</button></div></div>{item.archived && <p className="archive-note">Bu sınıf arşivde. Kontrol başlatmak için sınıfı yeniden etkinleştirin.</p>}{item.students.length ? <><div className="student-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Öğrenci ara" aria-label="Öğrenci ara" /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Öğrenci durumu"><option value="active">Aktif</option><option value="inactive">Pasif</option><option value="all">Tümü</option></select><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sıralama"><option value="number">Numaraya göre</option><option value="name">Ada göre</option></select><button type="button" className={selecting ? "selected" : ""} onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }}>{selecting ? "Vazgeç" : "Seç"}</button></div><div className="student-list"><div className="list-caption"><span>{selecting ? <button type="button" onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((student) => student.id)))}>{allVisibleSelected ? "Seçimi kaldır" : "Görünenleri seç"}</button> : "NO / ÖĞRENCİ"}</span><span>{visible.length} KAYIT</span></div>{visible.map((person) => <div className={`student-row ${selecting ? "selection-open" : ""} ${person.active === false ? "inactive-student" : ""}`} key={person.id}>{selecting && <button type="button" className="student-select" aria-pressed={selected.has(person.id)} aria-label={`${person.name} seç`} onClick={() => toggle(person.id)}>{selected.has(person.id) ? "✓" : ""}</button>}<button className="student-open" onClick={() => selecting ? toggle(person.id) : onOpen(person.id)}><span className="student-no">{String(person.number).padStart(2, "0")}</span><span className="student-name">{person.name}{person.active === false && <small>Pasif</small>}</span><span className="student-detail">{selecting ? "" : "İstatistik →"}</span></button>{!selecting && <button className="row-edit" onClick={() => onEdit(person)} aria-label={`${person.name} düzenle`}>•••</button>}</div>)}{!visible.length && <EmptyState title="Öğrenci bulunamadı" text="Arama veya durum filtresini değiştirin." />}</div>{selecting && selected.size > 0 && <div className="bulk-dock"><strong>{selected.size} seçili</strong><div><button onClick={() => onBulk("move", [...selected])}>Taşı</button><button onClick={() => onBulk("copy", [...selected])}>Kopyala</button><button onClick={() => onBulk("activate", [...selected])}>Aktif</button><button onClick={() => onBulk("deactivate", [...selected])}>Pasif</button><button className="bulk-delete" onClick={() => onBulk("delete", [...selected])}>Sil</button></div></div>}</> : <EmptyState title="Bu sınıfta öğrenci yok" text="Tek tek ekleyebilir veya Excel/CSV dosyasından aktarabilirsiniz." />}</>;
}

function QuickView({ classes, classId, type, statuses, counts, onClass, onType, onStart, onChange, onBack, onSave }: { classes: SchoolClass[]; classId: string; type: CheckType; statuses: Record<string, CheckStatus> | null; counts: Record<CheckStatus, number> | null; onClass: (id: string) => void; onType: (type: CheckType) => void; onStart: () => void; onChange: (id: string, status: CheckStatus) => void; onBack: () => void; onSave: () => void }) {
  if (!classes.length) return <><AppHeader eyebrow="HIZLI KONTROL" title="Önce sınıf ekleyin" back={onBack} /><EmptyState title="Kontrol başlatılamıyor" text="Sınıflar bölümünden bir sınıf ve öğrenci listesi oluşturun." /></>;
  const item = classes.find((entry) => entry.id === classId) ?? classes[0];
  const activeStudents = item.students.filter((student) => student.active !== false);
  if (!statuses) return <><AppHeader eyebrow="2 ADIMDA HAZIR" title="Hızlı Kontrol" back={onBack} /><section className="setup-panel"><label><span>1 · Sınıfı seçin</span><select value={classId} onChange={(event) => onClass(event.target.value)}>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {activeStudentCount(entry)} aktif öğrenci</option>)}</select></label><div><span className="field-label">2 · Kontrol türü</span><div className="type-grid">{checkTypes.map((entry) => <button className={type === entry ? "selected" : ""} key={entry} onClick={() => onType(entry)}>{entry}</button>)}</div></div><div className="default-note"><strong>Herkes “Tam” başlayacak.</strong><p>Yalnızca aktif öğrenciler kontrole alınır; istisnaları değiştirmeniz yeterli.</p></div><button className="primary-action" onClick={onStart} disabled={!activeStudents.length}>Kontrolü başlat <span>→</span></button></section></>;
  return <><div className="quick-top"><button className="back-button" onClick={onBack} aria-label="Kontrol kurulumuna dön">←</button><div><p className="eyebrow">{type.toLocaleUpperCase("tr-TR")} KONTROLÜ</p><h1>{item.name} · {activeStudents.length} öğrenci</h1></div></div><div className="status-legend" aria-hidden="true"><span>✓ Tam</span><span>~ Eksik</span><span>× Yok</span><span className="absent-legend">G Gelmedi</span></div><div className="check-list">{activeStudents.map((person) => <div className="check-row" key={person.id}><div className="check-name"><span>{String(person.number).padStart(2, "0")}</span><strong>{person.name}</strong></div><StatusSelector value={statuses[person.id]} studentName={person.name} onChange={(status) => onChange(person.id, status)} /></div>)}</div><div className="save-dock"><div className="live-summary" aria-live="polite" aria-label={`${counts?.complete} tam, ${counts?.partial} eksik, ${counts?.missing} yok, ${counts?.absent} gelmedi`}><span><b>{counts?.complete}</b> ✓</span><span><b>{counts?.partial}</b> ~</span><span><b>{counts?.missing}</b> ×</span><span className="absent-count"><b>{counts?.absent}</b> G</span></div><button onClick={onSave}>Kontrolü Kaydet</button></div></>;
}

function StudentView({ student, schoolClass, sessions, onBack }: { student: Student; schoolClass: SchoolClass; sessions: AppData["sessions"]; onBack: () => void }) {
  const stats = studentStats(student.id, sessions.filter((session) => session.classId === schoolClass.id));
  const totalAbsent = stats.reduce((sum, stat) => sum + stat.absent, 0);
  return <><AppHeader eyebrow={`${schoolClass.name} · ${student.number} NUMARA`} title={student.name} back={onBack} /><section className="student-summary"><div><span>GENEL DEVAM</span><strong>{totalAbsent}</strong><small>toplam gelmedi kaydı</small></div><p>“Gelmedi” kayıtları başarı oranlarına dahil edilmez.</p></section><section className="stats-section"><p className="kicker">TEMEL İSTATİSTİKLER</p><div className="stats-list">{stats.map((stat) => <div className="stat-row" key={stat.type}><div><h3>{stat.type}</h3><p>{stat.considered ? `${stat.complete} tam / ${stat.considered} değerlendirme` : "Henüz değerlendirme yok"}{stat.absent ? ` · ${stat.absent} G` : ""}</p></div><strong>{stat.considered ? `%${stat.rate}` : "—"}</strong><div className="stat-bar"><i style={{ width: `${stat.rate}%` }} /></div></div>)}</div></section><section className="rule-note"><strong>Hesaplama nasıl çalışır?</strong><p>Tam kayıtlar, öğrencinin bulunduğu derslerdeki toplam değerlendirmeye bölünür. “G” kayıtları paydaya girmez.</p></section></>;
}

function BulkActionSheet({ request, source, classes, onClose, onConfirm }: { request: BulkRequest; source: SchoolClass; classes: SchoolClass[]; onClose: () => void; onConfirm: (targetClassId?: string) => void }) {
  const destinations = classes.filter((item) => item.id !== source.id);
  const [targetClassId, setTargetClassId] = useState(destinations[0]?.id ?? "");
  const target = destinations.find((item) => item.id === targetClassId);
  const transfer = request.action === "move" || request.action === "copy";
  const conflicts = target ? transferConflicts(source, target, request.studentIds) : [];
  const processable = request.studentIds.length - conflicts.length;
  const labels: Record<BulkStudentAction, { title: string; button: string; note: string }> = {
    move: { title: "Öğrencileri taşı", button: "Taşımayı onayla", note: "Öğrenciler kaynak sınıftan çıkarılıp hedef sınıfa taşınır." },
    copy: { title: "Öğrencileri kopyala", button: "Kopyalamayı onayla", note: "Hedef sınıfta yeni öğrenci kayıtları oluşturulur." },
    activate: { title: "Öğrencileri aktif yap", button: "Aktif yap", note: "Aktif öğrenciler yeni hızlı kontrollere dahil edilir." },
    deactivate: { title: "Öğrencileri pasif yap", button: "Pasif yap", note: "Geçmiş kayıtlar korunur; öğrenciler yeni kontrollere dahil edilmez." },
    delete: { title: "Öğrencileri sil", button: "Kalıcı silmeyi onayla", note: "Öğrenciler ve ilişkili kontrol kayıtları kalıcı olarak silinir." },
  };
  const copy = labels[request.action];
  return <Sheet title={copy.title} onClose={onClose}><div className="bulk-confirm"><p><strong>{request.studentIds.length} öğrenci seçildi.</strong><br />{copy.note}</p>{transfer && <label>Hedef sınıf<select data-autofocus value={targetClassId} onChange={(event) => setTargetClassId(event.target.value)}><option value="" disabled>Sınıf seçin</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name} · {activeStudentCount(item)} aktif</option>)}</select></label>}{transfer && conflicts.length > 0 && <div className="bulk-conflicts"><strong>{conflicts.length} numara çakışması</strong><p>{conflicts.map((student) => `${student.number} ${student.name}`).join(", ")}</p><small>Bu öğrenciler atlanacak; diğer {processable} öğrenci işlenecek.</small></div>}<button className={`primary-action ${request.action === "delete" ? "destructive-primary" : ""}`} onClick={() => onConfirm(transfer ? targetClassId : undefined)} disabled={(transfer && (!target || !processable))}>{copy.button}<span>→</span></button></div></Sheet>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state" role="status"><strong>{title}</strong><p>{text}</p></div>;
}
