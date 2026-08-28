import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { page, card } from '../styles/layout'
import { useAuth } from '../lib/AuthContext.jsx'
import { authedFetch } from '../lib/api.js'

// ── Constants ────────────────────────────────────────────────────────────────

// Monday-first, matching how people plan a work week.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Solid event-pill palette (Google-Calendar-style saturated chips). Keyed by
// the application status that rides on each row; the soft-tint versions of
// the same colours are used for status chips elsewhere in the app.
const PILL_STYLES = {
  SCHEDULED:       'bg-primary-500 hover:bg-primary-600 text-white',
  'IN PROGRESS':   'bg-sky-500 hover:bg-sky-600 text-white',
  COMPLETED:       'bg-mint-500 hover:bg-mint-600 text-white',
  EVALUATED:       'bg-mint-500 hover:bg-mint-600 text-white',
  HIRED:           'bg-mint-600 hover:bg-mint-700 text-white',
  REJECTED:        'bg-coral-400 hover:bg-coral-500 text-white',
  CANCELLED:       'bg-neutral-300 hover:bg-neutral-400 text-neutral-600',
}

// Soft-tint chip palette for the hover card - mirrors the status pills on
// the candidates pages.
const CHIP_STYLES = {
  'NOT SCHEDULED': 'bg-neutral-100 text-neutral-500',
  SCHEDULED:       'bg-primary-100 text-primary-600',
  'IN PROGRESS':   'bg-sky-100 text-sky-600',
  COMPLETED:       'bg-mint-100 text-mint-700',
  EVALUATED:       'bg-mint-100 text-mint-700',
  HIRED:           'bg-mint-500 text-white',
  REJECTED:        'bg-coral-100 text-coral-700',
}

const LEGEND = [
  { label: 'Scheduled',   dot: 'bg-primary-500' },
  { label: 'In progress', dot: 'bg-sky-500' },
  { label: 'Completed',   dot: 'bg-mint-500' },
]

// Cap the pills rendered per day cell so a busy day can't blow the row
// height out; the remainder collapses into "+N more" with a native tooltip.
const MAX_PILLS_PER_DAY = 3

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatLongDate(d) {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function getInitials(name = '') {
  const safe = typeof name === 'string' ? name.trim() : ''
  const initials = safe.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
  return initials || '--'
}

// 42 cells (6 weeks) starting the Monday on/before the 1st - a fixed-size
// grid so the calendar never changes height between months.
function buildMonthCells(year, month) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7 // getDay(): 0=Sun; shift to Monday-first
  const start = new Date(year, month, 1 - lead)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )
}

// ── Event pill + hover card ──────────────────────────────────────────────────

function EventPill({ ev, onOpen, direction = 'down', align = 'center' }) {
  // Open upward for the lower weeks (so the card never runs past the bottom
  // of the calendar) and clamp to the cell edge in the first/last columns
  // (so it never pokes out the sides of the page).
  const posClass = direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
  const alignClass =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={`w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold leading-4 transition-colors ${
          PILL_STYLES[ev.status] ?? 'bg-neutral-400 text-white'
        }`}
      >
        {formatTime(ev.when)} · {ev.candidate_name}
      </button>

      {/* Hover card - pure CSS (group-hover), pointer-events off so it can't
          steal the hover from the pill underneath it. */}
      <div
        className={`pointer-events-none absolute z-30 hidden w-64 group-hover:block ${posClass} ${alignClass}`}
      >
        <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-primary-500 text-xs font-bold text-white">
              {getInitials(ev.candidate_name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-800">{ev.candidate_name}</p>
              <p className="truncate text-xs text-neutral-500">{ev.job_title}</p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-col gap-1 text-xs text-neutral-600">
            <p>
              <span className="font-semibold text-neutral-700">{formatLongDate(ev.when)}</span>
              {' · '}
              {formatTime(ev.when)}
            </p>
            {ev.interviewer && <p>Interviewer: {ev.interviewer}</p>}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span
              className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                CHIP_STYLES[ev.status] ?? 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {ev.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const res = await authedFetch(
          `/api/applications?user_id=${encodeURIComponent(user?.userid || '')}`
        )
        if (!res.ok) throw new Error('Failed to load your interview schedule.')
        const data = await res.json()
        setRows(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    }
    if (user?.userid) load()
  }, [user?.userid])

  // Interviews with a real datetime, bucketed per local day and sorted by
  // time within the day.
  const eventsByDay = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      if (!row.interview_datetime) continue
      const when = new Date(row.interview_datetime)
      if (Number.isNaN(when.getTime())) continue
      const ev = { ...row, when }
      const key = dateKey(when)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    for (const list of map.values()) list.sort((a, b) => a.when - b.when)
    return map
  }, [rows])

  const cells = useMemo(() => buildMonthCells(year, month), [year, month])
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const todayKey = dateKey(today)

  function shiftMonth(delta) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const navBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-0 text-neutral-500 transition-colors hover:border-primary-200 hover:text-primary-600'

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        {/* Header - same skeleton as the Jobs / Applications pages. */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">Schedules</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Your upcoming interviews at a glance
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className={`h-2 w-2 rounded-pill ${l.dot}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Month controls */}
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Previous month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className={navBtn} aria-label="Next month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-neutral-800">{monthLabel}</h2>
          <button
            type="button"
            onClick={goToday}
            className="ml-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:border-primary-200 hover:text-primary-600"
          >
            Today
          </button>
        </div>

        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {!loading && error && <p className="text-sm text-coral-500">{error}</p>}

        {!loading && !error && (
          // No overflow-hidden here: the hover cards must be free to float
          // past the calendar's edge. Rounding moves onto the header and
          // the two bottom-corner cells instead.
          <div className={card.flat}>
            {/* Weekday header */}
            <div className="grid grid-cols-7 rounded-t-2xl border-b border-neutral-100 bg-neutral-50">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid - fixed 6 weeks so month switches don't jump height */}
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const inMonth = day.getMonth() === month
                const key = dateKey(day)
                const isToday = key === todayKey
                const dayEvents = eventsByDay.get(key) ?? []
                const hidden = dayEvents.length - MAX_PILLS_PER_DAY
                const col = i % 7
                const week = Math.floor(i / 7)

                return (
                  <div
                    key={key}
                    className={`min-h-[112px] border-b border-r border-neutral-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                      i >= 35 ? 'border-b-0' : ''
                    } ${i === 35 ? 'rounded-bl-2xl' : ''} ${i === 41 ? 'rounded-br-2xl' : ''} ${
                      inMonth ? 'bg-neutral-0' : 'bg-neutral-50'
                    }`}
                  >
                    <div className="mb-1 flex justify-end">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-pill text-xs font-semibold ${
                          isToday
                            ? 'bg-primary-500 text-white'
                            : inMonth
                            ? 'text-neutral-700'
                            : 'text-neutral-300'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {dayEvents.slice(0, MAX_PILLS_PER_DAY).map((ev) => (
                        <EventPill
                          key={ev.application_id}
                          ev={ev}
                          direction={week >= 3 ? 'up' : 'down'}
                          align={col === 0 ? 'left' : col === 6 ? 'right' : 'center'}
                          onOpen={() =>
                            ev.cand_id && ev.job_id && navigate(`/candidates/${ev.cand_id}/${ev.job_id}`)
                          }
                        />
                      ))}
                      {hidden > 0 && (
                        <p
                          className="px-1.5 text-[11px] font-medium text-neutral-400"
                          title={dayEvents
                            .slice(MAX_PILLS_PER_DAY)
                            .map((ev) => `${formatTime(ev.when)} ${ev.candidate_name} — ${ev.job_title}`)
                            .join('\n')}
                        >
                          +{hidden} more
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !error && rows.every((r) => !r.interview_datetime) && (
          <p className="mt-4 text-sm text-neutral-400">
            No scheduled interviews yet — interviews you&apos;re assigned to will appear here once
            they have a date.
          </p>
        )}
      </main>
    </div>
  )
}
