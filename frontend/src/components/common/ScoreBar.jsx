import { formatScore } from "../../utils/format.js";

/**
 * variant="row"   — compact 3-col layout (label | bar | value) used in score panels
 * variant="block" — 2-col layout with bar spanning full width below label+value
 */
export default function ScoreBar({ label, value, barClass, variant = "row" }) {
  if (variant === "block") {
    const pct = Math.max(0, Math.min(100, ((value ?? 0) / 10) * 100));
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
        <span className="text-sm text-neutral-600">{label}</span>
        <span className="text-base font-bold text-neutral-700 tabular-nums">
          {(value ?? 0).toFixed(1)}
        </span>
        <div className="col-span-2 h-2 rounded-pill bg-neutral-100 overflow-hidden">
          <div className={`h-full rounded-pill ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  const isMissing = value == null;
  const displayValue = isMissing ? "--" : formatScore(value);
  const width = isMissing ? "100%" : `${Math.min((Number(value) / 10) * 100, 100)}%`;
  return (
    <div className="grid grid-cols-[1.55fr_2fr_0.35fr] items-center gap-x-4">
      <p className="text-xs font-medium leading-[1.1] text-neutral-800">{label}</p>
      <div className="h-1 w-full rounded-pill bg-neutral-200">
        <div
          className={`h-1 rounded-pill ${isMissing ? "bg-neutral-300" : barClass}`}
          style={{ width }}
        />
      </div>
      <p className="text-right text-xs font-medium leading-none text-neutral-800">{displayValue}</p>
    </div>
  );
}
