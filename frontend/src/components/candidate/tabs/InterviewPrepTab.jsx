import { card, flex } from "../../../styles/layout";
import FitVerdict from "../FitVerdict.jsx";
import InterviewPlanCard from "../InterviewPlanCard.jsx";
import QuestionCategoryPill from "../QuestionCategoryPill.jsx";

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

// Shared with InterviewResumeTab so the in-progress landing reads as the same
// briefing the interviewer saw before they began.
export function BriefingCard({ analysis, onViewFullAnalysis }) {
  return (
    <div className={`${card.base} ${flex.col} gap-5`}>
      <div className={flex.rowBetween}>
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Briefing</h3>
        {analysis && <FitVerdict positionFit={analysis.position_fit} />}
      </div>

      {analysis ? (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
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
        <div className={`${flex.rowBetween} gap-4`}>
          <p className="text-sm italic text-neutral-400">No CV analysis for this application yet.</p>
          {onViewFullAnalysis && (
            <button
              type="button"
              onClick={onViewFullAnalysis}
              className="shrink-0 text-sm font-semibold text-primary-500 hover:text-primary-600"
            >
              Run CV analysis →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionPlanCard({ analysis }) {
  const analysisQuestions = analysis?.interview_questions ?? [];
  if (analysisQuestions.length === 0) return null;

  return (
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
            <span className="flex-1 text-sm leading-snug text-neutral-700">{q.question}</span>
            <QuestionCategoryPill category={q.category} />
          </li>
        ))}
      </ol>
      <p className="text-xs text-neutral-400">
        These questions and your plan guide the live session.
      </p>
    </div>
  );
}

export default function InterviewPrepTab({ analysis, scheduledLabel, onViewFullAnalysis, jobId, candId, jobCand }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="scrollbar-primary flex-1 overflow-y-auto px-6 py-6">
        <div className={`mx-auto max-w-6xl ${flex.col} gap-5`}>
          <p className="text-xs text-neutral-400">
            {scheduledLabel ? `Scheduled for ${scheduledLabel}` : "Not scheduled yet"}
          </p>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.1fr]">
            <div className={`${flex.col} gap-5`}>
              <BriefingCard analysis={analysis} onViewFullAnalysis={onViewFullAnalysis} />
              <QuestionPlanCard analysis={analysis} />
            </div>
            <InterviewPlanCard jobId={jobId} candId={candId} jobCand={jobCand} />
          </div>
        </div>
      </div>
    </div>
  );
}
