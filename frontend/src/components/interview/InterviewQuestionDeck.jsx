import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, CornerDownRight, Sparkles, X } from "lucide-react";
import { badge } from "../../styles/layout";

// Three topic categories, matching the CV-analysis report. US "behavioral" and
// anything unexpected fold into behavioural.
const CATEGORY_META = {
  technical: { label: "Technical", color: "bg-mint-100 text-mint-700" },
  behavioural: { label: "Behavioural", color: "bg-sky-100 text-sky-700" },
  experience: { label: "Experience", color: "bg-amber-100 text-amber-700" },
};

export function normaliseQuestion(question, index = 0, isFollowUp = false, isNew = false) {
  const value =
    question.category === "technical"
      ? "technical"
      : question.category === "experience"
      ? "experience"
      : "behavioural";
  const meta = CATEGORY_META[value];

  return {
    id: `${Date.now()}-${index}-${Math.random()}`,
    category: meta.label,
    categoryValue: value,
    categoryColor: meta.color,
    text: question.question,
    why: question.reason,
    isFollowUp,
    isNew,
  };
}

// The question text is the focal point of the card. Dismissing is a small
// corner action; "More like this" and "Why?" sit in one quiet footer row.
export function QuestionCard({ q, onMoreLike, onIgnore, isGeneratingSimilar }) {
  const [whyOpen, setWhyOpen] = useState(false);
  // A light, brief glow marking a newly generated question - clears itself just
  // after the 2-cycle animation so it's a quick nudge, not a constant pulse.
  const [glow, setGlow] = useState(Boolean(q.isNew));

  useEffect(() => {
    if (!q.isNew) return undefined;
    const t = setTimeout(() => setGlow(false), 2500);
    return () => clearTimeout(t);
  }, [q.isNew]);

  return (
    <div
      className={`flex w-[300px] short:w-[272px] shrink-0 snap-start flex-col rounded-2xl border bg-neutral-0 p-4 short:p-3.5 ${
        glow ? "new-question-glow" : "border-neutral-200"
      }`}
    >
      <div className="mb-2.5 flex shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={`${badge.sm} ${q.categoryColor}`}>{q.category}</span>
          {q.isFollowUp && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-600">
              <CornerDownRight size={10} strokeWidth={2.5} />
              Follow-up
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onIgnore?.(q)}
          aria-label="Ignore"
          title="Ignore this question"
          className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-coral-50 hover:text-coral-500"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        <p className="text-[15px] font-medium leading-relaxed text-neutral-800">{q.text}</p>
        {whyOpen && (
          <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500">
            {q.why}
          </p>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-neutral-100 pt-2.5 short:mt-2 short:pt-2">
        <button
          type="button"
          onClick={() => onMoreLike(q)}
          disabled={isGeneratingSimilar}
          className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles size={13} />
          {isGeneratingSimilar ? "Generating…" : "More like this"}
        </button>
        <button
          type="button"
          onClick={() => setWhyOpen((o) => !o)}
          aria-expanded={whyOpen}
          className="-mr-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
        >
          <CircleHelp size={13} />
          {whyOpen ? "Hide" : "Why?"}
        </button>
      </div>
    </div>
  );
}

// Horizontal strip with arrow buttons and an edge fade only on the side that
// still has cards hidden, so it is obvious there is more to scroll to.
function QuestionStrip({ children, resetKey }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, resetKey]);

  function scrollBy(dir) {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  }

  const arrow =
    "absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-neutral-0 text-neutral-500 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-800";

  // Inset by px-6 - the same gutter the section panel uses - so both panels
  // share left and right edges. Hidden cards fade out via a mask on the
  // scroller instead of bleeding to the card border.
  const fade = 28;
  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "#000"} 0, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.right ? "transparent" : "#000"} 100%)`;

  return (
    <div className="relative min-h-0 flex-1 px-6 py-3 short:py-2">
      <div
        ref={ref}
        onScroll={measure}
        style={{ WebkitMaskImage: mask, maskImage: mask }}
        className="scrollbar-hide flex h-full snap-x snap-proximity items-stretch gap-3 overflow-x-auto overflow-y-hidden"
      >
        {children}
      </div>
      {edges.left && (
        <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous questions" className={`${arrow} left-3`}>
          <ChevronLeft size={16} />
        </button>
      )}
      {edges.right && (
        <button type="button" onClick={() => scrollBy(1)} aria-label="Next questions" className={`${arrow} right-3`}>
          <ChevronRight size={16} />
        </button>
      )}
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
    <div className="card-flat flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 pt-2.5 short:pt-2 pb-2 short:pb-1.5 shrink-0">
        <h2 className="text-base font-semibold text-neutral-800">Suggested Questions</h2>
        {questions.length > 0 && (
          <span className="text-xs font-semibold text-neutral-400">{displayedQuestions.length} to ask</span>
        )}
      </div>

      {questionsLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-400">Generating questions…</p>
        </div>
      ) : questionsError && questions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-sm text-coral-500 text-center">{questionsError}</p>
        </div>
      ) : displayedQuestions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-400">No suggested questions available.</p>
        </div>
      ) : (
        <QuestionStrip resetKey={displayedQuestions.length}>
          {displayedQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              onMoreLike={onMoreLike}
              onIgnore={onIgnore}
              isGeneratingSimilar={similarQuestionId === q.id}
            />
          ))}
        </QuestionStrip>
      )}
    </div>
  );
}
