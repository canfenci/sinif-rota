import type { ReactNode } from "react";

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-header"><h2 id="sheet-title">{title}</h2><button type="button" onClick={onClose} aria-label="Kapat">Kapat</button></div>
      {children}
    </section>
  </div>;
}
