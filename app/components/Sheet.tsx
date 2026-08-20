import type { ReactNode } from "react";

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="sheet-backdrop">
    <button className="sheet-dismiss" type="button" onClick={onClose} aria-label="Pencereyi kapat" />
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet-handle" />
      <div className="sheet-header"><h2 id="sheet-title">{title}</h2><button type="button" onClick={onClose} aria-label="Kapat">Kapat</button></div>
      {children}
    </section>
  </div>;
}
