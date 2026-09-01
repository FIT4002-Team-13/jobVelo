import { useNavigate } from "react-router-dom";
 import { flex } from "../styles/layout";

export default function InterviewPostInterviewPage({
  transcript,
  transcriptEntryRefs,
  highlightedEntryIdx,
  highlightedEntryId,
  onNoteChange,
  onViewReport,
  onBack,
  candId,
  jobId,
}) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-hidden">
      <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-mint-100 bg-mint-50 px-5 py-3">
        <p className="text-sm text-mint-700">
          <span className="font-bold">Interview completed.</span>{" "}
          The transcript below is read-only - open the report for scores,
          strengths and the summary.
        </p>
        <div className={`${flex.row} shrink-0 gap-2`}>
          <button
            type="button"
            onClick={onViewReport}
            className="rounded-xl bg-mint-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-mint-600"
          >
            View Report
          </button>
          <button
            type="button"
            onClick={onBack ?? (() => navigate(candId && jobId ? `/candidates/${candId}/${jobId}` : `/jobs/${jobId}`, { replace: true }))}
            className="rounded-xl border border-mint-200 bg-white px-4 py-1.5 text-sm font-semibold text-mint-700 transition-colors hover:bg-mint-100"
          >
            Back to candidate
          </button>
        </div>
      </div>

      <div className="px-6 py-6 h-[calc(100%-72px)] overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-3">
          {transcript.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center mt-8">
              No transcript recorded for this interview.
            </p>
          ) : (
            transcript.map((entry, i) => (
              <div
                key={entry.id}
                ref={(el) => (transcriptEntryRefs.current[i] = el)}
                className={`rounded-lg transition-colors duration-700 ${
                  highlightedEntryIdx === i || entry.id === highlightedEntryId ? "bg-yellow-50 ring-1 ring-yellow-300" : ""
                }`}
              >
                <div className={`${flex.row} gap-3 py-2`}>
                  <div className={`w-8 h-8 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${
                    entry.speaker === "Interviewer" ? "bg-primary-500" : "bg-sky-500"
                  }`}>
                    {entry.speaker?.slice(0, 2).toUpperCase() || "??"}
                  </div>
                  <div className={`${flex.col} gap-0.5 flex-1 min-w-0`}>
                    <span className="text-xs text-neutral-400">{entry.timestamp}</span>
                    <span className="text-sm text-neutral-700 leading-snug">{entry.text}</span>
                    {entry.comment && (
                      <span className="mt-1 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                        Note: {entry.comment}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
