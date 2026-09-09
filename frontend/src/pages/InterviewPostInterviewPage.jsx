import { flex } from "../styles/layout";

export default function InterviewPostInterviewPage({
  transcript,
  transcriptEntryRefs,
  highlightedEntryIdx,
  highlightedEntryId,
  interviewerLabel,
}) {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="px-6 py-6 h-full overflow-y-auto">
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
                    entry.speaker === interviewerLabel ? "bg-primary-500" : "bg-sky-500"
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
