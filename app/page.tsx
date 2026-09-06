"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./components/Sheet";
import { StatusSelector } from "./components/StatusSelector";
import { StudentImport } from "./components/StudentImport";
import { AnnualPlan } from "./components/AnnualPlan";
import { activeStudentCount, applyBulkStudentAction, classNameExists, createCheckSession, duplicateClass, nextStudentNumber, removeClass, removeStudent, renameClass, studentNumberExists, transferConflicts, type BulkStudentAction } from "./lib/data";
import { emptyAppData } from "./lib/seed";
import { checkTypes, studentHistorySessions, studentStats } from "./lib/stats";
import { STORAGE_KEY, browserLocalStorage, createBrowserLockCoordinator, createCoordinatedSaveQueue, determineSaveWarning, downloadEmergencyExport, loadCoordinated, prepareEmergencyExport, type AppLoadState, type CoordinatedSaveQueue } from "./lib/storage";
import { getCalendarSupportState, resolveDefaultWorkCalendar } from "./lib/academic-year";
import { detectClassGrade, shouldConfirmGradeChange, updateAnnualPlanEntry } from "./lib/planning";
import { BUILD_INFO } from "./lib/build-info";
import { useGreeting } from "./lib/greeting";
import { createInitialCheckStatuses, getExistingVisitsForWeek, getNextVisitIndex, isDuplicateSession, updateCheckStatus } from "./lib/quick-check";
import { resolveSessionWeekStart } from "./lib/session-week";
import { buildPlanWeeks, isValidWorkCalendar } from "./lib/planning/calendar";
import { formatWeekDateRange, getWeekDisplayEndDate } from "./components/AnnualPlan";
import type { AppData, CheckSession, CheckStatus, CheckType, SchoolClass, Student, WorkCalendar } from "./lib/types";

type View = "home" | "classes" | "class" | "quick" | "student" | "import" | "plan";
type EditTarget = { kind: "class"; item?: SchoolClass } | { kind: "student"; item?: Student };
type BulkRequest = { action: BulkStudentAction; studentIds: string[] };
type WriteBlock = "conflict" | "coordination_unavailable";

export default function Home() {
  const [loadState, setLoadState] = useState<AppLoadState>({ status: "loading" });
  const [data, setData] = useState<AppData>(emptyAppData);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [writeBlock, setWriteBlock] = useState<WriteBlock | null>(null);
  const [view, setView] = useState<View>("home");
  const [classId, setClassId] = useState(emptyAppData.classes[0]?.id ?? "");
  const [studentId, setStudentId] = useState("");
  const [checkType, setCheckType] = useState<CheckType>("Ödev");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus> | null>(null);
  const [quickWeekStart, setQuickWeekStart] = useState<string | null>(null);
  const [quickVisitIndex, setQuickVisitIndex] = useState<number>(1);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [gradeConfirm, setGradeConfirm] = useState<{ id: string; name: string; oldGrade: number | null; newGrade: number | null } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [toast, setToast] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<AppData | null>(null);
  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
  const [bulkVersion, setBulkVersion] = useState(0);
  const toastTimer = useRef<number | null>(null);
  const saveQueue = useRef<CoordinatedSaveQueue | null>(null);
  const skipHydrationSave = useRef(false);

  useEffect(() => {
    console.info(`[Sınıf Rota] ${BUILD_INFO.display} (v${BUILD_INFO.version}) aktif.`);
    let cancelled = false;
    const coordinator = createBrowserLockCoordinator();
    const frame = window.requestAnimationFrame(async () => {
      const { decision, token } = await loadCoordinated(browserLocalStorage, coordinator);
      if (cancelled) return;
      if (decision.writable) {
        saveQueue.current = createCoordinatedSaveQueue(token, browserLocalStorage, coordinator);
        skipHydrationSave.current = true;
      }
      setData(decision.data);
      setLoadState(decision.loadState);
      if (decision.migrationNotice) {
        showToast(decision.migrationNotice);
      }
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    if (skipHydrationSave.current) {
      skipHydrationSave.current = false;
      return;
    }
    if (writeBlock || !saveQueue.current) return;

    let cancelled = false;
    void saveQueue.current.enqueue(data).then((saveResult) => {
      if (cancelled) return;
      if (saveResult.status === "conflict" || saveResult.status === "coordination_unavailable") {
        setWriteBlock(saveResult.status);
        setSaveWarning(null);
        return;
      }
      setSaveWarning(determineSaveWarning(saveResult));
    });
    return () => {
      cancelled = true;
    };
  }, [data, loadState.status, writeBlock]);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    function handleStorageChange(event: StorageEvent) {
      const queue = saveQueue.current;
      if (event.key !== STORAGE_KEY || !queue || event.newValue === queue.getExpectedToken()) return;
      queue.block();
      setWriteBlock("conflict");
      setSaveWarning(null);
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadState.status]);

  const schoolClass = data.classes.find((item) => item.id === classId) ?? data.classes[0];
  const activeClasses = data.classes.filter((item) => !item.archived);
  const student = schoolClass?.students.find((item) => item.id === studentId);
  const recent = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const defaultCalendarResolution = resolveDefaultWorkCalendar();
  const workCalendar = data.workCalendar ?? defaultCalendarResolution.calendar;
  const calendarSupportState = workCalendar ? getCalendarSupportState(workCalendar) : "unsupported_year";
  const calendarSchoolYear = workCalendar?.schoolYear ?? defaultCalendarResolution.schoolYear;
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
        if (shouldConfirmGradeChange(editTarget.item.name, name)) {
          setGradeConfirm({ id: editedId, name, oldGrade: detectClassGrade(editTarget.item.name), newGrade: detectClassGrade(name) });
          return;
        }
        setData((current) => renameClass(current, editedId, name));
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

  function confirmGradeChange() {
    if (!gradeConfirm) return;
    setData((current) => renameClass(current, gradeConfirm.id, gradeConfirm.name));
    setGradeConfirm(null); setEditTarget(null); showToast("Değişiklik kaydedildi");
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

  const resolvedQuickWeekStart = quickWeekStart ?? (workCalendar ? resolveSessionWeekStart(new Date().toISOString(), workCalendar) : resolveSessionWeekStart(new Date().toISOString()));

  function handleQuickClassChange(nextClassId: string) {
    setClassId(nextClassId);
    setQuickVisitIndex(1);
  }

  function handleQuickWeekChange(nextWeekStart: string) {
    setQuickWeekStart(nextWeekStart);
    setQuickVisitIndex(1);
  }

  function handleQuickTypeChange(nextType: CheckType) {
    setCheckType(nextType);
  }

  function handleQuickVisitChange(nextVisitIndex: number) {
    setQuickVisitIndex(nextVisitIndex);
  }

  function startCheck() {
    const checkClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0];
    const activeStudents = checkClass?.students.filter((student) => student.active !== false) ?? [];
    if (!checkClass || !activeStudents.length) { showToast("Kontrol için önce aktif öğrenci ekleyin"); return; }
    if (isDuplicateSession(data.sessions, checkClass.id, resolvedQuickWeekStart, quickVisitIndex, checkType, workCalendar ?? undefined)) {
      showToast(`Bu girişte ${checkType} kontrolü daha önce kaydedildi`);
      return;
    }
    if (checkClass.id !== classId) setClassId(checkClass.id);
    setStatuses(createInitialCheckStatuses(activeStudents)); window.scrollTo(0, 0);
  }
  function saveCheck() {
    const checkClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0];
    if (!checkClass || !statuses) return;
    if (isDuplicateSession(data.sessions, checkClass.id, resolvedQuickWeekStart, quickVisitIndex, checkType, workCalendar ?? undefined)) {
      showToast(`Bu girişte ${checkType} kontrolü daha önce kaydedildi`);
      return;
    }
    const session = createCheckSession(
      checkClass,
      checkType,
      statuses,
      new Date().toISOString(),
      () => crypto.randomUUID(),
      resolvedQuickWeekStart,
      quickVisitIndex
    );
    setData((current) => ({ ...current, sessions: [...current.sessions, session] }));
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

  if (loadState.status === "loading") {
    return (
      <main className="app-shell">
        <div className="safe-state-container" role="status" aria-live="polite">
          <p className="kicker">SINIF ROTA</p>
          <h2>Yükleniyor...</h2>
        </div>
      </main>
    );
  }

  if (loadState.status === "quarantined") {
    return (
      <main className="app-shell">
        <div className="safe-state-container" role="alert">
          <div className="safe-state-icon" aria-hidden="true">⚠️</div>
          <p className="kicker">GÜVENLİK KORUMASI</p>
          <h1>Verilerinizi açarken bir sorun tespit edildi.</h1>
          <p className="safe-state-desc">
            Mevcut kayıtlarınıza dokunulmadı. Sınıf Rota güvenlik amacıyla bu oturumda veri yazmayı durdurdu.
          </p>
          <div className="safe-state-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => window.location.reload()}
            >
              Sayfayı yeniden yükle <span>↺</span>
            </button>
            {loadState.raw && (
              <button
                type="button"
                className="secondary-action export-action"
                onClick={() => {
                  const descriptor = prepareEmergencyExport({ raw: loadState.raw!, type: "quarantine" });
                  downloadEmergencyExport(descriptor);
                }}
              >
                Veriyi dışa aktar <span>📥</span>
              </button>
            )}
          </div>
          {loadState.raw && (
            <p className="safe-state-subnote">Mevcut kaydın bir kopyasını cihazınıza kaydedebilirsiniz.</p>
          )}
        </div>
      </main>
    );
  }

  if (loadState.status === "future_version") {
    return (
      <main className="app-shell">
        <div className="safe-state-container" role="alert">
          <div className="safe-state-icon" aria-hidden="true">🔒</div>
          <p className="kicker">SÜRÜM UYUMSUZLUĞU</p>
          <h1>Verileriniz daha yeni bir Sınıf Rota sürümüyle kaydedilmiş.</h1>
          <p className="safe-state-desc">
            Bu sürüm verilerinizi güvenli şekilde açamıyor. Verilerinizi korumak için kayıt işlemleri durduruldu.
          </p>
          <div className="safe-state-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => window.location.reload()}
            >
              Sayfayı yeniden yükle <span>↺</span>
            </button>
            {loadState.raw && (
              <button
                type="button"
                className="secondary-action export-action"
                onClick={() => {
                  const descriptor = prepareEmergencyExport({ raw: loadState.raw!, type: "backup" });
                  downloadEmergencyExport(descriptor);
                }}
              >
                Veriyi dışa aktar <span>📥</span>
              </button>
            )}
          </div>
          {loadState.raw && (
            <p className="safe-state-subnote">Mevcut kaydın bir kopyasını cihazınıza kaydedebilirsiniz.</p>
          )}
        </div>
      </main>
    );
  }

  if (loadState.status === "storage_unavailable") {
    return (
      <main className="app-shell">
        <div className="safe-state-container" role="alert">
          <div className="safe-state-icon" aria-hidden="true">🚫</div>
          <p className="kicker">DEPOLAMA ERİŞİMİ YOK</p>
          <h1>Tarayıcı depolama alanına erişilemiyor.</h1>
          <p className="safe-state-desc">
            Gizli sekme kısıtlamaları veya izinler nedeniyle yerel depolamaya erişilemedi. Verilerinizi korumak için kayıt işlemleri durduruldu.
          </p>
          <button
            type="button"
            className="primary-action"
            onClick={() => window.location.reload()}
          >
            Sayfayı yeniden yükle <span>↺</span>
          </button>
        </div>
      </main>
    );
  }

  if (loadState.status === "coordination_unavailable") {
    return (
      <main className="app-shell">
        <div className="safe-state-container" role="alert">
          <div className="safe-state-icon" aria-hidden="true">🔒</div>
          <p className="kicker">GÜVENLİ KAYIT KORUMASI</p>
          <h1>Bu tarayıcıda güvenli sekme koordinasyonu kullanılamıyor.</h1>
          <p className="safe-state-desc">
            Verilerinizin başka bir sekme tarafından yanlışlıkla ezilmesini önlemek için kayıt işlemleri durduruldu.
          </p>
          <button type="button" className="primary-action" onClick={() => window.location.reload()}>
            Sayfayı yeniden yükle <span>↺</span>
          </button>
        </div>
      </main>
    );
  }

  return <main className={`app-shell ${view === "quick" && statuses ? "quick-open" : ""}`}>
    {writeBlock && (
      <div className="save-warning-banner concurrency-warning" role="alert">
        <span>{writeBlock === "conflict" ? "Veriler başka bir sekmede değiştirildi. Bu sekmedeki son değişiklik kaydedilmedi. Güncel verileri almak için sayfayı yenileyin." : "Güvenli sekme koordinasyonu kullanılamadığı için bu sekmede kayıt durduruldu."}</span>
        <button type="button" onClick={() => window.location.reload()}>Sayfayı yenile</button>
      </div>
    )}
    {!writeBlock && saveWarning && (
      <div className="save-warning-banner" role="alert">
        <span>⚠️ {saveWarning}</span>
      </div>
    )}
    {view === "home" && <HomeView classes={activeClasses} recent={recent} onQuick={() => navigate("quick")} onClass={(id) => { setClassId(id); navigate("class"); }} />}
    {view === "classes" && <ClassesView classes={data.classes} onAdd={() => openEdit({ kind: "class" })} onOpen={(id) => { setClassId(id); navigate("class"); }} onEdit={(item) => openEdit({ kind: "class", item })} />}
    {view === "class" && schoolClass && <ClassView key={`${schoolClass.id}-${bulkVersion}`} item={schoolClass} onBack={() => navigate("classes")} onQuick={() => navigate("quick")} onAdd={() => openEdit({ kind: "student" })} onImport={() => navigate("import")} onBulk={(action, studentIds) => setBulkRequest({ action, studentIds })} onOpen={(id) => { setStudentId(id); navigate("student"); }} onEdit={(item) => openEdit({ kind: "student", item })} />}
    {view === "quick" && (
      <QuickView
        classes={activeClasses}
        classId={classId}
        type={checkType}
        statuses={statuses}
        counts={counts}
        sessions={data.sessions}
        calendar={workCalendar ?? undefined}
        selectedWeekStart={resolvedQuickWeekStart}
        selectedVisitIndex={quickVisitIndex}
        onClass={handleQuickClassChange}
        onType={handleQuickTypeChange}
        onWeek={handleQuickWeekChange}
        onVisit={handleQuickVisitChange}
        onStart={startCheck}
        onChange={(id, status) => setStatuses((current) => current ? updateCheckStatus(current, id, status) : current)}
        onBack={leaveQuickCheck}
        onSave={saveCheck}
      />
    )}
    {view === "student" && student && <StudentView student={student} schoolClass={schoolClass} sessions={data.sessions} onBack={() => navigate("class")} />}
    {view === "import" && schoolClass && <StudentImport schoolClass={schoolClass} onBack={() => navigate("class")} onImport={importStudents} />}
    {view === "plan" && calendarSupportState === "unsupported_year" && <section className="unsupported-year-state" role="status"><p className="kicker">YILLIK PLAN</p><h1>{calendarSchoolYear.replace("-", "–")} Eğitim Öğretim Yılı Henüz Yapılandırılmadı</h1><p>Bu eğitim yılı için resmî MEB çalışma takvimi ve ders planı şablonu henüz sisteme eklenmemiştir.</p></section>}
    {view === "plan" && calendarSupportState !== "unsupported_year" && workCalendar && <AnnualPlan classes={activeClasses} calendar={workCalendar} calendarSupportState={calendarSupportState} entries={data.annualPlanEntries ?? []} onCalendar={(calendar) => setData((current) => ({ ...current, workCalendar: calendar }))} onEntry={(targetClassId, weekStart, patch) => setData((current) => updateAnnualPlanEntry(current, targetClassId, workCalendar, weekStart, patch, () => crypto.randomUUID()))} onNotify={showToast} />}

    {view !== "quick" && view !== "student" && view !== "import" && <nav className="bottom-nav" aria-label="Ana menü"><button className={view === "home" ? "nav-active" : ""} onClick={() => navigate("home")}>Ana Sayfa</button><button className={view === "classes" || view === "class" ? "nav-active" : ""} onClick={() => navigate("classes")}>Sınıflar</button><button className={view === "plan" ? "nav-active" : ""} onClick={() => navigate("plan")}>Yıllık Plan</button></nav>}
    {editTarget && <Sheet title={`${editTarget.item ? "Düzenle" : "Yeni"} ${editTarget.kind === "class" ? "sınıf" : "öğrenci"}`} onClose={() => setEditTarget(null)}><div className="form-stack"><label>Adı<input data-autofocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={editTarget.kind === "class" ? "Örn. 5-F" : "Ad Soyad"} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>{editTarget.kind === "student" && <label>Okul numarası<input inputMode="numeric" min="1" max="999" type="number" value={draftNumber} onChange={(event) => setDraftNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveEdit()} /></label>}<button className="primary-action" onClick={saveEdit}>Kaydet <span>→</span></button>{editTarget.kind === "class" && editTarget.item && <div className="class-record-actions"><button type="button" onClick={duplicateSelectedClass}>Sınıfı çoğalt</button><button type="button" onClick={toggleClassArchive}>{editTarget.item.archived ? "Arşivden çıkar" : "Sınıfı arşivle"}</button></div>}{editTarget.item && <>{deleteArmed && <p className="delete-warning">Bu işlem ilgili geçmiş kayıtları da kalıcı olarak siler.</p>}<button className={`danger-action ${deleteArmed ? "danger-confirm" : ""}`} onClick={deleteTarget}>{deleteArmed ? "Silme işlemini onayla" : "Kaydı sil"}</button></>}</div></Sheet>}
    {gradeConfirm && <Sheet title="Sınıf seviyesi değişiyor" onClose={() => setGradeConfirm(null)}><div className="form-stack"><p className="grade-confirm-text">{gradeConfirm.oldGrade != null && gradeConfirm.newGrade != null ? `Bu sınıf ${gradeConfirm.oldGrade}. sınıftan ${gradeConfirm.newGrade}. sınıfa geçecek. Öğrenciler ve geçmiş kontroller korunur; Yıllık Plan yeni sınıf seviyesinin programını kullanır.` : gradeConfirm.oldGrade == null && gradeConfirm.newGrade != null ? `Bu sınıf artık ${gradeConfirm.newGrade}. sınıf olarak tanınacak. Öğrenciler ve geçmiş kontroller korunur; Yıllık Plan ${gradeConfirm.newGrade}. sınıf programını kullanır.` : `Yeni sınıf adı bir sınıf seviyesiyle eşleşmiyor. Öğrenciler ve geçmiş kontroller korunur; otomatik Yıllık Plan kullanılamayabilir.`}</p><div className="grade-confirm-actions"><button type="button" className="secondary-action" onClick={() => setGradeConfirm(null)}>Vazgeç</button><button type="button" className="primary-action" onClick={confirmGradeChange}>Değişikliği Onayla <span>→</span></button></div></div></Sheet>}
    {bulkRequest && schoolClass && <BulkActionSheet request={bulkRequest} source={schoolClass} classes={activeClasses} onClose={() => setBulkRequest(null)} onConfirm={runBulkAction} />}
    {toast && <div className="toast" role="status"><span>✓ {toast}</span>{undoSnapshot && <button type="button" onClick={undoLast}>Geri al</button>}</div>}
  </main>;
}

function AppHeader({ eyebrow, title, back }: { eyebrow: string; title: string; back?: () => void }) {
  return <header className="page-header">{back ? <button className="back-button" onClick={back} aria-label="Geri">←</button> : <div className="brand-mark" aria-label="Sınıf Rota">SR</div>}<div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></header>;
}

function HomeView({ classes, recent, onQuick, onClass }: { classes: SchoolClass[]; recent: AppData["sessions"]; onQuick: () => void; onClass: (id: string) => void }) {
  const greeting = useGreeting();
  const date = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
  return <><AppHeader eyebrow={date.toLocaleUpperCase("tr-TR")} title={greeting} /><section className="hero"><p className="kicker">GÜNLÜK TAKİP</p><h2>Sınıf kontrolüne<br />hemen başlayın.</h2><p className="hero-desc">Ödev, defter, kitap veya materyal kontrolü yap.</p><button className="primary-action" onClick={onQuick}>Hızlı Kontrol <span>→</span></button></section><section className="content-section"><div className="section-heading"><div><p className="kicker">SINIFLAR</p><h3>Bugün nereden devam?</h3></div></div>{classes.length ? <div className="class-list home-class-list">{classes.slice(0, 3).map((item) => { const grade = detectClassGrade(item.name); const gradeClass = grade ? ` grade-${grade}` : ""; return <button className={`class-row home-class-card${gradeClass}`} key={item.id} onClick={() => onClass(item.id)}><span className="class-grade-badge">{grade ?? "SR"}</span><span><span className="class-name">{item.name}</span><span className="class-meta">{activeStudentCount(item)} aktif öğrenci</span></span><span className="arrow">→</span></button>; })}</div> : <EmptyState title="Henüz sınıf yok" text="Sınıflar bölümünden ilk sınıfınızı ekleyin." />}</section>{recent.length > 0 && <section className="content-section compact"><p className="kicker">SON KONTROLLER</p>{recent.map((item) => <div className="recent-row" key={item.id}><strong>{item.className}</strong><span>{item.type}</span><time dateTime={item.date}>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(item.date))}</time></div>)}</section>}<footer className="app-footer" role="contentinfo"><p>Sınıf Rota · {BUILD_INFO.display}</p></footer></>;
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

function QuickView({
  classes,
  classId,
  type,
  statuses,
  counts,
  sessions,
  calendar,
  selectedWeekStart,
  selectedVisitIndex,
  onClass,
  onType,
  onWeek,
  onVisit,
  onStart,
  onChange,
  onBack,
  onSave,
}: {
  classes: SchoolClass[];
  classId: string;
  type: CheckType;
  statuses: Record<string, CheckStatus> | null;
  counts: Record<CheckStatus, number> | null;
  sessions: CheckSession[];
  calendar?: WorkCalendar;
  selectedWeekStart: string;
  selectedVisitIndex: number;
  onClass: (id: string) => void;
  onType: (type: CheckType) => void;
  onWeek: (weekStart: string) => void;
  onVisit: (visitIndex: number) => void;
  onStart: () => void;
  onChange: (id: string, status: CheckStatus) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const item = classes.find((entry) => entry.id === classId) ?? classes[0];
  const activeStudents = item ? item.students.filter((student) => student.active !== false) : [];
  const itemId = item?.id ?? "";

  const planWeeks = useMemo(() => (calendar && isValidWorkCalendar(calendar) ? buildPlanWeeks(calendar) : []), [calendar]);
  const activeWeekIndex = planWeeks.findIndex((w) => w.startDate === selectedWeekStart);
  const currentWeekObj = activeWeekIndex >= 0 ? planWeeks[activeWeekIndex] : undefined;
  const weekTitle = currentWeekObj ? `${currentWeekObj.number}. Hafta` : "Ders Haftası";
  const weekDateRange = currentWeekObj
    ? formatWeekDateRange(currentWeekObj.startDate, getWeekDisplayEndDate(currentWeekObj))
    : selectedWeekStart;
  const canPrevWeek = activeWeekIndex > 0;
  const canNextWeek = activeWeekIndex >= 0 && activeWeekIndex < planWeeks.length - 1;

  const { visits: existingVisits, hasLegacySessions } = useMemo(
    () => (itemId ? getExistingVisitsForWeek(sessions, itemId, selectedWeekStart, calendar) : { visits: [], hasLegacySessions: false }),
    [sessions, itemId, selectedWeekStart, calendar]
  );
  const nextNewVisitIndex = getNextVisitIndex(existingVisits);
  const visitIndices = new Set(existingVisits.map((v) => v.visitIndex));
  if (visitIndices.size === 0) {
    visitIndices.add(1);
  }
  visitIndices.add(selectedVisitIndex);
  const sortedVisitIndices = Array.from(visitIndices).sort((a, b) => a - b);
  const showAddButton = !sortedVisitIndices.includes(nextNewVisitIndex);

  const isDuplicate = Boolean(itemId && isDuplicateSession(sessions, itemId, selectedWeekStart, selectedVisitIndex, type, calendar));
  const isHomework = type === "Ödev";

  if (!classes.length || !item) {
    return (
      <>
        <AppHeader eyebrow="HIZLI KONTROL" title="Önce sınıf ekleyin" back={onBack} />
        <EmptyState title="Kontrol başlatılamıyor" text="Sınıflar bölümünden bir sınıf ve öğrenci listesi oluşturun." />
      </>
    );
  }

  if (!statuses) {
    return (
      <>
        <AppHeader eyebrow="HAFTALIK KONTROL" title="Hızlı Kontrol" back={onBack} />
        <section className="setup-panel">
          <label>
            <span>1 · Sınıfı seçin</span>
            <select value={classId} onChange={(event) => onClass(event.target.value)}>
              {classes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {activeStudentCount(entry)} aktif öğrenci
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="field-label">2 · Hafta seçimi</span>
            <div className="week-navigator quick-week-navigator" role="region" aria-label="Hafta seçimi">
              <button
                type="button"
                className="week-nav-button"
                onClick={() => canPrevWeek && onWeek(planWeeks[activeWeekIndex - 1].startDate)}
                disabled={!canPrevWeek}
                aria-label="Önceki hafta"
              >
                ‹
              </button>
              <div className="week-nav-info">
                <span className="week-nav-title">{weekTitle}</span>
                <span className="week-nav-meta">{weekDateRange}</span>
              </div>
              <button
                type="button"
                className="week-nav-button"
                onClick={() => canNextWeek && onWeek(planWeeks[activeWeekIndex + 1].startDate)}
                disabled={!canNextWeek}
                aria-label="Sonraki hafta"
              >
                ›
              </button>
            </div>
          </div>

          <div>
            <span className="field-label">3 · Ders Girişi</span>
            <div className="visit-grid" role="radiogroup" aria-label="Ders Girişi">
              {sortedVisitIndices.map((idx) => {
                const summary = existingVisits.find((v) => v.visitIndex === idx);
                const hasTypes = summary && summary.types.length > 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    role="radio"
                    aria-checked={selectedVisitIndex === idx}
                    className={selectedVisitIndex === idx ? "selected" : ""}
                    onClick={() => onVisit(idx)}
                  >
                    <span className="visit-title">{idx}. Giriş</span>
                    {hasTypes && (
                      <span className="visit-types-summary">
                        {summary.types.join(" ✓ · ")} ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {showAddButton && (
                <button
                  type="button"
                  className={`new-visit-button ${selectedVisitIndex === nextNewVisitIndex ? "selected" : ""}`}
                  onClick={() => onVisit(nextNewVisitIndex)}
                >
                  <span className="visit-title">+ Yeni Giriş</span>
                  <span className="visit-types-summary">({nextNewVisitIndex}. Giriş)</span>
                </button>
              )}
            </div>
            {hasLegacySessions && (
              <p className="legacy-sessions-hint">Bu hafta için ziyaret sırası belirtilmemiş eski kayıtlar mevcut.</p>
            )}
          </div>

          <div>
            <span className="field-label">4 · Kontrol türü</span>
            <div className="type-grid">
              {checkTypes.map((entry) => (
                <button
                  className={type === entry ? "selected" : ""}
                  key={entry}
                  onClick={() => onType(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          {isDuplicate && (
            <div className="duplicate-warning" role="alert">
              <strong>⚠️ Bu girişte {type} kontrolü daha önce kaydedildi.</strong>
              <p>Farklı bir kontrol türü seçebilir veya yeni bir ders girişi başlatabilirsiniz.</p>
            </div>
          )}

          <div className="default-note">
            <strong>Herkes “{isHomework ? "Yaptı" : "Getirdi"}” başlayacak.</strong>
            <p>Yalnızca aktif öğrenciler kontrole alınır; istisnaları değiştirmeniz yeterli.</p>
          </div>

          <button
            className="primary-action"
            onClick={onStart}
            disabled={Boolean(isDuplicate || !activeStudents.length)}
          >
            Kontrolü başlat <span>→</span>
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="quick-top">
        <button className="back-button" onClick={onBack} aria-label="Kontrol kurulumuna dön">
          ←
        </button>
        <div>
          <p className="eyebrow">
            {type.toLocaleUpperCase("tr-TR")} KONTROLÜ · {selectedVisitIndex}. GİRİŞ
          </p>
          <h1>
            {item.name} · {weekTitle}
          </h1>
        </div>
      </div>
      <div className="status-legend" aria-hidden="true">
        <span>✓ {isHomework ? "Yaptı" : "Getirdi"}</span>
        <span>~ Eksik</span>
        <span>× {isHomework ? "Yapmadı" : "Getirmedi"}</span>
        <span className="absent-legend">G Gelmedi</span>
      </div>
      <div className="check-list">
        {activeStudents.map((person) => (
          <div className="check-row" key={person.id}>
            <div className="check-name">
              <span>{String(person.number).padStart(2, "0")}</span>
              <strong>{person.name}</strong>
            </div>
            <StatusSelector
              value={statuses[person.id]}
              studentName={person.name}
              checkType={type}
              onChange={(status) => onChange(person.id, status)}
            />
          </div>
        ))}
      </div>
      <div className="save-dock">
        <div
          className="live-summary"
          aria-live="polite"
          aria-label={`${counts?.complete} ${isHomework ? "yaptı" : "getirdi"}, ${counts?.partial} eksik, ${counts?.missing} ${isHomework ? "yapmadı" : "getirmedi"}, ${counts?.absent} gelmedi`}
        >
          <span><b>{counts?.complete}</b> ✓</span>
          <span><b>{counts?.partial}</b> ~</span>
          <span><b>{counts?.missing}</b> ×</span>
          <span className="absent-count"><b>{counts?.absent}</b> G</span>
        </div>
        <button onClick={onSave}>Kontrolü Kaydet</button>
      </div>
    </>
  );
}

function StudentView({ student, schoolClass, sessions, onBack }: { student: Student; schoolClass: SchoolClass; sessions: AppData["sessions"]; onBack: () => void }) {
  const stats = studentStats(student.id, studentHistorySessions(student.id, sessions));
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
