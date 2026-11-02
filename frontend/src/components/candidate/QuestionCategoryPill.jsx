// Coloured category pill for a suggested question. Same palette as the live
// suggestion deck; CV analysis emits the US "behavioral" spelling too.
const PILL = {
  technical: 'bg-mint-100 text-mint-700',
  behavioural: 'bg-sky-100 text-sky-700',
  behavioral: 'bg-sky-100 text-sky-700',
  experience: 'bg-amber-100 text-amber-700',
}

export default function QuestionCategoryPill({ category, className = '' }) {
  if (!category) return null
  return (
    <span
      className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        PILL[category] || 'bg-neutral-100 text-neutral-500'
      } ${className}`}
    >
      {category.charAt(0).toUpperCase() + category.slice(1)}
    </span>
  )
}
