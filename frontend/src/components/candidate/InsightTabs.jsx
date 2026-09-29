import { useState } from 'react'
import { card } from '../../styles/layout'

const INSIGHT_TABS = [
  { key: 'strengths',      label: 'Strengths',      emptyText: 'No strengths identified.',          dot: 'bg-mint-500',  badge: 'bg-mint-100 text-mint-700'  },
  { key: 'improvements',  label: 'Improvements',   emptyText: 'No improvement areas identified.',  dot: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-700'    },
  { key: 'inconsistencies', label: 'Inconsistencies', emptyText: 'No inconsistencies found.',      dot: 'bg-coral-500', badge: 'bg-coral-100 text-coral-700' },
]

export default function InsightTabs({ strengths = [], improvements = [], inconsistencies = [] }) {
  const [active, setActive] = useState('strengths')
  const itemsByKey = { strengths, improvements, inconsistencies }
  const activeTab = INSIGHT_TABS.find((t) => t.key === active)
  const items = itemsByKey[active]

  return (
    <div className={card.sm}>
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 border-b border-neutral-100">
        {INSIGHT_TABS.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs font-semibold transition-colors ${
                isActive ? 'border-primary-500 text-neutral-800' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {t.label}
              <span className={`rounded-pill px-1.5 py-px text-[10px] font-bold tabular-nums ${isActive ? t.badge : 'bg-neutral-100 text-neutral-400'}`}>
                {itemsByKey[t.key].length}
              </span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="py-5 text-center text-sm italic text-neutral-400">{activeTab?.emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((b, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${activeTab?.dot}`} aria-hidden />
                <p className="font-semibold text-neutral-800">{b.title}</p>
              </div>
              <p className="mt-1 pl-3.5 leading-relaxed text-neutral-500">{b.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
