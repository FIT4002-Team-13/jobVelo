import { card, button, flex } from "../../../styles/layout";
import { formatTimer } from "../../../utils/time.js";
import { BriefingCard, QuestionPlanCard } from "./InterviewPrepTab.jsx";

// How many of the most recent transcript lines to show as a "where you left
// off" refresher - enough for context without turning into the full log.
const RECENT_LINES = 4;

function formatLastSaved(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function Stat({ label, value }) {
  return (
    <div className={flex.col}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700/70">{label}</span>
      <span className="text-base font-bold tabular-nums text-amber-900">{value}</span>
    </div>
  );
}

function RecentTranscriptCard({ transcript, interviewerLabel }) {
  const recent = transcript.slice(-RECENT_LINES);

  return (
    <div className={`${card.base} ${flex.col} gap-4`}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Where you left off</h3>
      {recent.length === 0 ? (
        <p className="text-sm italic text-neutral-400">Nothing was transcribed before the session paused.</p>
      ) : (
        <ul className={`${flex.col} gap-3`}>
          {recent.map((entry, i) => (
            <li key={entry.id ?? i} className={`${flex.row} items-start gap-3`}>
              <span className="w-10 shrink-0 pt-px text-xs font-semibold tabular-nums text-neutral-300">
                {entry.timestamp}
              </span>
              <div className={`${flex.col} min-w-0 flex-1`}>
                <span
                  className={`text-xs font-bold ${
                    entry.speaker === interviewerLabel ? "text-primary-500" : "text-neutral-500"
                  }`}
                >
                  {entry.speaker || "Unknown"}
                </span>
                <span className="line-clamp-2 text-sm leading-snug text-neutral-700">{entry.text}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Read-only on purpose: the live session already captured these sections into
// the interview record, so editing the job-candidate plan here would have no
// effect on the running interview.
function SessionPlanCard({ sections }) {
  return (
    <div className={`${card.base} ${flex.col} gap-4`}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Session Plan</h3>
      {sections.length === 0 ? (
        <p className="text-sm italic text-neutral-400">
          This session is running without timed sections.
        </p>
      ) : (
        <ol className={`${flex.col} gap-2.5`}>
          {sections.map((s, i) => (
            <li key={`${s.name}-${i}`} className={`${flex.row} items-start gap-3`}>
              <span className="w-4 shrink-0 pt-px text-right text-sm font-semibold tabular-nums text-neutral-300">
                {i + 1}
              </span>
              <span className="flex-1 text-sm leading-snug text-neutral-700">{s.name}</span>
              {s.suggested_minutes != null && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-400">
                  {s.suggested_minutes}m
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Landing view for an interview that's already IN PROGRESS - the counterpart
 * to InterviewPrepTab. Lets the interviewer check where things stand (and
 * review the candidate via the CV / Cover Letter tabs) before deliberately
 * jumping back into the live recording workspace.
 */
export default function InterviewResumeTab({ interview, analysis, interviewerLabel, onResume, onViewFullAnalysis }) {
  const transcript = Array.isArray(interview?.intv_transcript) ? interview.intv_transcript : [];
  const sections = Array.isArray(interview?.intv_sections) ? interview.intv_sections : [];
  const lastSaved = formatLastSaved(interview?.intv_updated_at);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="scrollbar-primary flex-1 overflow-y-auto px-6 py-6">
        <div className={`mx-auto max-w-6xl ${flex.col} gap-5`}>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className={`${flex.rowBetween} flex-wrap gap-4`}>
              <div className={`${flex.row} items-center gap-3`}>
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-amber-500 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-pill bg-amber-500" />
                </span>
                <div className={flex.col}>
                  <span className="text-sm font-bold text-amber-900">Interview in progress</span>
                  <span className="text-xs text-amber-700">
                    {lastSaved ? `Last saved ${lastSaved}` : "Not saved yet"}
                  </span>
                </div>
              </div>
              <div className={`${flex.row} gap-8`}>
                <Stat label="Recorded" value={formatTimer(interview?.intv_duration_seconds ?? 0)} />
                <Stat label="Transcript lines" value={transcript.length} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.1fr]">
            <div className={`${flex.col} gap-5`}>
              <RecentTranscriptCard transcript={transcript} interviewerLabel={interviewerLabel} />
              <BriefingCard analysis={analysis} onViewFullAnalysis={onViewFullAnalysis} />
            </div>
            <div className={`${flex.col} gap-5`}>
              <SessionPlanCard sections={sections} />
              <QuestionPlanCard analysis={analysis} />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-neutral-0 px-6 py-3">
        <div className={`mx-auto max-w-6xl ${flex.rowBetween} gap-4`}>
          <p className="text-xs text-neutral-400">
            Picks up the session where it stopped - you&apos;ll grant mic access again to keep recording.
          </p>
          {onResume && (
            <button
              type="button"
              onClick={onResume}
              className={`${flex.row} shrink-0 gap-2 ${button.primary} !px-8 !py-2.5 text-base`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Resume Interview
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
