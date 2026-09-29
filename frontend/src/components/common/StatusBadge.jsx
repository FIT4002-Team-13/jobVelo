import { CANDIDATE_STATUS_STYLES, JOB_STATUS_STYLES, FALLBACK_STATUS_CLASS } from "../../utils/status.js";

export default function StatusBadge({ status, variant = "candidate", className = "" }) {
  const map = variant === "job" ? JOB_STATUS_STYLES : CANDIDATE_STATUS_STYLES;
  const cls = map[status] ?? FALLBACK_STATUS_CLASS;
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-pill uppercase ${cls} ${className}`}>
      {status}
    </span>
  );
}
