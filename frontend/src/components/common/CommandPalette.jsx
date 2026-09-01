import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, Briefcase, Users, Search } from 'lucide-react'
import { authedFetch } from '../../lib/api.js'
import { useAuth } from '../../lib/AuthContext.jsx'

// Global quick-nav (Ctrl+K / Cmd+K). Searches jobs, candidates and pages in
// one box and jumps straight to the match. Data is fetched lazily the first
// time the palette opens (and cached for the session) so idle pages pay
// nothing.

const PAGES = [
  { label: 'Dashboard',  path: '/dashboard',  icon: <LayoutDashboard size={14} /> },
  { label: 'Schedules',  path: '/schedules',  icon: <CalendarDays size={14} /> },
  { label: 'Jobs',       path: '/jobs',       icon: <Briefcase size={14} /> },
  { label: 'Candidates', path: '/candidates', icon: <Users size={14} /> },
]

const MAX_PER_GROUP = 5

export default function CommandPalette() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [jobs, setJobs] = useState(null) // null = not fetched yet
  const [apps, setApps] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  // Global shortcut. Registered once; ignores the shortcut when the user is
  // typing in an input that already owns Ctrl+K (none today, but cheap).
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    // Custom event lets any UI (e.g. the sidebar search button) open the
    // palette without lifting state up through the tree.
    function onOpenEvent() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpenEvent)
    }
  }, [])

  // Lazy data load on first open. Both fetches are best-effort - a failed
  // one just leaves that group out of the results.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    // Focus after the panel paints.
    setTimeout(() => inputRef.current?.focus(), 0)

    if (jobs === null) {
      authedFetch('/api/jobs')
        .then(async (r) => {
          const data = r.ok ? await r.json().catch(() => []) : []
          setJobs(Array.isArray(data) ? data : [])
        })
        .catch(() => setJobs([]))
    }
    if (apps === null && user?.userid) {
      authedFetch(`/api/applications?user_id=${encodeURIComponent(user.userid)}`)
        .then(async (r) => {
          const data = r.ok ? await r.json().catch(() => []) : []
          setApps(Array.isArray(data) ? data : [])
        })
        .catch(() => setApps([]))
    }
  }, [open, jobs, apps, user?.userid])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const match = (s) => (s ?? '').toLowerCase().includes(needle)

    const pageHits = PAGES.filter((p) => !needle || match(p.label)).map((p) => ({
      group: 'Pages',
      key: `page-${p.path}`,
      icon: p.icon,
      title: p.label,
      subtitle: null,
      to: p.path,
    }))

    const jobHits = (jobs ?? [])
      .filter((j) => !needle || match(j.title))
      .slice(0, MAX_PER_GROUP)
      .map((j) => ({
        group: 'Jobs',
        key: `job-${j.id}`,
        icon: <Briefcase size={14} />,
        title: j.title || 'Untitled role',
        subtitle: j.status || null,
        to: `/jobs/${j.id}`,
      }))

    const candHits = (apps ?? [])
      .filter((a) => !needle || match(a.candidate_name) || match(a.job_title))
      .slice(0, MAX_PER_GROUP)
      .map((a) => ({
        group: 'Candidates',
        key: `cand-${a.application_id}`,
        icon: <Users size={14} />,
        title: a.candidate_name || 'Unknown',
        subtitle: a.job_title || null,
        to: a.cand_id && a.job_id ? `/candidates/${a.cand_id}/${a.job_id}` : null,
      }))
      .filter((r) => r.to)

    // With no query, lead with pages (cheap nav); with a query, lead with
    // the data hits since that's what the user is actually hunting for.
    return needle
      ? [...candHits, ...jobHits, ...pageHits]
      : [...pageHits, ...jobHits, ...candHits]
  }, [query, jobs, apps])

  const go = useCallback(
    (item) => {
      if (!item?.to) return
      setOpen(false)
      navigate(item.to)
    },
    [navigate]
  )

  function onInputKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[activeIndex])
    }
  }

  if (!open) return null

  // Group headers are derived on the fly while rendering the flat result
  // list, so keyboard indexing stays a simple flat array.
  let lastGroup = null

  // Portal to <body>: the palette is mounted inside the sidebar, whose
  // `position: sticky` creates a stacking context - rendered in place, NO
  // z-index could lift the palette above content painted after the aside.
  // Escaping to the body puts it in the root context, above everything.
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-neutral-900/40 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-0 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <Search size={16} className="shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search jobs, candidates, pages…"
            className="flex-1 border-none bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
          />
          <kbd className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
            ESC
          </kbd>
        </div>

        <div className="scrollbar-primary max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">
              No matches for &quot;{query}&quot;.
            </p>
          ) : (
            results.map((item, i) => {
              const header =
                item.group !== lastGroup ? (
                  <p
                    key={`h-${item.group}`}
                    className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400"
                  >
                    {item.group}
                  </p>
                ) : null
              lastGroup = item.group
              return (
                <div key={item.key}>
                  {header}
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                      i === activeIndex ? 'bg-primary-500/10' : ''
                    }`}
                  >
                    <span
                      className={
                        i === activeIndex ? 'text-primary-500' : 'text-neutral-400'
                      }
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-neutral-700">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="truncate text-xs text-neutral-400">
                        {item.subtitle}
                      </span>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
