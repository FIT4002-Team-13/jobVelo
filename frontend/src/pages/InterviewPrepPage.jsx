import { card, button, flex } from "../styles/layout";
import FitVerdict from "../components/candidate/FitVerdict.jsx";

function PrepInsightList({ title, items, dot }) {
  if (!items?.length) return null;

  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
        {title}
      </p>
      <ul className={`${flex.col} gap-1.5`}>
        {items.slice(0, 3).map((item, i) => (
          <li
            key={`${item.title}-${i}`}
            className={`${flex.row} items-start gap-2`}
            title={item.detail || undefined}
          >
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill ${dot}`} aria-hidden />
            <span className="text-sm leading-snug text-neutral-700">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InterviewPrepPage({
  analysis,
  scheduledLabel,
  onBegin,
  onViewFullAnalysis,
  isMicActive = false,
  isScreenSharing = false,
  audioStatus,
  onSetupRecording,
  onStopRecording,
}) {
  const analysisQuestions = analysis?.interview_questions ?? [];

  return (
    <div className="scrollbar-primary flex-1 overflow-y-auto px-6 py-10">
      <div className={`mx-auto max-w-2xl ${flex.col} gap-6`}>
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-800">Interview Prep</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {scheduledLabel ? `Scheduled for ${scheduledLabel}` : "Not scheduled yet"}
          </p>
        </div>

        <div className={`${card.base} ${flex.col} gap-5`}>
          <div className={flex.rowBetween}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Briefing</h3>
            {analysis && <FitVerdict positionFit={analysis.position_fit} />}
          </div>

          {analysis ? (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <PrepInsightList title="Strengths" items={analysis.key_strengths} dot="bg-mint-500" />
                <PrepInsightList
                  title="Areas to probe"
                  items={[
                    ...(analysis.improvements ?? []),
                    ...(analysis.inconsistencies ?? []),
                  ]}
                  dot="bg-sky-500"
                />
              </div>
              {onViewFullAnalysis && (
                <button
                  type="button"
                  onClick={onViewFullAnalysis}
                  className="self-start text-sm font-semibold text-primary-500 hover:text-primary-600"
                >
                  View full CV analysis →
                </button>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm italic text-neutral-400">
              No CV analysis for this application yet.
            </p>
          )}
        </div>

        {analysisQuestions.length > 0 && (
          <div className={`${card.base} ${flex.col} gap-4`}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Question Plan</h3>
            <ol className={`${flex.col} gap-2.5`}>
              {analysisQuestions.slice(0, 5).map((q, i) => (
                <li
                  key={`${q.question}-${i}`}
                  className={`${flex.row} items-start gap-3`}
                  title={q.rationale || undefined}
                >
                  <span className="w-4 shrink-0 pt-px text-right text-sm font-semibold tabular-nums text-neutral-300">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm leading-snug text-neutral-700">
                    {q.question}
                  </span>
                  {q.category && (
                    <span className="shrink-0 pt-px text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                      {q.category}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className={`${card.base} ${flex.col} gap-3`}>
          <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Recording Setup</h3>

          <div className={`${flex.row} items-center gap-3`}>
            <span
              className={`w-2 h-2 rounded-pill shrink-0 transition-colors ${
                isMicActive ? "bg-mint-500" : "bg-neutral-300"
              }`}
            />
            <span className="flex-1 text-sm text-neutral-700">
              {isMicActive && isScreenSharing
                ? "Mic + screen share active"
                : isMicActive
                ? "Mic active"
                : "Microphone & screen share"}
            </span>
            {isMicActive ? (
              <button
                type="button"
                onClick={onStopRecording}
                className="text-xs font-medium text-coral-500 hover:text-coral-600"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={onSetupRecording}
                className={`${button.outline} !py-1 !px-3 text-xs`}
              >
                Set up recording
              </button>
            )}
          </div>

          {audioStatus && audioStatus !== "Ready to start recording" && (
            <p
              className={`text-xs ${
                /denied|error|unable|no (microphone|screen)|cancelled/i.test(audioStatus)
                  ? "text-coral-500"
                  : "text-neutral-400"
              }`}
            >
              {audioStatus}
            </p>
          )}
        </div>

        <div className={`${flex.col} items-center gap-2 pt-2`}>
          <button
            type="button"
            onClick={onBegin}
            disabled={!isMicActive}
            className={`${flex.row} gap-2 ${button.primary} !px-8 !py-3 text-base transition-opacity ${
              !isMicActive ? "opacity-40 cursor-not-allowed" : ""
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Begin Interview
          </button>
          <p className="text-xs text-neutral-400">
            {isMicActive
              ? "Ready — click to open the live transcription workspace."
              : "Set up recording above to enable this button."}
          </p>
        </div>
      </div>
    </div>
  );
}
