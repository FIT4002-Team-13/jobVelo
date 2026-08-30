import { useState } from "react";

const RATING_ITEMS = [
  {
    key: "communication",
    label: "Communication",
    textColor: "text-primary-500",
  },
  {
    key: "technical_skills",
    label: "Technical Skills",
    textColor: "text-coral-500",
  },
  {
    key: "problem_solving",
    label: "Problem Solving",
    textColor: "text-mint-600",
  },
];

export default function ScoreEvidencePopup({ ratings, onClose }) {
    const [openRatings, setOpenRatings] = useState(() => new Set());

    function toggleRating(ratingKey) {setOpenRatings((current) => {
        const updated = new Set(current);

        if (updated.has(ratingKey)) {
        updated.delete(ratingKey);
        } else {
        updated.add(ratingKey);
        }

        return updated;
    });
    }

  if (!ratings) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 p-6" role="dialog" aria-modal="true" aria-labelledby="evidence-popup-title">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] bg-neutral-0 p-8 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between">
          <h2 id="evidence-popup-title" className="text-2xl font-semibold text-neutral-900">
            Score and Evidence
          </h2>

          <button type="button" onClick={onClose} className="text-3xl leading-none text-neutral-700 hover:text-neutral-900" aria-label="Close score evidence">
            ×
          </button>
        </div>

        <div className="mt-7 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
          {RATING_ITEMS.map((item) => {
            const rating = ratings[item.key];
            const evidence = Array.isArray(rating?.evidence) ? rating.evidence : [];
            const isOpen = openRatings.has(item.key);
            const score = Number(rating?.score ?? 0);

            return (
              <section key={item.key} className="shrink-0 overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-0 shadow-md">
                <button type="button" onClick={() => toggleRating(item.key)} className="flex w-full items-center justify-between px-6 py-4 text-left">
                    <span className={`text-lg font-semibold ${item.textColor}`}>
                        {rating?.skill || item.label}
                    </span>

                    <div className="flex items-center gap-5">
                        <span className="font-semibold text-neutral-900">
                            {score.toFixed(1)}/10.0
                        </span>

                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </button>

                {isOpen && (
                    <div className="border-t border-neutral-100 px-4 pb-5 pt-3">
                    {rating?.explanation && (
                        <div className="mb-4 rounded-xl bg-neutral-50 px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                            Why this score?
                            </p>

                            <p className="mt-1 text-sm leading-relaxed text-neutral-800">
                            {rating.explanation}
                            </p>
                        </div>
                    )}
                    {evidence.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {evidence.map((entry) => (
                            <div key={entry.transcript_entry_id} className="flex items-start gap-5 rounded-xl border border-neutral-100 bg-neutral-0 p-4 shadow-sm">
                                <span className="shrink-0 rounded-md bg-primary-100 px-3 py-1 text-sm font-medium text-primary-500">
                                    {entry.timestamp}
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-neutral-500">
                                        {entry.speaker}
                                    </p>

                                    <p className="mt-1 whitespace-normal break-words text-sm leading-relaxed text-neutral-800">
                                        “{entry.text}”
                                    </p>
                                </div>
                            </div>
                        ))}
                        </div>
                    ) : (
                        <p className="py-4 text-center text-sm text-neutral-400">
                            No supporting transcript evidence is available.
                        </p>
                    )}
                    </div>
                )}
                </section>
                );
            })}
            </div>
        </div>
    </div>
    );
}