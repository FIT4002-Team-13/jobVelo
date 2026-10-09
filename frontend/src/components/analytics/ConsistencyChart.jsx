import { useEffect, useMemo, useRef, useState } from 'react'
import { colors } from '../../styles/colors.js'
import { seriesFor, shortName, TEAM_COLOR } from './chartSeries.js'

const M = { top: 12, right: 16, bottom: 30, left: 36 }
const PAD = 16 // breathing room inside the plot so edge points aren't clipped
const TEAM_OPACITY = 0.3 // team average is a faint reference, not a competing series

const CAT_LABEL = {
  all: 'All scores',
  technical: 'Technical',
  communication: 'Communication',
  problem_solving: 'Problem solving',
}

function parseMonth(ym) {
  const [y, m] = (ym || '').split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1)
}
const shortMonth = (ym, withYear) =>
  parseMonth(ym).toLocaleString('en', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
const longMonth = (ym) => parseMonth(ym).toLocaleString('en', { month: 'long', year: 'numeric' })

// Draws one data point. Shape (not just colour) identifies the series.
function Marker({ shape, x, y, r, color }) {
  const s = r * 1.7
  const halo = { stroke: colors.neutral[0], strokeWidth: 1.25 }
  switch (shape) {
    case 'square':
      return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx="1" fill={color} {...halo} />
    case 'diamond':
      return <polygon points={`${x},${y - s * 0.75} ${x + s * 0.75},${y} ${x},${y + s * 0.75} ${x - s * 0.75},${y}`} fill={color} {...halo} />
    case 'triangle':
      return <polygon points={`${x},${y - s * 0.7} ${x + s * 0.7},${y + s * 0.55} ${x - s * 0.7},${y + s * 0.55}`} fill={color} {...halo} />
    case 'cross':
      return <path d={`M${x - s / 2} ${y - s / 2}L${x + s / 2} ${y + s / 2}M${x + s / 2} ${y - s / 2}L${x - s / 2} ${y + s / 2}`} stroke={color} strokeWidth="2.25" strokeLinecap="round" fill="none" />
    default:
      return <circle cx={x} cy={y} r={r} fill={color} {...halo} />
  }
}

function LegendSwatch({ color, dash, shape }) {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
      <line x1="1" y1="6" x2="23" y2="6" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
      <Marker shape={shape} x={12} y={6} r={3.5} color={color} />
    </svg>
  )
}

// Responsive, interactive score-over-time chart. Drawn at real pixel width so
// labels keep a constant 12px size at any container width. Hover or arrow-key
// the plot to inspect a month; hover/focus a legend chip to isolate a series;
// click a chip to hide it.
export default function ConsistencyChart({
  interviewers, teamSeries, allMonths, activeCategory,
  hoveredId, setHoveredId, hiddenIds, toggleHidden,
}) {
  const wrapRef = useRef(null)
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 })
  const [activeIdx, setActiveIdx] = useState(null)

  // The wrapper always renders (even with no data) so the observer attaches once.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const months = allMonths
  const n = months.length

  const { teamMap, seriesMaps, lo } = useMemo(() => {
    const toMap = (pts) => Object.fromEntries((pts || []).map((p) => [p.month, p.value]))
    const team = toMap(teamSeries[activeCategory])
    const maps = interviewers.map((i) => toMap((i.series || {})[activeCategory]))
    const values = [...Object.values(team), ...maps.flatMap((m) => Object.values(m))]
    // Axis tops out at the max score (10) and starts at an even number just
    // under the lowest value, so differences between interviewers stay visible.
    let floor = values.length ? Math.max(0, Math.floor(Math.min(...values)) - 1) : 0
    floor -= floor % 2
    return { teamMap: team, seriesMaps: maps, lo: Math.min(floor, 6) }
  }, [interviewers, teamSeries, activeCategory])

  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = Math.max(0, height - M.top - M.bottom)
  const xAt = (i) => (n <= 1 ? M.left + innerW / 2 : M.left + PAD + ((innerW - 2 * PAD) * i) / (n - 1))
  const yAt = (v) => M.top + (innerH * (10 - v)) / (10 - lo)

  const ticks = []
  for (let v = lo; v <= 10; v += 2) ticks.push(v)

  const years = new Set(months.map((m) => m.slice(0, 4)))
  const labelStep = Math.ceil(n / Math.max(1, Math.floor(innerW / 56)))

  const points = (map) =>
    months.map((m, i) => (map[m] != null ? { i, x: xAt(i), y: yAt(map[m]), v: map[m] } : null)).filter(Boolean)

  function nearest(px) {
    if (n <= 1) return 0
    const t = (px - M.left - PAD) / (innerW - 2 * PAD)
    return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))))
  }

  function onKeyDown(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (step) setActiveIdx((i) => Math.min(n - 1, Math.max(0, (i ?? (step > 0 ? -1 : n)) + step)))
    else if (e.key === 'Home') setActiveIdx(0)
    else if (e.key === 'End') setActiveIdx(n - 1)
    else if (e.key === 'Escape') setActiveIdx(null)
    else return
    e.preventDefault()
  }

  const dimmed = hoveredId != null
  const activeMonth = activeIdx != null ? months[activeIdx] : null
  const tooltipRows = activeMonth
    ? interviewers
        .map((intv, idx) => ({ intv, idx, v: seriesMaps[idx][activeMonth] }))
        .filter((r) => r.v != null && !hiddenIds.has(r.intv.user_id))
        .sort((a, b) => b.v - a.v)
    : []
  const flip = activeIdx != null && xAt(activeIdx) > width * 0.55

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-[240px] w-full flex-1">
        {n === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
            Not enough data to plot trends yet.
          </p>
        )}

        {n > 0 && width > 0 && height > 0 && (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              tabIndex={0}
              aria-label={`Score over time, ${CAT_LABEL[activeCategory]}, ${n} month${n !== 1 ? 's' : ''}. Use the left and right arrow keys to inspect each month.`}
              className="absolute left-0 top-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
              onPointerMove={(e) => setActiveIdx(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
              onPointerLeave={() => setActiveIdx(null)}
              onKeyDown={onKeyDown}
              onBlur={() => setActiveIdx(null)}
            >
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={yAt(v)} y2={yAt(v)} stroke={v === lo ? colors.neutral[300] : colors.neutral[200]} strokeWidth="1" />
                  <text x={M.left - 8} y={yAt(v) + 4} textAnchor="end" fontSize="12" fill={colors.neutral[500]} className="tabular-nums">{v}</text>
                </g>
              ))}
              {months.map((m, i) => i % labelStep === 0 && (
                <text key={m} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize="12" fill={colors.neutral[500]}>
                  {shortMonth(m, years.size > 1)}
                </text>
              ))}

              {activeIdx != null && (
                <line x1={xAt(activeIdx)} x2={xAt(activeIdx)} y1={M.top} y2={M.top + innerH} stroke={colors.neutral[300]} strokeWidth="1" strokeDasharray="3 3" />
              )}

              {interviewers.map((intv, idx) => {
                if (hiddenIds.has(intv.user_id)) return null
                const { color, dash, shape } = seriesFor(idx)
                const pts = points(seriesMaps[idx])
                if (pts.length === 0) return null
                const isHover = intv.user_id === hoveredId
                const op = !dimmed || isHover ? 1 : 0.12
                const poly = pts.map((p) => `${p.x},${p.y}`).join(' ')
                return (
                  <g key={intv.user_id} opacity={op} className="transition-opacity duration-150 motion-reduce:transition-none">
                    {pts.length > 1 && (
                      <>
                        <polyline points={poly} fill="none" stroke={color} strokeWidth={isHover ? 3 : 2} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
                        <polyline
                          points={poly} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: 'pointer' }}
                          onPointerEnter={() => setHoveredId(intv.user_id)} onPointerLeave={() => setHoveredId(null)}
                        />
                      </>
                    )}
                    {pts.map((p) => (
                      <Marker key={p.i} shape={shape} x={p.x} y={p.y} r={p.i === activeIdx || isHover ? 5 : 4} color={color} />
                    ))}
                  </g>
                )
              })}

              {/* Team average: a faint line, same thickness as the interviewer lines, laid over the chart.
                  pointer-events none so it never blocks hovering the lines under it. */}
              {(() => {
                const pts = points(teamMap)
                if (pts.length === 0) return null
                return (
                  <g
                    opacity={dimmed ? TEAM_OPACITY / 2 : TEAM_OPACITY}
                    pointerEvents="none"
                    className="transition-opacity duration-150 motion-reduce:transition-none"
                  >
                    {pts.length > 1 && (
                      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={TEAM_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {pts.map((p) => (
                      <circle key={p.i} cx={p.x} cy={p.y} r={p.i === activeIdx ? 5 : 4} fill={TEAM_COLOR} />
                    ))}
                  </g>
                )
              })()}
            </svg>

            {activeMonth && (
              <div
                className="pointer-events-none absolute z-10 min-w-[11rem] rounded-xl border border-neutral-200 bg-neutral-0 px-3.5 py-3 shadow-lg"
                style={{ top: M.top, left: xAt(activeIdx) + (flip ? -12 : 12), transform: flip ? 'translateX(-100%)' : undefined }}
              >
                <p className="mb-2 text-xs font-semibold text-neutral-800">{longMonth(activeMonth)}</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {teamMap[activeMonth] != null && (
                    <li className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 font-semibold text-neutral-800">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_COLOR, opacity: TEAM_OPACITY + 0.1 }} />
                        Team average
                      </span>
                      <span className="font-bold tabular-nums text-neutral-800">{teamMap[activeMonth]}</span>
                    </li>
                  )}
                  {tooltipRows.map(({ intv, idx, v }) => {
                    const { color, shape } = seriesFor(idx)
                    const isHover = intv.user_id === hoveredId
                    return (
                      <li key={intv.user_id} className={`flex items-center justify-between gap-4 ${isHover ? 'font-semibold text-neutral-800' : 'text-neutral-600'}`}>
                        <span className="flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><Marker shape={shape} x={6} y={6} r={3.5} color={color} /></svg>
                          {shortName(intv.name)}
                        </span>
                        <span className="tabular-nums">{v}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {n > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold text-neutral-800">
            <span className="inline-block h-0.5 w-5 rounded-pill" style={{ background: TEAM_COLOR, opacity: TEAM_OPACITY + 0.1 }} />
            Team average
          </span>
          {interviewers.map((intv, idx) => {
            const { color, dash, shape } = seriesFor(idx)
            const hidden = hiddenIds.has(intv.user_id)
            return (
              <button
                key={intv.user_id}
                type="button"
                aria-pressed={!hidden}
                title={hidden ? 'Show on chart' : 'Hide from chart'}
                onClick={() => toggleHidden(intv.user_id)}
                onMouseEnter={() => setHoveredId(intv.user_id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(intv.user_id)}
                onBlur={() => setHoveredId(null)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300 ${
                  hidden
                    ? 'border-neutral-200 bg-neutral-50 text-neutral-400 line-through'
                    : intv.user_id === hoveredId
                    ? 'border-neutral-300 bg-neutral-100 text-neutral-800'
                    : 'border-neutral-200 bg-neutral-0 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <span className={hidden ? 'opacity-40' : ''}><LegendSwatch color={color} dash={dash} shape={shape} /></span>
                {shortName(intv.name)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
