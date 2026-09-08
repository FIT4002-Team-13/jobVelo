import { useEffect, useState } from "react";
import { badge, button } from "../../styles/layout";

export function normaliseQuestion(question, index = 0, isFollowUp = false, isNew = false) {
  const isTechnical = question.category === "technical";

  return {
    id: `${Date.now()}-${index}-${Math.random()}`,
    category: isTechnical ? "Technical" : "Behavioural",
    categoryValue: isTechnical ? "technical" : "behavioural",
    categoryColor: isTechnical ? "bg-mint-100 text-mint-700" : "bg-sky-100 text-sky-700",
    text: question.question,
    why: question.reason,
    isFollowUp,
    isNew,
  };
}

export function QuestionCard({ q, onMoreLike, onIgnore, isGeneratingSimilar }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [glow, setGlow] = useState(Boolean(q.isNew));

  useEffect(() => {
    if (!q.isNew) return undefined;
    const t = setTimeout(() => setGlow(false), 6000);
    return () => clearTimeout(t);
  }, [q.isNew]);

  return (
    <div
      className={`flex w-[290px] shrink-0 flex-col rounded-2xl border bg-neutral-0 p-4 ${
        glow ? "new-question-glow" : "border-neutral-200"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`${badge.sm} ${q.categoryColor}`}>{q.category}</span>
          {q.isFollowUp && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-600">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M4 9h10a6 6 0 0 1 6 6v2" />
              </svg>
              Follow-up
            </span>
          )}
        </div>
        <div className="flex gap-1 text-neutral-300">
          <button className="rounded-lg p-1 transition-colors hover:bg-mint-50 hover:text-mint-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button className="rounded-lg p-1 transition-colors hover:bg-coral-50 hover:text-coral-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto">
        <p className="text-base leading-relaxed text-neutral-800">{q.text}</p>
        {whyOpen && (
          <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500">
            {q.why}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5 shrink-0">
        <button
          onClick={() => onIgnore?.(q)}
          className={`${button.danger} w-full py-1.5 text-xs font-semibold rounded-lg`}
        >
          Ignore
        </button>
        <button
          onClick={() => onMoreLike(q)}
          disabled={isGeneratingSimilar}
          className="w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingSimilar ? "Generating…" : "More like this"}
        </button>
        <button
          onClick={() => setWhyOpen((o) => !o)}
          className="flex items-center justify-start gap-1.5 pt-0.5 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {whyOpen ? "Hide" : "Why?"}
        </button>
      </div>
    </div>
  );
}

export function SuggestedQuestionDeck({
  questions,
  questionsLoading,
  questionsError,
  displayedQuestions,
  similarQuestionId,
  onMoreLike,
  onIgnore,
}) {
  return (
    <div className="card-flat flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 pt-3.5 pb-2.5 shrink-0">
        <h2 className="text-base font-semibold text-neutral-800">Suggested Questions</h2>
        {questions.length > 0 && (
          <span className="text-xs font-semibold text-neutral-300">{questions.length}</span>
        )}
      </div>

      {questionsLoading ? (
        <div className="flex-row-center flex-1">
          <p className="text-sm text-neutral-400">Generating questions…</p>
        </div>
      ) : questionsError && questions.length === 0 ? (
        <div className="flex-row-center flex-1 px-6">
          <p className="text-sm text-coral-500 text-center">{questionsError}</p>
        </div>
      ) : displayedQuestions.length === 0 ? (
        <div className="flex-row-center flex-1">
          <p className="text-sm text-neutral-400">No suggested questions available.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
          <div className="flex h-full items-stretch gap-4">
            {displayedQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                onMoreLike={onMoreLike}
                onIgnore={onIgnore}
                isGeneratingSimilar={similarQuestionId === q.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
