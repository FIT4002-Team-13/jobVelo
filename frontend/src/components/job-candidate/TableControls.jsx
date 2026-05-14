import { useEffect, useRef, useState } from 'react'

// ── Shared dropdown shell ───────────────────────────────────────────────────
// Renders a small "trigger" button and a floating panel below it. Handles:
//   - open/close on click
//   - close on outside click
//   - close on Escape
//   - right-aligned by default (matches the original Sort/Filter buttons sitting
//     at the right edge of a row)
//
// Children can be regular React nodes OR a function ({ close }) => node, so
// menu items can request the menu to close after their click handler fires.
function DropdownButton({ label, icon, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        {icon}
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 min-w-[160px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  )
}


// ── Icons (inlined SVGs to stay consistent with the rest of the codebase) ─

const SortIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M6 12h12M9 18h6" />
  </svg>
)

const FilterIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)


// ── Menu item primitive ────────────────────────────────────────────────────

function MenuItem({ selected, isLast, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left px-4 py-2 text-sm transition-colors
        ${isLast ? '' : 'border-b border-neutral-100'}
        ${selected
          ? 'bg-primary-500/10 font-semibold text-primary-600'
          : 'text-neutral-700 hover:bg-primary-500/10 hover:text-primary-600'}`}
    >
      {children}
    </button>
  )
}


// ── Sort menu ──────────────────────────────────────────────────────────────

export const SORT_OPTIONS = [
  { value: 'latest',    label: 'Latest First' },
  { value: 'oldest',    label: 'Oldest First' },
  { value: 'name_asc',  label: 'Name A - Z'   },
  { value: 'name_desc', label: 'Name Z - A'   },
]

export function SortMenu({ value, onChange, options = SORT_OPTIONS }) {
  return (
    <DropdownButton label="Sort" icon={SortIcon}>
      {({ close }) => (
        <ul>
          {options.map((o, i) => (
            <li key={o.value}>
              <MenuItem
                selected={value === o.value}
                isLast={i === options.length - 1}
                onClick={() => { onChange(o.value); close() }}
              >
                {o.label}
              </MenuItem>
            </li>
          ))}
        </ul>
      )}
    </DropdownButton>
  )
}


// ── Filter menu ────────────────────────────────────────────────────────────
//
// `singleSelect: true` switches the menu to radio-like behaviour:
//   - clicking a different option REPLACES the current selection
//   - clicking the currently-selected option clears it (back to "no filter")
//   - the panel closes after a pick (since there's nothing left to do)
// Use this when there are only two meaningful options (e.g. SCHEDULED vs
// EVALUATED) - multi-select adds no expressiveness and confuses people.
// Default behaviour is multi-select toggle.

export function FilterMenu({ values, onChange, options, singleSelect = false }) {
  function toggle(v, close) {
    if (singleSelect) {
      // Same value clicked again → clear; otherwise replace.
      onChange(values.includes(v) ? [] : [v])
      close?.()
    } else {
      onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
    }
  }

  return (
    <DropdownButton label="Filter" icon={FilterIcon}>
      {({ close }) => (
        options.length === 0 ? (
          <p className="px-4 py-3 text-xs text-neutral-400">No filter options yet.</p>
        ) : (
          <ul>
            {options.map((o, i) => (
              <li key={o.value}>
                <MenuItem
                  selected={values.includes(o.value)}
                  isLast={i === options.length - 1}
                  onClick={() => toggle(o.value, close)}
                >
                  {o.label}
                </MenuItem>
              </li>
            ))}
          </ul>
        )
      )}
    </DropdownButton>
  )
}


// ── Sort comparator factory ────────────────────────────────────────────────
// Returns a comparator usable with Array.prototype.sort, or null if `key`
// doesn't match a known option (callers fall back to their own logic).
//
//   makeSorter('latest', { nameField: 'title', dateField: 'job_created_at' })
//
export function makeSorter(key, { nameField = 'name', dateField = 'created_at' } = {}) {
  switch (key) {
    case 'latest':
      return (a, b) => new Date(b[dateField] ?? 0) - new Date(a[dateField] ?? 0)
    case 'oldest':
      return (a, b) => new Date(a[dateField] ?? 0) - new Date(b[dateField] ?? 0)
    case 'name_asc':
      return (a, b) => (a[nameField] ?? '').localeCompare(b[nameField] ?? '')
    case 'name_desc':
      return (a, b) => (b[nameField] ?? '').localeCompare(a[nameField] ?? '')
    default:
      return null
  }
}
