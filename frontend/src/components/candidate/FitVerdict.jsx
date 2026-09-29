export const FIT_METRICS = [
  { key: 'relevant_experience', label: 'Relevant Experience', bar: 'bg-coral-500'   },
  { key: 'technical_fit',       label: 'Technical Fit',       bar: 'bg-primary-500' },
  { key: 'soft_skills',         label: 'Soft Skills',         bar: 'bg-mint-500'    },
]

export default function FitVerdict({ positionFit }) {
  const values = FIT_METRICS
    .map((m) => positionFit?.[m.key])
    .filter((v) => typeof v === 'number')
  if (values.length === 0) return null

  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const [label, chipClass] =
    avg >= 7.5 ? ['Strong fit',   'bg-mint-50 text-mint-700']
    : avg >= 4.5 ? ['Moderate fit', 'bg-sky-50 text-sky-700']
    :              ['Weak fit',     'bg-coral-50 text-coral-700']

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-xs font-bold ${chipClass}`}>
      <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden />
      {label}
      <span className="font-semibold opacity-70 tabular-nums">{avg.toFixed(1)}/10</span>
    </span>
  )
}
