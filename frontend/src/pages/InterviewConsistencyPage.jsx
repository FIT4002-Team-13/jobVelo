import React, { useState, useMemo } from 'react'
import Sidebar from '../components/common/Sidebar.jsx'
import { page } from '../styles/layout.js'
import { api } from '../lib/api.js'
import { useAsync } from '../hooks/useAsync.js'

const VARIANCE_THRESHOLD = 1.5

const INTERVIEWER_PALETTE = [
  { color: '#14b8a6', dash: '5 3' },
  { color: '#f59e0b', dash: '4 4' },
  { color: '#0ea5e9', dash: '6 3' },
  { color: '#6d28d9', dash: '3 2' },
  { color: '#f43f5e', dash: '7 3' },
]

function paletteFor(idx) {
  return INTERVIEWER_PALETTE[idx % INTERVIEWER_PALETTE.length]
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(ym) {
  const [, m] = (ym || '').split('-')
  return MONTH_SHORT[parseInt(m, 10) - 1] || ym
}

function scoreToY(s) {
  return +(15 + (10 - s) * 12).toFixed(1)
}

function buildXScale(months) {
  const n = months.length
  if (n === 0) return {}
  if (n === 1) return { [months[0]]: 145 }
  const out = {}
  months.forEach((m, i) => { out[m] = Math.round(55 + (i / (n - 1)) * 180) })
  return out
}

function seriesPoints(series, xScale) {
  return series
    .filter(pt => xScale[pt.month] !== undefined)
    .map(pt => `${xScale[pt.month]},${scoreToY(pt.value)}`)
    .join(' ')
}

function varianceCls(v) {
  return v > VARIANCE_THRESHOLD ? 'text-amber-600 font-bold' : 'text-mint-600 font-semibold'
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
  if (!cat) return 'bg-neutral-100 text-neutral-500'
  const l = cat.toLowerCase()
  if (l.includes('gender') || l.includes('race') || l.includes('ethnic')) return 'bg-coral-100 text-coral-500'
  if (l.includes('age')) return 'bg-amber-100 text-amber-700'
  if (l.includes('edu') || l.includes('school') || l.includes('univer')) return 'bg-sky-100 text-sky-600'
  if (l.includes('personal') || l.includes('family') || l.includes('marital')) return 'bg-violet-100 text-violet-700'
  return 'bg-neutral-100 text-neutral-600'
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function WarningIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}

function StatusBadge({ highVariance }) {
  return highVariance
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ High Variance</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-mint-100 text-mint-700">✓ Consistent</span>
}

function ScoreBar({ score, colorCls }) {
  const pct = score != null ? Math.min(100, Math.round((score / 10) * 100)) : 0
  return (
    <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function DonutChart({ score }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const filled = ((score || 0) / 10) * circ
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="9" className="stroke-neutral-100" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - filled} style={{ stroke: '#6366f1' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-extrabold text-neutral-800">{score ?? 0}</span>
      </div>
    </div>
  )
}

// ── Skill sub-card (inside expanded table row) ────────────────────────────────

function SkillSubCard({ label, stat, barColorCls, highVariance }) {
  const border = highVariance ? 'border-amber-200' : 'border-neutral-200'
  const avgCls = stat.avg != null && stat.avg < 5 ? 'text-coral-500' : 'text-neutral-800'
  return (
    <div className={`bg-neutral-0 rounded-xl border ${border} px-4 py-3`}>
      <p className="text-xs text-neutral-400 font-medium mb-1">{label}</p>
      <div className="flex justify-between">
        <span className={`text-sm font-bold ${avgCls}`}>{stat.avg ?? '—'}</span>
        <span className={`text-xs ${varianceCls(stat.variance)}`}>
          ± {stat.variance}{stat.variance > VARIANCE_THRESHOLD ? ' ⚠' : ''}
        </span>
      </div>
      <ScoreBar score={stat.avg} colorCls={barColorCls} />
    </div>
  )
}

// ── SVG consistency chart ─────────────────────────────────────────────────────

function ConsistencyChart({ interviewers, teamSeries, allMonths, xScale, activeCategory, hoveredId }) {
  const months = allMonths.filter(m => xScale[m] !== undefined)
  const teamData = teamSeries[activeCategory] || []
  const teamOp = hoveredId ? 0.15 : 1

  const yLabels = [
    { y: 15, label: '10' }, { y: 45, label: '7.5' }, { y: 75, label: '5' }, { y: 105, label: '2.5' },
  ]

  if (months.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-neutral-400">Not enough data to plot trends.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <svg viewBox="0 0 280 140" className="w-full flex-1">
        {yLabels.map(({ y }) => (
          <line key={y} x1="30" y1={y} x2="268" y2={y} stroke="#f3f4f6" strokeWidth="1" />
        ))}
        {yLabels.map(({ y, label }) => (
          <text key={y} x="24" y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{label}</text>
        ))}
        {months.map(m => (
          <text key={m} x={xScale[m]} y="128" textAnchor="middle" fontSize="9" fill="#9ca3af">
            {monthLabel(m)}
          </text>
        ))}

        {/* Team average line */}
        {teamData.length >= 1 && (
          <g opacity={teamOp} style={{ transition: 'opacity 0.15s' }}>
            {teamData.length >= 2 && (
              <polyline
                points={seriesPoints(teamData, xScale)}
                fill="none" stroke="#6366f1" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            )}
            {teamData.map(pt => xScale[pt.month] != null && (
              <circle key={pt.month} cx={xScale[pt.month]} cy={scoreToY(pt.value)} r="3" fill="#6366f1" />
            ))}
          </g>
        )}

        {/* Per-interviewer lines */}
        {interviewers.map((intv, idx) => {
          const { color, dash } = paletteFor(idx)
          const series = (intv.series || {})[activeCategory] || []
          if (series.length < 1) return null

          let op, sw, r
          if (!hoveredId)                      { op = 0.85; sw = 2;   r = 2.5 }
          else if (intv.user_id === hoveredId)  { op = 1;    sw = 3;   r = 3.5 }
          else                                  { op = 0.1;  sw = 1.5; r = 2   }

          return (
            <g key={intv.user_id} opacity={op} style={{ transition: 'opacity 0.15s' }}>
              {series.length >= 2 && (
                <polyline
                  points={seriesPoints(series, xScale)} fill="none" stroke={color}
                  strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round"
                />
              )}
              {series.map(pt => xScale[pt.month] != null && (
                <circle key={pt.month} cx={xScale[pt.month]} cy={scoreToY(pt.value)} r={r} fill={color} />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-1 pt-1 border-t border-neutral-100">
        <span className="flex items-center gap-1.5 text-xs text-neutral-500"
          style={{ opacity: hoveredId ? 0.25 : 1 }}>
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: '#6366f1' }} />
          Team Avg
        </span>
        {interviewers.map((intv, idx) => {
          const { color } = paletteFor(idx)
          const op = !hoveredId ? 1 : intv.user_id === hoveredId ? 1 : 0.25
          const parts = intv.name.split(' ')
          const short = parts[0] + (parts[1] ? ` ${parts[1][0]}.` : '')
          return (
            <span key={intv.user_id} className="flex items-center gap-1.5 text-xs text-neutral-500"
              style={{ opacity: op, fontWeight: hoveredId === intv.user_id ? 600 : 400 }}>
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: color }} />
              {short}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({
  interviewers, teamSeries, allMonths, xScale,
  expandedRows, toggleRow, hoveredId, setHoveredId,
  activeCategory, setActiveCategory, highVarianceInterviewers,
}) {
  const CAT_PILLS = [
    { key: 'all', label: 'All' },
    { key: 'technical', label: 'Technical' },
    { key: 'communication', label: 'Communication' },
    { key: 'problem_solving', label: 'Problem Solving' },
  ]
  const CAT_LABEL = {
    all: 'All scores', technical: 'Technical',
    communication: 'Communication', problem_solving: 'Problem Solving',
  }

  return (
    <div className="flex">
      {/* Expandable table */}
      <div className="flex-[3] border-r border-neutral-100 min-w-0">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              <th className="w-8 px-3 py-3" />
              <th className="text-left text-xs font-bold text-neutral-400 uppercase tracking-widest px-2 py-3">Interviewer</th>
              <th className="text-center text-xs font-bold text-neutral-400 uppercase tracking-widest px-3 py-3">Intvs</th>
              <th className="text-center text-xs font-bold text-neutral-400 uppercase tracking-widest px-3 py-3">Avg</th>
              <th className="text-center text-xs font-bold text-neutral-400 uppercase tracking-widest px-3 py-3">Variance</th>
              <th className="text-center text-xs font-bold text-neutral-400 uppercase tracking-widest px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {interviewers.map((intv, idx) => {
              const { color } = paletteFor(idx)
              const isExpanded = expandedRows.has(intv.user_id)
              const isDimmed = hoveredId && hoveredId !== intv.user_id
              return (
                <React.Fragment key={intv.user_id}>
                  <tr
                    className={`border-b border-neutral-100 hover:bg-neutral-50 transition-opacity ${isDimmed ? 'opacity-40' : ''} ${intv.high_variance ? 'bg-amber-50/40' : ''}`}
                    onMouseEnter={() => setHoveredId(intv.user_id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-3 py-3.5">
                      <button
                        onClick={() => toggleRow(intv.user_id)}
                        className={`text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-100 ${intv.high_variance ? 'text-amber-500' : 'text-neutral-300'}`}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: color }}>
                          {initials(intv.name)}
                        </div>
                        <span className="text-sm font-semibold text-neutral-800">{intv.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-sm text-neutral-600 text-center">{intv.interview_count}</td>
                    <td className="px-3 py-3.5 text-sm font-bold text-neutral-800 text-center">{intv.overall.avg ?? '—'}</td>
                    <td className={`px-3 py-3.5 text-sm text-center ${varianceCls(intv.overall.variance)}`}>
                      ± {intv.overall.variance}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <StatusBadge highVariance={intv.high_variance} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className={`border-b border-neutral-100 ${intv.high_variance ? 'bg-amber-50/20' : 'bg-primary-50/10'}`}>
                      <td colSpan={6} className="px-5 pb-3 pt-1">
                        <div className="grid grid-cols-3 gap-3 pl-8">
                          <SkillSubCard label="Technical Skills" stat={intv.technical}    barColorCls="bg-primary-500" highVariance={intv.high_variance} />
                          <SkillSubCard label="Communication"    stat={intv.communication} barColorCls="bg-mint-500"    highVariance={intv.high_variance} />
                          <SkillSubCard label="Problem Solving"  stat={intv.problem_solving} barColorCls="bg-sky-400"  highVariance={intv.high_variance} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>

        {highVarianceInterviewers.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
            <WarningIcon />
            <p className="text-xs text-amber-700">
              <strong>{highVarianceInterviewers.map(i => i.name).join(', ')}</strong>
              {' '}— high score variance detected across skill categories.
            </p>
          </div>
        )}
      </div>

      {/* Chart panel */}
      <div className="flex-[2] flex flex-col p-5 min-w-0">
        {/* Category pills */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {CAT_PILLS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                activeCategory === key
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-neutral-0 text-neutral-600 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chart title */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Score Over Time</h3>
          <span className="text-xs text-neutral-400">
            {hoveredId
              ? interviewers.find(i => i.user_id === hoveredId)?.name
              : 'All interviewers'}
            {' · '}{CAT_LABEL[activeCategory]}
          </span>
        </div>

        <ConsistencyChart
          interviewers={interviewers}
          teamSeries={teamSeries}
          allMonths={allMonths}
          xScale={xScale}
          activeCategory={activeCategory}
          hoveredId={hoveredId}
        />
      </div>
    </div>
  )
}

// ── Cards view ────────────────────────────────────────────────────────────────

function CardsView({ interviewers }) {
  return (
    <div className="p-5">
      <div className="grid grid-cols-3 gap-4">
        {interviewers.map((intv, idx) => {
          const { color } = paletteFor(idx)
          const border = intv.high_variance ? 'border-amber-200' : 'border-neutral-200'
          const divider = intv.high_variance ? 'border-amber-100' : 'border-neutral-100'
          return (
            <div key={intv.user_id} className={`rounded-2xl border ${border} bg-neutral-0 p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: color }}>
                    {initials(intv.name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">{intv.name}</p>
                    <p className="text-xs text-neutral-400">
                      {intv.interview_count} interview{intv.interview_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge highVariance={intv.high_variance} />
              </div>

              <div className={`flex items-center justify-between mb-3 pb-3 border-b ${divider}`}>
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Overall</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold text-neutral-800">{intv.overall.avg ?? '—'}</span>
                  <span className={`text-xs ${varianceCls(intv.overall.variance)}`}>
                    ± {intv.overall.variance}{intv.overall.variance > VARIANCE_THRESHOLD ? ' ⚠' : ''}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {[
                  { key: 'technical',      label: 'Technical Skills', barColorCls: 'bg-primary-500' },
                  { key: 'communication',  label: 'Communication',    barColorCls: 'bg-mint-500'    },
                  { key: 'problem_solving', label: 'Problem Solving', barColorCls: 'bg-sky-400'     },
                ].map(({ key, label, barColorCls }) => {
                  const stat = intv[key]
                  const avgCls = stat.avg != null && stat.avg < 5 ? 'text-coral-500' : 'text-neutral-700'
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-neutral-600 font-medium">{label}</span>
                        <span className={`font-semibold ${avgCls}`}>
                          {stat.avg ?? '—'}{' '}
                          <span className={`font-normal ${varianceCls(stat.variance)}`}>± {stat.variance}</span>
                        </span>
                      </div>
                      <ScoreBar score={stat.avg} colorCls={barColorCls} />
                    </div>
                  )
                })}
              </div>

              <div className={`mt-3 pt-3 border-t ${divider} flex items-center justify-between`}>
                <span className="text-xs text-neutral-400">Bias flags</span>
                {intv.bias_incident_count > 0
                  ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{intv.bias_incident_count} flag{intv.bias_incident_count !== 1 ? 's' : ''}</span>
                  : <span className="text-xs font-semibold text-mint-700 bg-mint-50 px-2 py-0.5 rounded-full">0 — clear</span>
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bias incident card ────────────────────────────────────────────────────────

function BiasIncidentCard({ incident }) {
  const category   = incident.category   || incident.bias_type     || ''
  const quote      = incident.quote      || incident.flagged_text   || ''
  const reason     = incident.reason     || incident.why_flagged    || ''
  const suggestion = incident.suggestion || ''
  const ts = formatBiasTime(incident.timestamp)

  return (
    <div className="rounded-xl border border-amber-200 bg-neutral-0 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        {ts && (
          <span className="text-[10px] font-bold bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full font-mono">{ts}</span>
        )}
        {category && (
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${biasCategoryCls(category)}`}>
            {category}
          </span>
        )}
      </div>
      {quote && (
        <blockquote className="text-sm text-neutral-700 italic border-l-2 border-amber-300 pl-3 mb-3">
          &ldquo;{quote}&rdquo;
        </blockquote>
      )}
      <div className="flex flex-col gap-1.5">
        {reason && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-neutral-500 w-20 shrink-0">Why flagged</span>
            <span className="text-neutral-600">{reason}</span>
          </div>
        )}
        {suggestion && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-mint-700 w-20 shrink-0">Suggestion</span>
            <span className="text-neutral-600">{suggestion}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bias incident log section ─────────────────────────────────────────────────

function BiasIncidentLog({ interviewers, expandedBias, toggleBias, totalFlags }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-0 overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-neutral-700">Bias Incident Log</h2>
          <p className="text-xs text-neutral-400 mt-0.5">Questions flagged by the live bias checker</p>
        </div>
        <span className="text-xs font-semibold text-coral-500 bg-coral-50 px-3 py-1 rounded-full border border-coral-100">
          {totalFlags} total flag{totalFlags !== 1 ? 's' : ''} this period
        </span>
      </div>

      <div className="divide-y divide-neutral-100">
        {interviewers.map((intv, idx) => {
          const { color } = paletteFor(idx)
          const isExpanded = expandedBias.has(intv.user_id)
          const count = intv.bias_incident_count
          return (
            <div key={intv.user_id} className={intv.high_variance ? 'bg-amber-50/20' : ''}>
              <button
                onClick={() => toggleBias(intv.user_id)}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-left ${intv.high_variance ? 'hover:bg-amber-50/40' : 'hover:bg-neutral-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: color }}>
                    {initials(intv.name)}
                  </div>
                  <span className="text-sm font-semibold text-neutral-800">{intv.name}</span>
                  <span className="text-xs text-neutral-400">{intv.interview_count} interviews</span>
                </div>
                <div className="flex items-center gap-3">
                  {count === 0
                    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-mint-50 text-mint-700 border border-mint-200">0 flags — clear</span>
                    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-coral-50 text-coral-500 border border-coral-100">{count} flag{count !== 1 ? 's' : ''}</span>
                  }
                  <span className={`text-xs ${count > 0 ? 'text-amber-500' : 'text-neutral-300'}`}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-5 pb-4 pt-1">
                  {count === 0
                    ? <p className="text-xs text-neutral-400 pl-10">No bias incidents flagged during this period.</p>
                    : (
                      <div className="pl-10 flex flex-col gap-3">
                        {(intv.bias_incidents || []).map((incident, i) => (
                          <BiasIncidentCard key={i} incident={incident} />
                        ))}
                      </div>
                    )
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50">
        <p className="text-xs text-neutral-400">
          Bias incidents sourced from{' '}
          <code className="bg-neutral-200 px-1 rounded text-neutral-600 text-[10px]">intv_bias_incidents</code>
          {' '}— flagged live during sessions by the bias checker.
        </p>
      </div>
    </div>
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
  const [activeCategory, setActiveCategory] = useState('all')

  const { data: jobsData }             = useAsync(() => api.listJobs(), [])
  const { data, loading, error }       = useAsync(
    () => api.getInterviewConsistency({ job_id: jobFilter || undefined, days }),
    [jobFilter, days],
  )

  const jobs        = Array.isArray(jobsData) ? jobsData : []
  const kpis        = data?.kpis        || { avg_overall_score: 0, score_variance: 0, evaluated_count: 0, bias_flag_count: 0 }
  const interviewers = data?.interviewers || []
  const teamSeries  = data?.team_series  || { all: [], technical: [], communication: [], problem_solving: [] }

  const allMonths = useMemo(() => {
    const s = new Set()
    Object.values(teamSeries).forEach(series => series.forEach(pt => s.add(pt.month)))
    interviewers.forEach(intv =>
      Object.values(intv.series || {}).forEach(series => series.forEach(pt => s.add(pt.month)))
    )
    return Array.from(s).sort()
  }, [teamSeries, interviewers])

  const xScale = useMemo(() => buildXScale(allMonths), [allMonths])

  const highVarianceInterviewers = interviewers.filter(i => i.high_variance)

  function toggleRow(uid) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  function toggleBias(uid) {
    setExpandedBias(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  if (loading) {
    return (
      <div className={page.loading}>
        <div className="text-neutral-400 text-sm">Loading analytics…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={page.shell}>
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-coral-500">{error.message || 'Failed to load analytics.'}</p>
        </div>
      </div>
    )
  }

  const biasInterviewerCount = interviewers.filter(i => i.bias_incident_count > 0).length

  return (
    <div className={page.shell}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-5 shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Analytics</p>
              <h1 className="text-2xl font-bold text-neutral-800">Interview Consistency</h1>
              <p className="text-sm text-neutral-400 mt-0.5">Scoring alignment &amp; bias patterns across interviewers</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={jobFilter}
                onChange={e => setJobFilter(e.target.value)}
                className="text-sm border border-neutral-200 rounded-xl px-3 py-2 text-neutral-600 bg-neutral-0 focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">All Jobs</option>
                {jobs.map(j => (
                  <option key={j._id} value={j._id}>{j.title || j.job_title || j._id}</option>
                ))}
              </select>
              <select
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="text-sm border border-neutral-200 rounded-xl px-3 py-2 text-neutral-600 bg-neutral-0 focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
                <option value={180}>Last 6 Months</option>
                <option value={0}>All Time</option>
              </select>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-10 py-6">

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-5 mb-6">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-0 p-5 flex items-center gap-4">
              <DonutChart score={kpis.avg_overall_score} />
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">Avg Score</p>
                <p className="text-xl font-bold text-neutral-800">
                  {kpis.avg_overall_score}<span className="text-sm font-normal text-neutral-400"> / 10</span>
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">Across all interviewers</p>
              </div>
            </div>

            <div className={`rounded-2xl border bg-neutral-0 p-5 ${kpis.score_variance > VARIANCE_THRESHOLD ? 'border-amber-200' : 'border-neutral-200'}`}>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Score Variance</p>
              <p className="text-3xl font-bold text-neutral-800">± {kpis.score_variance}</p>
              {kpis.score_variance > VARIANCE_THRESHOLD ? (
                <p className="text-xs text-amber-600 font-semibold mt-1.5 flex items-center gap-1">
                  <WarningIcon />Exceeds ±{VARIANCE_THRESHOLD} threshold
                </p>
              ) : (
                <p className="text-xs text-neutral-400 mt-1.5">Within acceptable range</p>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-0 p-5">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Evaluated Interviews</p>
              <p className="text-3xl font-bold text-neutral-800">{kpis.evaluated_count}</p>
              <p className="text-xs text-neutral-400 mt-1.5">Interviews with completed ratings</p>
            </div>

            <div className={`rounded-2xl border bg-neutral-0 p-5 ${kpis.bias_flag_count > 0 ? 'border-coral-100' : 'border-neutral-200'}`}>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Bias Flags</p>
              <p className="text-3xl font-bold text-neutral-800">{kpis.bias_flag_count}</p>
              {kpis.bias_flag_count > 0 ? (
                <p className="text-xs text-coral-500 font-semibold mt-1.5">
                  Across {biasInterviewerCount} interviewer{biasInterviewerCount !== 1 ? 's' : ''} this period
                </p>
              ) : (
                <p className="text-xs text-neutral-400 mt-1.5">No flags this period</p>
              )}
            </div>
          </div>

          {/* Empty state */}
          {interviewers.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-0 p-12 text-center mb-6">
              <p className="text-sm text-neutral-400">No completed interviews with ratings found for this filter.</p>
            </div>
          )}

          {interviewers.length > 0 && (
            <>
              {/* Score Comparison */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-0 overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-700">Interviewer Score Comparison</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">Avg candidate scores per interviewer</p>
                  </div>
                  <div className="flex rounded-xl border border-neutral-200 overflow-hidden text-sm font-semibold">
                    <button
                      onClick={() => setView('table')}
                      className={`px-4 py-1.5 ${view === 'table' ? 'bg-primary-500 text-white' : 'bg-neutral-0 text-neutral-500 hover:bg-neutral-50'}`}
                    >Table</button>
                    <button
                      onClick={() => setView('cards')}
                      className={`px-4 py-1.5 ${view === 'cards' ? 'bg-primary-500 text-white' : 'bg-neutral-0 text-neutral-500 hover:bg-neutral-50'}`}
                    >Cards</button>
                  </div>
                </div>

                {view === 'table' ? (
                  <TableView
                    interviewers={interviewers}
                    teamSeries={teamSeries}
                    allMonths={allMonths}
                    xScale={xScale}
                    expandedRows={expandedRows}
                    toggleRow={toggleRow}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    activeCategory={activeCategory}
                    setActiveCategory={setActiveCategory}
                    highVarianceInterviewers={highVarianceInterviewers}
                  />
                ) : (
                  <CardsView interviewers={interviewers} />
                )}
              </div>

              {/* Bias Incident Log */}
              <BiasIncidentLog
                interviewers={interviewers}
                expandedBias={expandedBias}
                toggleBias={toggleBias}
                totalFlags={kpis.bias_flag_count}
              />
            </>
          )}

        </div>
      </div>
    </div>
  )
}
