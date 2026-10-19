import { useEffect, useState } from "react";
import { flex } from "../../styles/layout";
import { formatTimer } from "../../utils/time.js";
import { SECTION_COLORS } from "../../utils/constants.js";

const STATUS_LABEL = { idle: "Not started", running: "In progress", paused: "Paused", done: "Done" };

// One compact pill per section. The focused section gets the detail panel
// below, so the strip stays a single short row however many sections there are.
function SectionChip({ section, st, color, focused, onSelect, chipRef }) {
  const isRunning = st.status === "running";
  const isPaused = st.status === "paused";
  const isDone = st.status === "done";
  const over = isRunning && st.elapsed > section.suggested_minutes * 60;

  return (
    <button
      ref={chipRef}
      type="button"
      onClick={onSelect}
      title={section.name}
      aria-current={focused ? "true" : undefined}
      className={`flex max-w-[11rem] shrink-0 items-center gap-2 rounded-pill border px-3 py-1.5 text-left transition-colors ${
        focused ? `bg-neutral-0 ${color.activeBorder} ring-2 ${color.ring}` : "border-neutral-200 bg-neutral-0 hover:bg-neutral-50"
      } ${isDone && !focused ? "opacity-60" : ""}`}
    >
      {isDone ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? `${over ? "bg-coral-400" : color.dot} animate-pulse` : isPaused ? "bg-amber-400" : color.dot}`} />
      )}
      <span className="truncate text-xs font-semibold text-neutral-700">{section.name}</span>
      <span className={`shrink-0 rounded-pill px-1.5 py-px text-[10px] font-semibold ${isDone ? "bg-neutral-100 text-neutral-400" : color.badge}`}>
        {section.suggested_minutes}m
      </span>
    </button>
  );
}

// Full title + description for the focused section, with its timer and controls.
// Auto height: the title is never clamped, so long titles always show in full.
// A very long description scrolls inside its own capped box instead of pushing
// the question deck off-screen.
function SectionDetail({ section, st, color, onStart, onPause, onResume, onDone, locked }) {
  const budget = section.suggested_minutes * 60;
  const pct = Math.min(100, (st.elapsed / budget) * 100);
  const isIdle = st.status === "idle";
  const isRunning = st.status === "running";
  const isPaused = st.status === "paused";
  const isDone = st.status === "done";
  const over = st.elapsed > budget && isRunning;

  const borderClass = isRunning
    ? over ? "border-coral-300" : color.activeBorder
    : isPaused ? "border-amber-300" : "border-neutral-200";
  const barClass = isRunning ? "bg-primary-500" : isPaused ? "bg-amber-400" : isDone ? "bg-neutral-300" : "bg-neutral-200";
  const timerClass = over ? "text-coral-500 animate-pulse" : isRunning ? color.timer : "text-neutral-700";

  return (
    <div className={`overflow-hidden rounded-xl border bg-neutral-0 transition-colors ${borderClass} ${isDone ? "opacity-70" : ""}`}>
      <div className="h-1 bg-neutral-100">
        <div className={`h-1 ${barClass} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 short:py-2">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold leading-snug text-neutral-800">{section.name}</h3>
            <span className={`rounded-pill px-2 py-px text-[10px] font-semibold ${isRunning ? color.badge : isPaused ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
              {STATUS_LABEL[st.status] ?? STATUS_LABEL.idle}
            </span>
          </div>
          {section.description && (
            <p className="scrollbar-hide mt-0.5 max-h-[4.5rem] overflow-y-auto text-xs leading-snug text-neutral-500">
              {section.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className={`${flex.row} items-baseline gap-1`}>
            <span className={`font-mono text-lg font-bold ${timerClass}`}>{formatTimer(st.elapsed)}</span>
            <span className="text-xs text-neutral-400">/ {formatTimer(budget)}</span>
          </div>

          {isIdle && (
            <button
              onClick={onStart}
              disabled={locked}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${locked ? "cursor-not-allowed bg-neutral-200 text-neutral-400" : "bg-primary-500 text-white hover:bg-primary-600"}`}
            >
              Start
            </button>
          )}

          {(isRunning || isPaused) && (
            <div className={`${flex.row} gap-2`}>
              <button
                onClick={isRunning ? onPause : onResume}
                disabled={locked}
                title={isRunning ? "Pause section" : "Resume section"}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${locked ? "cursor-not-allowed bg-neutral-100 text-neutral-300" : color.pauseBg}`}
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
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${locked ? "cursor-not-allowed bg-neutral-100 text-neutral-300" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
              >
                Done
              </button>
            </div>
          )}

          {isDone && (
            <span className={`${flex.row} items-center gap-1.5 text-sm font-semibold text-neutral-400`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Done
            </span>
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
  // The panel follows the running (or paused) section, else the next one still
  // to do; clicking a chip pins another section until the active one changes.
  const activeIdx = sectionStates.findIndex((st) => st?.status === "running" || st?.status === "paused");
  const nextIdx = sectionStates.findIndex((st) => !st || st.status === "idle");
  const [picked, setPicked] = useState(null);
  useEffect(() => setPicked(null), [activeIdx]);
  const focusIdx = Math.min(
    picked ?? (activeIdx !== -1 ? activeIdx : nextIdx !== -1 ? nextIdx : sections.length - 1),
    sections.length - 1
  );
  const focusSection = sections[focusIdx];

  if (!sections.length) return null;

  return (
    <div className="card-flat flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 pt-2.5 short:pt-2 pb-2 short:pb-1.5 border-b border-neutral-100 shrink-0">
        <h2 className="text-base font-semibold text-neutral-800">Interview Sections</h2>
        {!isCompleted && (
          <span className="text-xs font-semibold tabular-nums text-neutral-400">
            {sectionStates.filter((st) => st?.status === "done").length} of {sections.length} done
          </span>
        )}
      </div>

      {isCompleted ? (
        <div className="flex flex-wrap gap-2 px-6 py-2.5 short:py-2">
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
                title={section.description ? `${section.name}: ${section.description}` : section.name}
                className="flex max-w-full items-center gap-2 rounded-pill border border-neutral-200 bg-neutral-0 py-1 pl-1 pr-3 text-left transition-colors hover:border-primary-200 hover:bg-neutral-50"
              >
                <span className={`shrink-0 rounded-pill px-2 py-px font-mono text-[10px] font-semibold ${color.badge}`}>
                  {hasReal ? "" : "~"}{formatTimer(startSec)}
                </span>
                <span className="truncate text-xs font-semibold text-neutral-700">{section.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-6 py-2.5 short:py-2">
          <div
            ref={sectionsScrollRef}
            className="flex items-center gap-2 overflow-x-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {sections.map((section, i) => (
              <SectionChip
                key={i}
                chipRef={(el) => (sectionCardRefs.current[i] = el)}
                section={section}
                st={sectionStates[i] ?? { status: "idle", elapsed: 0 }}
                color={SECTION_COLORS[i % SECTION_COLORS.length]}
                focused={i === focusIdx}
                onSelect={() => setPicked(i)}
              />
            ))}
          </div>

          {focusSection && (
            <SectionDetail
              section={focusSection}
              st={sectionStates[focusIdx] ?? { status: "idle", elapsed: 0 }}
              color={SECTION_COLORS[focusIdx % SECTION_COLORS.length]}
              locked={!isMicActive}
              onStart={() => startSection(focusIdx)}
              onPause={() => pauseSection(focusIdx)}
              onResume={() => resumeSection(focusIdx)}
              onDone={() => doneSection(focusIdx)}
            />
          )}
        </div>
      )}
    </div>
  );
}
