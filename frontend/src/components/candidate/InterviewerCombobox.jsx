import { useEffect, useRef, useState } from 'react'
import { form } from '../../styles/layout'

export default function InterviewerCombobox({ value, onChange, options, onOpenChange }) {
  const [query, setQuery] = useState(value?.label || '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    setQuery(value?.label || '')
  }, [value?.label])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open || !dropdownRef.current) return
    dropdownRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  const q = query.toLowerCase().trim()
  const filtered = q
    ? options.filter((o) =>
        (o.full_name || '').toLowerCase().includes(q) ||
        (o.username || '').toLowerCase().includes(q) ||
        (o.email || '').toLowerCase().includes(q)
      )
    : options

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setOpen(true)
          onChange({ label: next, userId: '' })
        }}
        onFocus={() => setOpen(true)}
        placeholder={options.length === 0 ? 'No interviewers in your company yet' : 'Type to search interviewers…'}
        className={form.input}
      />

      {open && (
        <div ref={dropdownRef} className="scrollbar-primary absolute z-20 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg scroll-mb-8">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-400">
              {options.length === 0
                ? 'No interviewers yet.'
                : `No matches for "${query}".`}
            </div>
          ) : (
            <ul>
              {filtered.map((o) => (
                <li key={o.userid}>
                  <button
                    type="button"
                    onClick={() => {
                      const picked = o.full_name || o.username || o.email || ''
                      onChange({
                        label: picked,
                        userId: o.userid || '',
                      })
                      setQuery(picked)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-primary-500/10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-neutral-800">
                        {o.full_name || o.username}
                      </div>
                      {o.email && (
                        <div className="truncate text-xs text-neutral-400">
                          {o.email}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
