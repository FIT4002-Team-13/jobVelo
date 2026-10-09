import React, { useState, useMemo } from 'react'
import {
  Activity, AlertTriangle, Briefcase, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Gauge, ShieldAlert, Users,
} from 'lucide-react'
import Sidebar from '../components/common/Sidebar.jsx'
import ConsistencyChart from '../components/analytics/ConsistencyChart.jsx'
import { initials, seriesFor, TEAM_COLOR } from '../components/analytics/chartSeries.js'
import { card, page } from '../styles/layout.js'
import { api } from '../lib/api.js'
import { useAsync } from '../hooks/useAsync.js'

const VARIANCE_THRESHOLD = 1.5
const DEFAULT_DAYS = 90

const RANGES = [[30, '30 days'], [90, '90 days'], [180, '6 months'], [0, 'All time']]

// Colour meaning on this page: amber = scoring variance, coral = bias flags,
// mint = healthy. Series colours (see chartSeries.js) never reuse those.
const SKILLS = [
  { key: 'technical',       label: 'Technical skills', bar: 'bg-primary-500' },
  { key: 'communication',   label: 'Communication',    bar: 'bg-mint-500' },
  { key: 'problem_solving', label: 'Problem solving',  bar: 'bg-sky-400' },
]

const CAT_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'technical', label: 'Technical' },
  { key: 'communication', label: 'Communication' },
  { key: 'problem_solving', label: 'Problem solving' },
]

const TH = 'whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-neutral-500'

const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`

function varianceCls(v) {
  return v > VARIANCE_THRESHOLD ? 'text-amber-700' : 'text-mint-700'
}

function formatBiasTime(ts) {
  if (!ts) return ''
  if (typeof ts === 'string' && ts.includes(':')) return ts
  if (typeof ts === 'number') {
    const m = Math.floor(ts / 60), s = ts % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return String(ts)
}

function biasCategoryCls(cat) {
  if (!cat) return 'bg-neutral-100 text-neutral-600'
  const l = cat.toLowerCase()
  if (l.includes('gender') || l.includes('race') || l.includes('ethnic')) return 'bg-coral-100 text-coral-700'
  if (l.includes('age')) return 'bg-amber-100 text-amber-700'
  if (l.includes('edu') || l.includes('school') || l.includes('univer')) return 'bg-sky-100 text-sky-700'
  if (l.includes('personal') || l.includes('family') || l.includes('marital')) return 'bg-primary-100 text-primary-700'
  return 'bg-neutral-100 text-neutral-600'
}

// ── Shared building blocks ────────────────────────────────────────────────────

function CardHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4">
      <div>
        <h2 className="text-base font-bold text-neutral-800">{title}</h2>
        <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function Avatar({ name, idx, size = 'sm' }) {
  const dims = size === 'md' ? 'h-9 w-9' : 'h-7 w-7'
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white`}
      style={{ backgroundColor: seriesFor(idx).color }}
    >
      {initials(name)}
    </div>
  )
}

function StatusBadge({ highVariance }) {
  const base = 'inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold'
  return highVariance
    ? <span className={`${base} bg-amber-100 text-amber-700`}><AlertTriangle size={12} aria-hidden="true" />High variance</span>
    : <span className={`${base} bg-mint-100 text-mint-700`}><CheckCircle2 size={12} aria-hidden="true" />Consistent</span>
}

function FlagPill({ count }) {
  return count > 0
    ? <span className="rounded-pill border border-coral-100 bg-coral-50 px-2.5 py-1 text-xs font-semibold text-coral-700">{plural(count, 'flag')}</span>
    : <span className="rounded-pill border border-mint-200 bg-mint-50 px-2.5 py-1 text-xs font-semibold text-mint-700">No flags</span>
}

function ScoreBar({ score, barCls }) {
  const pct = score != null ? Math.min(100, Math.round((score / 10) * 100)) : 0
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-neutral-100">
      <div className={`h-full rounded-pill ${barCls} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function KpiCard({ icon: Icon, tint, label, value, unit, note, tone }) {
  const border = tone === 'warn' ? 'border-amber-200' : tone === 'bad' ? 'border-coral-200' : 'border-neutral-200'
  const noteCls = tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-coral-600' : 'text-neutral-400'
  return (
    <div className={`flex items-center gap-4 rounded-2xl border ${border} bg-neutral-0 px-5 py-5 shadow-sm`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
        <p className="text-3xl font-extrabold leading-tight text-neutral-900 tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-neutral-400">{unit}</span>}
        </p>
        <p className={`text-xs font-semibold ${noteCls}`}>{note}</p>
      </div>
    </div>
  )
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-xl border border-neutral-200 text-sm font-semibold">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`whitespace-nowrap px-4 py-1.5 transition-colors motion-reduce:transition-none ${
            value === key ? 'bg-primary-500 text-white' : 'bg-neutral-0 text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function SkillSubCard({ label, stat, barCls, highVariance }) {
  const avgCls = stat.avg != null && stat.avg < 5 ? 'text-coral-600' : 'text-neutral-800'
  return (
    <div className={`rounded-xl border bg-neutral-0 px-4 py-3 ${highVariance ? 'border-amber-200' : 'border-neutral-200'}`}>
      <p className="mb-1 text-xs font-medium text-neutral-400">{label}</p>
      <div className="flex justify-between text-sm">
        <span className={`font-bold tabular-nums ${avgCls}`}>{stat.avg ?? '—'}</span>
        <span className={`text-xs font-semibold tabular-nums ${varianceCls(stat.variance)}`}>± {stat.variance}</span>
      </div>
      <ScoreBar score={stat.avg} barCls={barCls} />
    </div>
  )
}

// ── Comparison: table + chart ─────────────────────────────────────────────────

// Column widths shared by the table and the team row so they stay aligned.
function TableCols() {
  return (
    <colgroup>
      <col style={{ width: 40 }} />
      <col />
      <col style={{ width: 92 }} />
      <col style={{ width: 84 }} />
      <col style={{ width: 84 }} />
      <col style={{ width: 132 }} />
    </colgroup>
  )
}

function TableView({
  interviewers, teamSeries, allMonths, kpis, expandedRows, toggleRow, hoveredId, setHoveredId,
  hiddenIds, toggleHidden, activeCategory, setActiveCategory,
}) {
  const teamHighVariance = kpis.score_variance > VARIANCE_THRESHOLD
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5">
      {/* Left: interviewers. The team row is pinned to the bottom so the card
          has the same top and bottom edges as the chart panel beside it. */}
      <div className="min-w-0 overflow-x-auto border-neutral-100 lg:col-span-3 lg:border-r">
        <div className="flex h-full min-w-[580px] flex-col">
          <table className="w-full table-fixed">
            <TableCols />
            <thead>
              <tr className="h-11 border-b border-neutral-100 bg-neutral-50">
                <th className="px-3" aria-label="Expand" />
                <th className={`${TH} px-4 text-left`}>Interviewer</th>
                <th className={`${TH} px-2 text-center`}>Interviews</th>
                <th className={`${TH} px-2 text-center`}>Avg score</th>
                <th className={`${TH} px-2 text-center`}>Variance</th>
                <th className={`${TH} px-2 text-center`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {interviewers.map((intv, idx) => {
                const isExpanded = expandedRows.has(intv.user_id)
                const isHover = hoveredId === intv.user_id
                const isDimmed = hoveredId && !isHover
                return (
                  <React.Fragment key={intv.user_id}>
                    <tr
                      className={`cursor-pointer border-b border-neutral-100 transition-colors motion-reduce:transition-none ${
                        isDimmed ? 'opacity-50' : ''
                      } ${isHover ? 'bg-primary-50' : intv.high_variance ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-neutral-50'}`}
                      onClick={() => toggleRow(intv.user_id)}
                      onMouseEnter={() => setHoveredId(intv.user_id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <td className="px-3 py-3.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${intv.name}`}
                          onClick={(e) => { e.stopPropagation(); toggleRow(intv.user_id) }}
                          onFocus={() => setHoveredId(intv.user_id)}
                          onBlur={() => setHoveredId(null)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300"
                        >
                          <ChevronRight size={16} className={`transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={intv.name} idx={idx} />
                          <span className="truncate whitespace-nowrap text-sm font-semibold text-neutral-800">{intv.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3.5 text-center text-sm tabular-nums text-neutral-600">{intv.interview_count}</td>
                      <td className="px-2 py-3.5 text-center text-sm font-bold tabular-nums text-neutral-800">{intv.overall.avg ?? '—'}</td>
                      <td className={`px-2 py-3.5 text-center text-sm font-semibold tabular-nums ${varianceCls(intv.overall.variance)}`}>± {intv.overall.variance}</td>
                      <td className="px-2 py-3.5 text-center"><StatusBadge highVariance={intv.high_variance} /></td>
                    </tr>
                    {isExpanded && (
                      <tr className={`border-b border-neutral-100 ${intv.high_variance ? 'bg-amber-50/20' : 'bg-neutral-50/60'}`}>
                        <td colSpan={6} className="px-6 pb-4 pt-2">
                          {intv.high_variance && (
                            <span className="mb-3 inline-flex items-center gap-1.5 rounded-pill bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 sm:ml-9">
                              <AlertTriangle size={12} aria-hidden="true" />
                              Scored unevenly across skill categories
                            </span>
                          )}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:pl-9">
                            {SKILLS.map((s) => (
                              <SkillSubCard key={s.key} label={s.label} stat={intv[s.key]} barCls={s.bar} highVariance={intv.high_variance} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>

          <table className="mt-auto w-full table-fixed border-t border-neutral-200 bg-neutral-50">
            <TableCols />
            <tbody>
              <tr className="h-14">
                <td />
                <td className="px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: TEAM_COLOR }}>
                      <Users size={14} aria-hidden="true" />
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-neutral-800">Team average</span>
                  </div>
                </td>
                <td className="px-2 text-center text-sm tabular-nums text-neutral-600">{kpis.evaluated_count}</td>
                <td className="px-2 text-center text-sm font-bold tabular-nums text-neutral-800">{kpis.avg_overall_score}</td>
                <td className={`px-2 text-center text-sm font-semibold tabular-nums ${varianceCls(kpis.score_variance)}`}>± {kpis.score_variance}</td>
                <td className="px-2 text-center"><StatusBadge highVariance={teamHighVariance} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: chart. Its control band is the same height as the table header. */}
      <div className="flex min-w-0 flex-col lg:col-span-2">
        <div className="scrollbar-hide flex h-11 items-center gap-1.5 overflow-x-auto border-b border-neutral-100 bg-neutral-50 px-6" role="group" aria-label="Score category">
          {CAT_PILLS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeCategory === key}
              onClick={() => setActiveCategory(key)}
              className={`shrink-0 whitespace-nowrap rounded-pill border px-2 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                activeCategory === key
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-neutral-200 bg-neutral-0 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col p-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-800">Score over time</h3>
            <span className="truncate text-xs text-neutral-400">
              {hoveredId ? interviewers.find((i) => i.user_id === hoveredId)?.name : 'All interviewers'}
            </span>
          </div>

          <ConsistencyChart
            interviewers={interviewers}
            teamSeries={teamSeries}
            allMonths={allMonths}
            activeCategory={activeCategory}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            hiddenIds={hiddenIds}
            toggleHidden={toggleHidden}
          />
        </div>
      </div>
    </div>
  )
}

function CardsView({ interviewers }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {interviewers.map((intv, idx) => {
        const divider = intv.high_variance ? 'border-amber-100' : 'border-neutral-100'
        return (
          <div
            key={intv.user_id}
            className={`rounded-2xl border bg-neutral-0 p-5 transition-[border-color,box-shadow] hover:shadow-sm motion-reduce:transition-none ${
              intv.high_variance ? 'border-amber-200' : 'border-neutral-200 hover:border-primary-200'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={intv.name} idx={idx} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-800">{intv.name}</p>
                  <p className="text-xs text-neutral-400">{plural(intv.interview_count, 'interview')}</p>
                </div>
              </div>
              <StatusBadge highVariance={intv.high_variance} />
            </div>

            <div className={`mb-3 flex items-center justify-between border-b pb-3 ${divider}`}>
              <span className="text-sm font-semibold text-neutral-600">Overall</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-neutral-900">{intv.overall.avg ?? '—'}</span>
                <span className={`text-xs font-semibold tabular-nums ${varianceCls(intv.overall.variance)}`}>± {intv.overall.variance}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {SKILLS.map((s) => {
                const stat = intv[s.key]
                const avgCls = stat.avg != null && stat.avg < 5 ? 'text-coral-600' : 'text-neutral-800'
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-neutral-600">{s.label}</span>
                      <span className="tabular-nums">
                        <span className={`font-semibold ${avgCls}`}>{stat.avg ?? '—'}</span>{' '}
                        <span className={`text-xs font-semibold ${varianceCls(stat.variance)}`}>± {stat.variance}</span>
                      </span>
                    </div>
                    <ScoreBar score={stat.avg} barCls={s.bar} />
                  </div>
                )
              })}
            </div>

            <div className={`mt-4 flex items-center justify-between border-t pt-3 ${divider}`}>
              <span className="text-xs text-neutral-400">Bias flags</span>
              <FlagPill count={intv.bias_incident_count} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Bias incident log ─────────────────────────────────────────────────────────

function BiasIncidentCard({ incident }) {
  const category   = incident.category   || incident.bias_type   || ''
  const quote      = incident.quote      || incident.flagged_text || ''
  const reason     = incident.reason     || incident.why_flagged  || ''
  const suggestion = incident.suggestion || ''
  const ts = formatBiasTime(incident.timestamp)

  return (
    <div className="rounded-xl border border-coral-200 bg-neutral-0 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {ts && <span className="rounded-pill bg-neutral-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-neutral-600">{ts}</span>}
        {category && <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${biasCategoryCls(category)}`}>{category}</span>}
      </div>
      {quote && (
        <blockquote className="mb-3 border-l-2 border-coral-300 pl-3 text-sm italic text-neutral-700">&ldquo;{quote}&rdquo;</blockquote>
      )}
      <dl className="flex flex-col gap-1.5 text-sm">
        {reason && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-semibold text-neutral-500">Why flagged</dt>
            <dd className="text-neutral-600">{reason}</dd>
          </div>
        )}
        {suggestion && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-semibold text-mint-700">Suggestion</dt>
            <dd className="text-neutral-600">{suggestion}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function BiasIncidentLog({ interviewers, expandedBias, toggleBias, totalFlags }) {
  return (
    <section className={`${card.flat} overflow-hidden`}>
      <CardHeader title="Bias incident log" subtitle="Questions flagged by the live bias checker during interviews">
        <span className="rounded-pill border border-coral-100 bg-coral-50 px-3 py-1 text-xs font-semibold text-coral-700">
          {plural(totalFlags, 'flag')} this period
        </span>
      </CardHeader>

      <div className="divide-y divide-neutral-100">
        {interviewers.map((intv, idx) => {
          const isExpanded = expandedBias.has(intv.user_id)
          const count = intv.bias_incident_count
          return (
            <div key={intv.user_id}>
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleBias(intv.user_id)}
                className="flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-300 motion-reduce:transition-none"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={intv.name} idx={idx} />
                  <span className="truncate text-sm font-semibold text-neutral-800">{intv.name}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{plural(intv.interview_count, 'interview')}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <FlagPill count={count} />
                  <ChevronRight size={16} aria-hidden="true" className={`text-neutral-400 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {isExpanded && (
                <div className="px-6 pb-4 pt-1 sm:pl-16">
                  {count === 0 ? (
                    <p className="text-sm text-neutral-400">No bias incidents flagged in this period.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {(intv.bias_incidents || []).map((incident, i) => <BiasIncidentCard key={i} incident={incident} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════════════════

export default function InterviewConsistencyPage() {
  const [jobFilter, setJobFilter]           = useState('')
  const [days, setDays]                     = useState(90)
  const [view, setView]                     = useState('table')
  const [expandedRows, setExpandedRows]     = useState(new Set())
  const [expandedBias, setExpandedBias]     = useState(new Set())
  const [hoveredId, setHoveredId]           = useState(null)
  const [hiddenIds, setHiddenIds]           = useState(new Set())
  const [activeCategory, setActiveCategory] = useState('all')

  const { data: jobsData }       = useAsync(() => api.listJobs(), [])
  const { data, loading, error } = useAsync(
    () => api.getInterviewConsistency({ job_id: jobFilter || undefined, days }),
    [jobFilter, days],
  )

  const jobs         = Array.isArray(jobsData) ? jobsData : []
  const kpis         = data?.kpis         || { avg_overall_score: 0, score_variance: 0, evaluated_count: 0, bias_flag_count: 0 }
  const interviewers = data?.interviewers || []
  const teamSeries   = data?.team_series  || { all: [], technical: [], communication: [], problem_solving: [] }

  const allMonths = useMemo(() => {
    const s = new Set()
    Object.values(teamSeries).forEach((series) => series.forEach((pt) => s.add(pt.month)))
    interviewers.forEach((intv) =>
      Object.values(intv.series || {}).forEach((series) => series.forEach((pt) => s.add(pt.month)))
    )
    return Array.from(s).sort()
  }, [teamSeries, interviewers])

  const biasInterviewerCount = interviewers.filter((i) => i.bias_incident_count > 0).length
  const overThreshold = kpis.score_variance > VARIANCE_THRESHOLD

  const toggleIn = (setter) => (uid) =>
    setter((prev) => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  const toggleRow = toggleIn(setExpandedRows)
  const toggleBias = toggleIn(setExpandedBias)
  const toggleHidden = toggleIn(setHiddenIds)

  const firstLoad = loading && !data
  const filtersActive = jobFilter !== '' || days !== DEFAULT_DAYS
  const resetFilters = () => { setJobFilter(''); setDays(DEFAULT_DAYS) }

  return (
    <div className={page.shell}>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-neutral-200 bg-neutral-0 px-10 py-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">Interview Consistency</h1>
            <p className="mt-1 text-xs text-neutral-400">Scoring alignment and bias patterns across interviewers</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8" aria-busy={loading}>
          {/* Filters scope everything below (KPIs, comparison, bias log), so they
              sit directly above the results rather than up in the page header. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-neutral-400 focus-within:ring-2 focus-within:ring-primary-300">
                <Briefcase size={14} aria-hidden="true" />
                <span className="sr-only">Job</span>
                <select
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                  className="max-w-[16rem] cursor-pointer truncate bg-transparent text-sm font-medium text-neutral-700 outline-none"
                >
                  <option value="">All jobs</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button type="button" onClick={resetFilters} className="text-sm font-semibold text-primary-500 hover:text-primary-600">
                  Reset filters
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-neutral-400">
              <CalendarDays size={16} aria-hidden="true" />
              <Segmented label="Time frame" options={RANGES} value={days} onChange={setDays} />
            </div>
          </div>

          {firstLoad && <p className="py-20 text-center text-sm text-neutral-400">Loading analytics…</p>}

          {!firstLoad && error && !data && (
            <p className="py-20 text-center text-sm text-coral-600">{error || 'Failed to load analytics.'}</p>
          )}

          {!firstLoad && error && data && (
            <p className="mb-4 rounded-xl border border-coral-200 bg-coral-50 px-4 py-3 text-sm text-coral-700">
              Could not refresh the analytics. Showing the last results. {error}
            </p>
          )}

          {!firstLoad && data && (
            <div className={`flex flex-col gap-6 transition-opacity motion-reduce:transition-none ${loading ? 'opacity-60' : ''}`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  icon={Gauge} tint="bg-primary-100 text-primary-600"
                  label="Avg score" value={kpis.avg_overall_score} unit="/ 10" note="Across all interviewers"
                />
                <KpiCard
                  icon={Activity} tint="bg-amber-100 text-amber-600"
                  label="Score variance" value={`± ${kpis.score_variance}`}
                  note={overThreshold ? `Above the ± ${VARIANCE_THRESHOLD} threshold` : 'Within acceptable range'}
                  tone={overThreshold ? 'warn' : undefined}
                />
                <KpiCard
                  icon={ClipboardCheck} tint="bg-sky-100 text-sky-600"
                  label="Evaluated interviews" value={kpis.evaluated_count} note="With completed ratings"
                />
                <KpiCard
                  icon={ShieldAlert} tint="bg-coral-100 text-coral-600"
                  label="Bias flags" value={kpis.bias_flag_count}
                  note={kpis.bias_flag_count > 0 ? `Across ${plural(biasInterviewerCount, 'interviewer')}` : 'No flags this period'}
                  tone={kpis.bias_flag_count > 0 ? 'bad' : undefined}
                />
              </div>

              {interviewers.length === 0 ? (
                <div className={`${card.flat} p-12 text-center`}>
                  <p className="text-sm text-neutral-400">
                    {filtersActive
                      ? 'No evaluated interviews match these filters. Try a longer time frame or all jobs.'
                      : 'No evaluated interviews yet. Scores appear here once interviews are completed.'}
                  </p>
                  {filtersActive && (
                    <button type="button" onClick={resetFilters} className="mt-3 text-sm font-semibold text-primary-500 hover:text-primary-600">
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <section className={`${card.flat} overflow-hidden`}>
                    <CardHeader title="Interviewer score comparison" subtitle="Average candidate scores per interviewer">
                      <Segmented label="Comparison view" options={[['table', 'Table'], ['cards', 'Cards']]} value={view} onChange={setView} />
                    </CardHeader>
                    {view === 'table' ? (
                      <TableView
                        interviewers={interviewers}
                        teamSeries={teamSeries}
                        allMonths={allMonths}
                        kpis={kpis}
                        expandedRows={expandedRows}
                        toggleRow={toggleRow}
                        hoveredId={hoveredId}
                        setHoveredId={setHoveredId}
                        hiddenIds={hiddenIds}
                        toggleHidden={toggleHidden}
                        activeCategory={activeCategory}
                        setActiveCategory={setActiveCategory}
                      />
                    ) : (
                      <CardsView interviewers={interviewers} />
                    )}
                  </section>

                  <BiasIncidentLog
                    interviewers={interviewers}
                    expandedBias={expandedBias}
                    toggleBias={toggleBias}
                    totalFlags={kpis.bias_flag_count}
                  />
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
