import { useEffect, useRef, type ReactNode } from "react";

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter((item) => !item.hasAttribute("disabled"));
    (dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0])?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return <div className="sheet-backdrop">
    <button className="sheet-dismiss" type="button" onClick={onClose} aria-label="Pencereyi kapat" />
    <section ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet-handle" />
      <div className="sheet-header"><h2 id="sheet-title">{title}</h2><button type="button" onClick={onClose} aria-label="Kapat">Kapat</button></div>
      {children}
    </section>
  </div>;
}
