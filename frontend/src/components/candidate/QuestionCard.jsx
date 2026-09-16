import { useState } from 'react'
import { card } from '../../styles/layout'

const QUESTION_CATEGORY_STYLES = {
  technical:  'bg-primary-100 text-primary-600',
  behavioral: 'bg-mint-100 text-mint-700',
  experience: 'bg-coral-100 text-coral-700',
}

export default function QuestionCard({ items, emptyText }) {
  const [expanded, setExpanded] = useState(() => new Set())

  function toggleRationale(i) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className={card.sm}>
      <h3 className="mb-4 text-lg font-bold text-neutral-800">Suggested Interview Questions</h3>
      {items.length === 0 ? (
        <p className="py-5 text-center text-sm italic text-neutral-400">{emptyText}</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((q, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  QUESTION_CATEGORY_STYLES[q.category] ?? 'bg-neutral-100 text-neutral-500'
                }`}>
                  {q.category}
                </span>
                {q.rationale && (
                  <button
                    type="button"
                    onClick={() => toggleRationale(i)}
                    className="shrink-0 rounded-pill border border-neutral-200 bg-neutral-0 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary-200 hover:text-primary-600"
                  >
                    {expanded.has(i) ? 'Hide note ▾' : 'Why ask this ▸'}
                  </button>
                )}
              </div>
              <p className="font-semibold leading-relaxed text-neutral-800">{q.question}</p>
              {q.rationale && expanded.has(i) && (
                <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-700">
                  {q.rationale}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
