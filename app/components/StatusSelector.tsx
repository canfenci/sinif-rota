import type { CheckStatus } from "../lib/types";

const options: { value: CheckStatus; label: string; title: string }[] = [
  { value: "complete", label: "✓", title: "Tam / Var" },
  { value: "partial", label: "~", title: "Eksik" },
  { value: "missing", label: "×", title: "Yok" },
  { value: "absent", label: "G", title: "Gelmedi" },
];

export function StatusSelector({ value, onChange, studentName }: { value: CheckStatus; onChange: (status: CheckStatus) => void; studentName: string }) {
  return <div className="status-selector" role="radiogroup" aria-label={`${studentName} durumu`}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} aria-label={option.title} title={option.title} className={`status-button status-${option.value} ${value === option.value ? "selected" : ""}`} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
