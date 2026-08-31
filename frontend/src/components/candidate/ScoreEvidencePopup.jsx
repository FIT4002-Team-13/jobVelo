import { useState } from "react";

const RATING_ITEMS = [
  { key: "communication", label: "Communication", accent: "primary" },
  { key: "technical_skills", label: "Technical Skills", accent: "coral" },
  { key: "problem_solving", label: "Problem Solving", accent: "mint" },
];

const ACCENT = {
  primary: { bar: "bg-primary-500", quote: "border-primary-200" },
  coral: { bar: "bg-coral-500", quote: "border-coral-200" },
  mint: { bar: "bg-mint-500", quote: "border-mint-200" },
};

function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ScoreDonut({ value }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 10));
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-neutral-100" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-primary-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-extrabold leading-none text-neutral-900">{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

function SkillCard({ item, rating, open, onToggle }) {
  const accent = ACCENT[item.accent];
  const evidence = Array.isArray(rating?.evidence) ? rating.evidence : [];
  const score = Number(rating?.score ?? 0);

  return (
    <section
      className={`shrink-0 overflow-hidden rounded-2xl border bg-neutral-0 transition-colors ${
        open ? "border-neutral-200" : "border-neutral-100"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-neutral-50"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-neutral-900">{rating?.skill || item.label}</span>
            <span className="shrink-0 text-[15px] font-bold tabular-nums text-neutral-900">
              {score.toFixed(1)}
              <span className="text-xs font-semibold text-neutral-400">/10</span>
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-pill bg-neutral-100">
            <div className={`h-full rounded-pill transition-all duration-500 ${accent.bar}`} style={{ width: `${(score / 10) * 100}%` }} />
          </div>
        </div>
        <span className="text-neutral-300">
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1">
          {rating?.explanation && <p className="mb-4 text-sm leading-relaxed text-neutral-600">{rating.explanation}</p>}

          {evidence.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {evidence.map((entry) => (
                <figure
                  key={entry.transcript_entry_id}
                  className={`rounded-r-xl border-l-[3px] bg-neutral-50 py-2.5 pl-4 pr-3 ${accent.quote}`}
                >
                  <blockquote className="whitespace-normal break-words text-sm italic leading-relaxed text-neutral-700">
                    &ldquo;{entry.text}&rdquo;
                  </blockquote>
                  <figcaption className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400">
                    {entry.speaker && <span className="font-semibold text-neutral-500">{entry.speaker}</span>}
                    {entry.speaker && entry.timestamp && <span className="text-neutral-300">·</span>}
                    {entry.timestamp && <span className="tabular-nums">{entry.timestamp}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-neutral-400">No supporting transcript evidence.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function ScoreEvidencePopup({ ratings, onClose }) {
  const [openKeys, setOpenKeys] = useState(() => new Set(RATING_ITEMS.map((item) => item.key)));

  function toggle(key) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!ratings) return null;

  const scores = RATING_ITEMS.map((item) => Number(ratings[item.key]?.score)).filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  const overall = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-popup-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-neutral-0 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-neutral-100 px-6 py-5">
          <ScoreDonut value={overall} />
          <div className="min-w-0 flex-1">
            <h2 id="evidence-popup-title" className="text-lg font-bold text-neutral-900">
              Score &amp; Evidence
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-neutral-400">
              AI-assessed against the role, with transcript quotes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close score evidence"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-3">
            {RATING_ITEMS.map((item) => (
              <SkillCard
                key={item.key}
                item={item}
                rating={ratings[item.key]}
                open={openKeys.has(item.key)}
                onToggle={() => toggle(item.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
