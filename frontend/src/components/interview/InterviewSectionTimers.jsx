import { flex } from "../../styles/layout";

export const SECTION_COLORS = [
  { border: "border-primary-200", activeBorder: "border-primary-300", ring: "ring-primary-100", badge: "bg-primary-100 text-primary-700", pauseBg: "bg-primary-100 hover:bg-primary-200 text-primary-600", timer: "text-primary-600" },
  { border: "border-sky-200", activeBorder: "border-sky-300", ring: "ring-sky-100", badge: "bg-sky-100 text-sky-700", pauseBg: "bg-sky-100 hover:bg-sky-200 text-sky-600", timer: "text-sky-600" },
  { border: "border-mint-200", activeBorder: "border-mint-300", ring: "ring-mint-100", badge: "bg-mint-100 text-mint-700", pauseBg: "bg-mint-100 hover:bg-mint-200 text-mint-600", timer: "text-mint-600" },
  { border: "border-coral-200", activeBorder: "border-coral-300", ring: "ring-coral-100", badge: "bg-coral-100 text-coral-700", pauseBg: "bg-coral-100 hover:bg-coral-200 text-coral-600", timer: "text-coral-600" },
];

export function formatTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function SectionCard({ section, st, color, onStart, onPause, onResume, onDone, locked }) {
  const budget = section.suggested_minutes * 60;
  const pct = Math.min(100, (st.elapsed / budget) * 100);
  const over = st.elapsed > budget && st.status === "running";

  const isIdle = st.status === "idle";
  const isRunning = st.status === "running";
  const isPaused = st.status === "paused";
  const isDone = st.status === "done";

  const borderClass = isRunning
    ? over ? "border-coral-300 ring-2 ring-coral-100" : `${color.activeBorder} ring-2 ${color.ring}`
    : isPaused ? "border-amber-300" : "border-neutral-200";

  const barClass = isRunning ? "bg-primary-500" : isPaused ? "bg-amber-400" : isDone ? "bg-neutral-300" : "bg-neutral-200";
  const timerClass = over ? "text-coral-500 animate-pulse" : isRunning ? color.timer : "text-neutral-700";

  return (
    <div className={`shrink-0 w-[190px] h-[186px] flex flex-col border ${borderClass} rounded-2xl overflow-hidden bg-neutral-0 transition-all duration-300 ${isDone ? "opacity-50" : ""}`}>
      <div className="h-1 bg-neutral-100 shrink-0">
        <div className={`h-1 ${barClass} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className={`${flex.rowBetween} gap-1.5 shrink-0`}>
          <span className="font-semibold text-neutral-800 text-sm leading-tight line-clamp-1">{section.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${isDone ? "bg-neutral-100 text-neutral-400" : color.badge}`}>
            {section.suggested_minutes}m
          </span>
        </div>

        <p className="text-xs text-neutral-400 leading-snug line-clamp-2">{section.description}</p>

        <div className={`${flex.row} items-baseline gap-1 shrink-0`}>
          <span className={`font-mono text-lg font-bold ${timerClass}`}>{formatTimer(st.elapsed)}</span>
          <span className="text-xs text-neutral-400">/ {formatTimer(budget)}</span>
        </div>

        <div className="mt-auto shrink-0">
          {isIdle && (
            <button
              onClick={onStart}
              disabled={locked}
              className={`w-full py-1.5 rounded-lg text-sm font-semibold transition-colors ${locked ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-primary-500 hover:bg-primary-600 text-white"}`}
            >
              Start
            </button>
          )}

          {(isRunning || isPaused) && (
            <div className={`${flex.row} gap-2`}>
              <button
                onClick={isRunning ? onPause : onResume}
                disabled={locked}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : color.pauseBg}`}
              >
                {isRunning ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                )}
              </button>
              <button
                onClick={onDone}
                disabled={locked}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600"}`}
              >
                Done
              </button>
            </div>
          )}

          {isDone && (
            <div className={`${flex.row} justify-center gap-1.5 py-1.5`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-sm font-semibold text-neutral-400">Done</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InterviewSectionTimeline({
  sections,
  sectionStates,
  isCompleted,
  isMicActive,
  sectionsScrollRef,
  sectionCardRefs,
  jumpToSection,
  startSection,
  pauseSection,
  resumeSection,
  doneSection,
}) {
  if (!sections.length) return null;

  return (
    <div className="card-flat flex flex-col shrink-0 overflow-hidden">
      <div className="px-6 pt-3.5 pb-2.5 border-b border-neutral-100 shrink-0">
        <h2 className="text-base font-semibold text-neutral-800">Interview Sections</h2>
      </div>

      {isCompleted ? (
        <div className="px-4 py-3 flex flex-col gap-0.5">
          {sections.map((section, i) => {
            const hasReal = section.start_at != null;
            const startSec = hasReal
              ? section.start_at
              : sections.slice(0, i).reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);
            const color = SECTION_COLORS[i % SECTION_COLORS.length];

            return (
              <button
                key={i}
                onClick={() => jumpToSection(i)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors hover:bg-neutral-50 group"
              >
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${color.badge}`}>
                  {hasReal ? "" : "~"}{formatTimer(startSec)}
                </span>
                <span className="text-sm font-semibold text-neutral-800 group-hover:text-primary-600 transition-colors shrink-0">
                  {section.name}
                </span>
                <span className="text-xs text-neutral-400 truncate">{section.description}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 group-hover:text-primary-400 shrink-0 transition-colors">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            );
          })}
        </div>
      ) : (
        <div ref={sectionsScrollRef} className="overflow-x-auto px-6 py-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <div className={`${flex.row} gap-3 items-stretch`}>
            {sections.map((section, i) => (
              <div key={i} ref={(el) => (sectionCardRefs.current[i] = el)} className="shrink-0">
                <SectionCard
                  section={section}
                  st={sectionStates[i] ?? { status: "idle", elapsed: 0 }}
                  color={SECTION_COLORS[i % SECTION_COLORS.length]}
                  locked={!isMicActive}
                  onStart={() => startSection(i)}
                  onPause={() => pauseSection(i)}
                  onResume={() => resumeSection(i)}
                  onDone={() => doneSection(i)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
