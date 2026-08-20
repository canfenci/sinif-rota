"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./components/Sheet";
import { StatusSelector } from "./components/StatusSelector";
import { StudentImport } from "./components/StudentImport";
import { classNameExists, nextStudentNumber, removeClass, removeStudent, studentNumberExists } from "./lib/data";
import { seedData } from "./lib/seed";
import { checkTypes, studentStats } from "./lib/stats";
import { localRepository } from "./lib/storage";
import type { AppData, CheckStatus, CheckType, SchoolClass, Student } from "./lib/types";

type View = "home" | "classes" | "class" | "quick" | "student" | "import";
type EditTarget = { kind: "class"; item?: SchoolClass } | { kind: "student"; item?: Student };

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setData(localRepository.load());
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) localRepository.save(data); }, [data, ready]);

  const schoolClass = data.classes.find((item) => item.id === classId) ?? data.classes[0];
  const student = schoolClass?.students.find((item) => item.id === studentId);
  const recent = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const counts = useMemo(() => statuses ? Object.values(statuses).reduce((acc, value) => ({ ...acc, [value]: acc[value] + 1 }), { complete: 0, partial: 0, missing: 0, absent: 0 }) : null, [statuses]);

  function navigate(next: View) { setView(next); if (next !== "quick") setStatuses(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2200); }
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
    if (!schoolClass || !schoolClass.students.length) { showToast("Kontrol için önce öğrenci ekleyin"); return; }
    setStatuses(Object.fromEntries(schoolClass.students.map((person) => [person.id, "complete"]))); window.scrollTo(0, 0);
  }
  function saveCheck() {
    if (!schoolClass || !statuses) return;
    setData((current) => ({ ...current, sessions: [...current.sessions, { id: crypto.randomUUID(), classId: schoolClass.id, className: schoolClass.name, type: checkType, date: new Date().toISOString(), statuses }] }));
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

  return <main className={`app-shell ${view === "quick" && statuses ? "quick-open" : ""}`}>
    {view === "home" && <HomeView classes={data.classes} recent={recent} onQuick={() => navigate("quick")} onClass={(id) => { setClassId(id); navigate("class"); }} />}
    {view === "classes" && <ClassesView classes={data.classes} onAdd={() => openEdit({ kind: "class" })} onOpen={(id) => { setClassId(id); navigate("class"); }} onEdit={(item) => openEdit({ kind: "class", item })} />}
    {view === "class" && schoolClass && <ClassView item={schoolClass} onBack={() => navigate("classes")} onQuick={() => navigate("quick")} onAdd={() => openEdit({ kind: "student" })} onImport={() => navigate("import")} onOpen={(id) => { setStudentId(id); navigate("student"); }} onEdit={(item) => openEdit({ kind: "student", item })} />}
    {view === "quick" && <QuickView classes={data.classes} classId={classId} type={checkType} statuses={statuses} counts={counts} onClass={setClassId} onType={setCheckType} onStart={startCheck} onChange={(id, status) => setStatuses((current) => current ? { ...current, [id]: status } : current)} onBack={leaveQuickCheck} onSave={saveCheck} />}
    {view === "student" && student && <StudentView student={student} schoolClass={schoolClass} sessions={data.sessions} onBack={() => navigate("class")} />}
    {view === "import" && schoolClass && <StudentImport schoolClass={schoolClass} onBack={() => navigate("class")} onImport={importStudents} />}

    {view !== "quick" && view !== "student" && view !== "import" && <nav className="bottom-nav" aria-label="Ana menü"><button className={view === "home" ? "nav-active" : ""} onClick={() => navigate("home")}>Ana Sayfa</button><button className={view !== "home" ? "nav-active" : ""} onClick={() => navigate("classes")}>Sınıflar</button></nav>}
    {editTarget && <Sheet title={`${editTarget.item ? "Düzenle" : "Yeni"} ${editTarget.kind === "class" ? "sınıf" : "öğrenci"}`} onClose={() => setEditTarget(null)}><div className="form-stack"><label>Adı<input data-autofocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={editTarget.kind === "class" ? "Örn. 5-F" : "Ad Soyad"} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>{editTarget.kind === "student" && <label>Okul numarası<input inputMode="numeric" min="1" max="999" type="number" value={draftNumber} onChange={(event) => setDraftNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>}<button className="primary-action" onClick={saveEdit}>Kaydet <span>→</span></button>{editTarget.item && <>{deleteArmed && <p className="delete-warning">Bu işlem ilgili geçmiş kayıtları da kalıcı olarak siler.</p>}<button className={`danger-action ${deleteArmed ? "danger-confirm" : ""}`} onClick={deleteTarget}>{deleteArmed ? "Silme işlemini onayla" : "Kaydı sil"}</button></>}</div></Sheet>}
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </main>;
}

function AppHeader({ eyebrow, title, back }: { eyebrow: string; title: string; back?: () => void }) {
  return <header className="page-header">{back ? <button className="back-button" onClick={back} aria-label="Geri">←</button> : <div className="brand-mark" aria-label="Sınıf Rota">SR</div>}<div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></header>;
}

function HomeView({ classes, recent, onQuick, onClass }: { classes: SchoolClass[]; recent: AppData["sessions"]; onQuick: () => void; onClass: (id: string) => void }) {
  const date = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
  return <><AppHeader eyebrow={date.toLocaleUpperCase("tr-TR")} title="Günaydın, Öğretmenim" /><section className="hero"><p className="kicker">GÜNLÜK TAKİP</p><h2>Sınıf kontrolüne<br />hemen başlayın.</h2><button className="primary-action" onClick={onQuick}>Hızlı Kontrol <span>→</span></button></section><section className="content-section"><div className="section-heading"><div><p className="kicker">SINIFLAR</p><h3>Bugün nereden devam?</h3></div></div>{classes.length ? <div className="class-list">{classes.slice(0, 3).map((item) => <button className="class-row" key={item.id} onClick={() => onClass(item.id)}><span className="class-name">{item.name}</span><span className="class-meta">{item.students.length} öğrenci</span><span className="arrow">→</span></button>)}</div> : <EmptyState title="Henüz sınıf yok" text="Sınıflar bölümünden ilk sınıfınızı ekleyin." />}</section>{recent.length > 0 && <section className="content-section compact"><p className="kicker">SON KONTROLLER</p>{recent.map((item) => <div className="recent-row" key={item.id}><strong>{item.className}</strong><span>{item.type}</span><time dateTime={item.date}>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(item.date))}</time></div>)}</section>}</>;
}

function ClassesView({ classes, onAdd, onOpen, onEdit }: { classes: SchoolClass[]; onAdd: () => void; onOpen: (id: string) => void; onEdit: (item: SchoolClass) => void }) {
  return <><AppHeader eyebrow="SINIF YÖNETİMİ" title="Sınıflar" /><div className="title-action"><p>{classes.length} sınıf · {classes.reduce((sum, item) => sum + item.students.length, 0)} öğrenci</p><button onClick={onAdd}>+ Sınıf ekle</button></div>{classes.length ? <div className="class-list management-list">{classes.map((item) => <div className="class-row-wrap" key={item.id}><button className="class-row" onClick={() => onOpen(item.id)}><span className="class-name">{item.name}</span><span className="class-meta">{item.students.length} öğrenci</span><span className="arrow">→</span></button><button className="row-edit" onClick={() => onEdit(item)} aria-label={`${item.name} sınıfını düzenle`}>•••</button></div>)}</div> : <EmptyState title="İlk sınıfınızı oluşturun" text="Sınıf adı ekledikten sonra öğrenci listenizi hazırlayabilirsiniz." />}</>;
}

function ClassView({ item, onBack, onQuick, onAdd, onImport, onOpen, onEdit }: { item: SchoolClass; onBack: () => void; onQuick: () => void; onAdd: () => void; onImport: () => void; onOpen: (id: string) => void; onEdit: (item: Student) => void }) {
  return <><AppHeader eyebrow={`${item.students.length} ÖĞRENCİ`} title={item.name} back={onBack} /><div className="class-actions"><button className="primary-action" onClick={onQuick} disabled={!item.students.length}>Kontrol başlat <span>→</span></button><div className="class-tool-row"><button className="secondary-action" onClick={onAdd}>+ Öğrenci</button><button className="secondary-action" onClick={onImport}>Dosyadan aktar</button></div></div>{item.students.length ? <div className="student-list"><div className="list-caption"><span>NO / ÖĞRENCİ</span><span>DURUM</span></div>{item.students.map((person) => <div className="student-row" key={person.id}><button className="student-open" onClick={() => onOpen(person.id)}><span className="student-no">{String(person.number).padStart(2, "0")}</span><span className="student-name">{person.name}</span><span className="student-detail">İstatistik →</span></button><button className="row-edit" onClick={() => onEdit(person)} aria-label={`${person.name} düzenle`}>•••</button></div>)}</div> : <EmptyState title="Bu sınıfta öğrenci yok" text="Tek tek ekleyebilir veya Excel/CSV dosyasından aktarabilirsiniz." />}</>;
}

function QuickView({ classes, classId, type, statuses, counts, onClass, onType, onStart, onChange, onBack, onSave }: { classes: SchoolClass[]; classId: string; type: CheckType; statuses: Record<string, CheckStatus> | null; counts: Record<CheckStatus, number> | null; onClass: (id: string) => void; onType: (type: CheckType) => void; onStart: () => void; onChange: (id: string, status: CheckStatus) => void; onBack: () => void; onSave: () => void }) {
  if (!classes.length) return <><AppHeader eyebrow="HIZLI KONTROL" title="Önce sınıf ekleyin" back={onBack} /><EmptyState title="Kontrol başlatılamıyor" text="Sınıflar bölümünden bir sınıf ve öğrenci listesi oluşturun." /></>;
  const item = classes.find((entry) => entry.id === classId) ?? classes[0];
  if (!statuses) return <><AppHeader eyebrow="2 ADIMDA HAZIR" title="Hızlı Kontrol" back={onBack} /><section className="setup-panel"><label><span>1 · Sınıfı seçin</span><select value={classId} onChange={(event) => onClass(event.target.value)}>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.students.length} öğrenci</option>)}</select></label><div><span className="field-label">2 · Kontrol türü</span><div className="type-grid">{checkTypes.map((entry) => <button className={type === entry ? "selected" : ""} key={entry} onClick={() => onType(entry)}>{entry}</button>)}</div></div><div className="default-note"><strong>Herkes “Tam” başlayacak.</strong><p>Yalnızca istisnaları değiştirmeniz yeterli.</p></div><button className="primary-action" onClick={onStart}>Kontrolü başlat <span>→</span></button></section></>;
  return <><div className="quick-top"><button className="back-button" onClick={onBack} aria-label="Kontrol kurulumuna dön">←</button><div><p className="eyebrow">{type.toLocaleUpperCase("tr-TR")} KONTROLÜ</p><h1>{item.name} · {item.students.length} öğrenci</h1></div></div><div className="status-legend" aria-hidden="true"><span>✓ Tam</span><span>~ Eksik</span><span>× Yok</span><span className="absent-legend">G Gelmedi</span></div><div className="check-list">{item.students.map((person) => <div className="check-row" key={person.id}><div className="check-name"><span>{String(person.number).padStart(2, "0")}</span><strong>{person.name}</strong></div><StatusSelector value={statuses[person.id]} studentName={person.name} onChange={(status) => onChange(person.id, status)} /></div>)}</div><div className="save-dock"><div className="live-summary" aria-live="polite" aria-label={`${counts?.complete} tam, ${counts?.partial} eksik, ${counts?.missing} yok, ${counts?.absent} gelmedi`}><span><b>{counts?.complete}</b> ✓</span><span><b>{counts?.partial}</b> ~</span><span><b>{counts?.missing}</b> ×</span><span className="absent-count"><b>{counts?.absent}</b> G</span></div><button onClick={onSave}>Kontrolü Kaydet</button></div></>;
}

function StudentView({ student, schoolClass, sessions, onBack }: { student: Student; schoolClass: SchoolClass; sessions: AppData["sessions"]; onBack: () => void }) {
  const stats = studentStats(student.id, sessions.filter((session) => session.classId === schoolClass.id));
  const totalAbsent = stats.reduce((sum, stat) => sum + stat.absent, 0);
  return <><AppHeader eyebrow={`${schoolClass.name} · ${student.number} NUMARA`} title={student.name} back={onBack} /><section className="student-summary"><div><span>GENEL DEVAM</span><strong>{totalAbsent}</strong><small>toplam gelmedi kaydı</small></div><p>“Gelmedi” kayıtları başarı oranlarına dahil edilmez.</p></section><section className="stats-section"><p className="kicker">TEMEL İSTATİSTİKLER</p><div className="stats-list">{stats.map((stat) => <div className="stat-row" key={stat.type}><div><h3>{stat.type}</h3><p>{stat.considered ? `${stat.complete} tam / ${stat.considered} değerlendirme` : "Henüz değerlendirme yok"}{stat.absent ? ` · ${stat.absent} G` : ""}</p></div><strong>{stat.considered ? `%${stat.rate}` : "—"}</strong><div className="stat-bar"><i style={{ width: `${stat.rate}%` }} /></div></div>)}</div></section><section className="rule-note"><strong>Hesaplama nasıl çalışır?</strong><p>Tam kayıtlar, öğrencinin bulunduğu derslerdeki toplam değerlendirmeye bölünür. “G” kayıtları paydaya girmez.</p></section></>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state" role="status"><strong>{title}</strong><p>{text}</p></div>;
}
