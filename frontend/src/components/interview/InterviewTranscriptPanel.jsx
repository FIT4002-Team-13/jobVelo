import { useState } from "react";
import { flex } from "../../styles/layout";

export function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-primary-400",
  "bg-sky-400",
  "bg-mint-500",
  "bg-coral-400",
  "bg-primary-600",
  "bg-sky-600",
  "bg-mint-600",
  "bg-coral-600",
];

export function avatarColor(name = "") {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function TranscriptEntry({ entry, onNoteChange, highlighted }) {
  const [editing, setEditing] = useState(false);
  const hasNote = !!entry.comment;

  return (
    <div className={`${flex.col} py-2 group`}>
      <div
        id={`transcript-entry-${entry.id}`}
        className={`${flex.row} gap-3 py-2 group rounded-lg transition-colors ${
          highlighted ? "bg-coral-50 ring-1 ring-coral-200" : ""
        }`}
      >
        <div
          className={`w-8 h-8 rounded-pill ${
            flex.rowCenter
          } text-white text-xs font-bold shrink-0 ${avatarColor(entry.speaker)}`}
        >
          {initials(entry.speaker)}
        </div>
        <div className={`${flex.col} gap-0.5 flex-1 min-w-0`}>
          <span className="text-xs text-neutral-400">{entry.timestamp}</span>
          <span className="text-sm text-neutral-700 leading-snug">
            {entry.text}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((o) => !o)}
          title={hasNote ? "Edit note" : "Add note"}
          className={`shrink-0 self-start mt-1 p-1 rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-primary-500 ${
            editing || hasNote ? "text-primary-500" : "text-neutral-400"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      {editing && (
        <div className="ml-11 mt-1.5 relative">
          <textarea
            autoFocus
            value={entry.comment ?? ""}
            onChange={(e) => onNoteChange(entry.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            placeholder="Add a note…"
            rows={2}
            className="w-full text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 pr-9 resize-none focus:outline-none focus:border-primary-300 placeholder-neutral-400"
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            title="Save note"
            aria-label="Save note"
            className="absolute right-2 bottom-2 p-1 text-primary-500 hover:text-primary-600 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4 4L19 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export function BiasWarningBanner({ warning, onDismiss, onJumpTo, isLatest }) {
  const [expanded, setExpanded] = useState(isLatest);
  
  return (
    <div className="flex shrink-0 items-start gap-3 bg-coral-50 border border-coral-200 rounded-xl px-4 py-3">
      <svg
        className="shrink-0 text-coral-500 mt-0.5"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse bias warning" : "Expand bias warning"}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <p className="text-sm font-semibold text-coral-700">
            Possibly biased question
            {warning.category ? ` — ${warning.category}` : ""}
          </p>
          <svg
            className={`shrink-0 text-coral-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {expanded && (
          <>
            <button
              onClick={onJumpTo}
              className="text-xs text-coral-600 italic mt-0.5 text-left hover:underline"
              title="Jump to this line in the transcript"
            >
              &ldquo;{warning.quote}&rdquo;
            </button>
            {warning.reason && (
              <p className="text-xs text-coral-700 mt-1">{warning.reason}</p>
            )}
            {warning.suggestion && (
              <p className="text-xs text-neutral-600 mt-1">
                <span className="font-medium">Try instead:</span>{" "}
                {warning.suggestion}
              </p>
            )}
          </>
        )}
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-coral-400 hover:text-coral-700 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export function TranscriptPanel({
  transcript,
  transcriptVisible,
  setTranscriptVisible,
  hasNewTranscriptUpdates,
  showLatestTranscript,
  onNoteChange,
  highlightedEntryIdx,
  highlightedEntryId,
  transcriptContainerRef,
  transcriptEntryRefs,
  biasWarnings,
  dismissBiasWarning,
  jumpToTranscriptEntry,
  isScreenSharing,
  videoRef,
}) {
  return (
    <div className="card-base relative isolate flex flex-col w-[48%] overflow-hidden p-0 pt-3">
      <div className={`${flex.rowBetween} px-6 pt-1 pb-1 border-b border-neutral-100 shrink-0`}>
        <span className="text-base font-semibold text-neutral-800">Live Transcription</span>
        <div className={`${flex.row} gap-3 items-center`}>
          {hasNewTranscriptUpdates && transcriptVisible && (
            <button
              type="button"
              onClick={showLatestTranscript}
              className="text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors inline-flex items-center gap-2"
            >
              <span aria-hidden="true" className="w-2 h-2 rounded-pill bg-primary-500 animate-pulse" />
              New Updates
            </button>
          )}
          <button
            onClick={() => setTranscriptVisible((v) => !v)}
            className={`text-sm ${
              transcriptVisible ? "text-neutral-400 hover:text-neutral-600" : "text-primary-500 hover:text-primary-600"
            } transition-colors`}
          >
            {transcriptVisible ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {biasWarnings.length > 0 && (
        <div className={`${flex.col} gap-2 absolute top-12 bottom-0 left-0 right-0 z-50 overflow-y-auto px-6 pt-4 pb-6 scrollbar-primary`}>
          {biasWarnings.map((warning, index) => (
            <BiasWarningBanner
              key={warning.id}
              warning={warning}
              isLatest={index === biasWarnings.length - 1}
              onDismiss={() => dismissBiasWarning(warning.id)}
              onJumpTo={() => jumpToTranscriptEntry(warning.quote)}
            />
          ))}
        </div>
      )}

      {transcriptVisible && (
        <div
          className="flex-1 min-h-[200px] overflow-y-auto px-6 py-3 scrollbar-primary scroll-auto"
          ref={transcriptContainerRef}
        >
          {transcript.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center mt-8">
              Transcription will appear here once the interview starts.
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
                <TranscriptEntry
                  entry={entry}
                  highlighted={entry.id === highlightedEntryId}
                  onNoteChange={onNoteChange}
                />
              </div>
            ))
          )}
        </div>
      )}

      {isScreenSharing && (
        <div className="relative z-0 shrink-0 border-t border-neutral-100 pt-4 px-6 pb-4">
          <p className="text-xs text-neutral-500 mb-2 font-medium">Screen Share</p>
          <video
            ref={videoRef}
            autoPlay
            muted
            className="relative z-0 w-full h-40 bg-neutral-900 rounded-lg object-cover"
          />
        </div>
      )}
    </div>
  );
}
