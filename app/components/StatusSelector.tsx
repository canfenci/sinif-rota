import type { CheckStatus, CheckType } from "../lib/types";
import { getStatusPresentation } from "../lib/quick-check";

const STATUS_KEYS: CheckStatus[] = ["complete", "partial", "missing", "absent"];

export function StatusSelector({
  value,
  onChange,
  studentName,
  checkType = "Ödev",
}: {
  value: CheckStatus;
  onChange: (status: CheckStatus) => void;
  studentName: string;
  checkType?: CheckType;
}) {
  return (
    <div className="status-selector" role="radiogroup" aria-label={`${studentName} durumu`}>
      {STATUS_KEYS.map((status) => {
        const option = getStatusPresentation(checkType, status);
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={value === status}
            aria-label={option.title}
            title={option.title}
            className={`status-button status-${status} ${value === status ? "selected" : ""}`}
            onClick={() => onChange(status)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
