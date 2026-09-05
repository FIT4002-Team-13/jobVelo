import { useState } from 'react'
import { SortMenu, FilterMenu, makeSorter } from './TableControls'
import { flex, card, badge } from '../../styles/layout'
import { CANDIDATE_STATUS_STYLES, FALLBACK_STATUS_CLASS } from '../../utils/status.js'
import { formatScore, formatDateTime } from '../../utils/format.js'
import { initials, avatarColor } from '../../utils/avatar.js'

const CANDIDATE_FILTER_OPTIONS = [
  { value: 'NOT SCHEDULED', label: 'Not Scheduled' },
  { value: 'SCHEDULED',     label: 'Scheduled'     },
  { value: 'IN PROGRESS',   label: 'In Progress'   },
  { value: 'COMPLETED',     label: 'Completed'     },
]

export default function CandidatesTable({
  candidates,
  tab,
  setTab,
  user,
  onStartInterview,
  onEditCandidate,
  onDelete,
  onOpenInterview,
  onOpenCandidate,
  onDownloadTranscript,
}) {
  const isInterviewer = user?.role === 'interviewer'
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('latest')
  const [statusFilters, setStatusFilters] = useState([])

  const needle = search.trim().toLowerCase()
  const filtered = candidates.filter((c) => {
    if (needle && !(c.name ?? '').toLowerCase().includes(needle)) return false
    if (statusFilters.length > 0 && !statusFilters.includes(c.status)) return false
    return true
  })

  let sorted
  if (tab === 'RANKINGS') {
    sorted = [...filtered].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
  } else {
    const sorter = makeSorter(sortKey, { nameField: 'name', dateField: 'scheduled_at' })
    sorted = sorter ? [...filtered].sort(sorter) : filtered
  }

  return (
    <div>
      <div className={`${flex.rowBetween} gap-3 mb-4`}>
        <div className={`${flex.row} gap-2`}>
          {['SCHEDULES', 'RANKINGS'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === t ? 'bg-primary-500 text-white' : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={`${flex.row} gap-3`}>
          <div className={`${flex.row} gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-neutral-0`}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Candidate Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-32"
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          {tab === 'SCHEDULES' ? (
            <SortMenu value={sortKey} onChange={setSortKey} />
          ) : (
            <span className={`${flex.row} gap-1 text-xs font-medium text-neutral-300 cursor-not-allowed`} title="Rankings are sorted by score">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M6 12h12M9 18h6" />
              </svg>
              Sort
            </span>
          )}
          <FilterMenu values={statusFilters} onChange={setStatusFilters} options={CANDIDATE_FILTER_OPTIONS} singleSelect />
        </div>
      </div>

      <div className={`${card.flat} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              {(tab === 'RANKINGS'
                ? ['Rank', 'Candidate', 'Status', 'Communication', 'Skill', 'Problem Solving', 'Score', 'Actions']
                : ['Candidate', 'Status', 'Datetime', 'Score', 'Interviewer', 'Actions']
              ).map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={tab === 'RANKINGS' ? 8 : 6} className="px-4 py-8 text-center text-sm text-neutral-400">
                  No candidates found.
                </td>
              </tr>
            ) : (
              sorted.map((c, i) => {
                const candidateCell = (
                  <td className="px-4 py-3">
                    <div className={`${flex.row} gap-3`}>
                      <div className={`w-8 h-8 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <span className="font-medium text-neutral-800">{c.name}</span>
                    </div>
                  </td>
                )
                const statusCell = (
                  <td className="px-4 py-3">
                    <span className={`${badge.sm} ${CANDIDATE_STATUS_STYLES[c.status] ?? FALLBACK_STATUS_CLASS}`}>
                      {c.status}
                    </span>
                  </td>
                )
                const scoreCell = (
                  <td className="px-4 py-3 font-semibold text-neutral-700">{formatScore(c.score)}</td>
                )
                const isRanked = typeof c.score === 'number' && Number.isFinite(c.score)
                const canStart = c.status === 'SCHEDULED' && isInterviewer
                const hasCompletedInterview = Boolean(c.intv_completed)
                const actionsCell = (
                  <td className="px-4 py-3 w-[1%]" onClick={(e) => e.stopPropagation()}>
                    <div className={`${flex.row} gap-2 whitespace-nowrap`}>
                      {hasCompletedInterview ? (
                        <button
                          type="button"
                          title="View the completed interview's transcription"
                          onClick={() => c.intv_id && onOpenInterview?.(c.intv_id)}
                          className={`${flex.row} justify-center w-[150px] gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap bg-mint-100 text-mint-700 hover:bg-mint-200`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          View Transcription
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canStart}
                          title={!isInterviewer ? 'Only interviewers can start interviews' : undefined}
                          onClick={() => canStart && onStartInterview?.(c)}
                          className={`${flex.row} justify-center w-[150px] gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                            canStart ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                          }`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          Start Interview
                        </button>
                      )}
                      <span className="mx-1 w-px self-stretch bg-neutral-200" aria-hidden />
                      <div className={`${flex.row} gap-2`}>
                        <button
                          type="button"
                          disabled={!hasCompletedInterview}
                          title={hasCompletedInterview ? 'Download transcript' : 'No transcript available'}
                          aria-label="Download transcript"
                          onClick={() => hasCompletedInterview && onDownloadTranscript?.(c.intv_id)}
                          className={`w-7 h-7 ${flex.rowCenter} rounded-lg transition-colors ${
                            hasCompletedInterview ? 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600' : 'text-neutral-200 cursor-not-allowed'
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={c.status === 'COMPLETED' || c.status === 'CANCELLED'}
                          onClick={() => {
                            if (c.status === 'COMPLETED' || c.status === 'CANCELLED') return
                            onEditCandidate?.(c)
                          }}
                          title={c.status === 'COMPLETED' || c.status === 'CANCELLED'
                            ? 'This interview is finished - the application can no longer be edited.'
                            : 'Edit candidate'}
                          aria-label="Edit candidate"
                          className={`w-7 h-7 ${flex.rowCenter} rounded-lg transition-colors ${
                            c.status === 'COMPLETED' || c.status === 'CANCELLED'
                              ? 'cursor-not-allowed text-neutral-200'
                              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onDelete?.(c) }}
                          title="Remove this candidate from the job"
                          aria-label="Delete candidate"
                          className={`w-7 h-7 ${flex.rowCenter} rounded-lg text-coral-500 hover:bg-coral-50 hover:text-coral-700 transition-colors`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                )

                return (
                  <tr
                    key={c.id ?? i}
                    onClick={() => onOpenCandidate?.(c)}
                    className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    {tab === 'RANKINGS' ? (
                      <>
                        <td className={`px-4 py-3 w-12 ${
                          !isRanked ? 'text-neutral-400'
                          : i === 0 ? 'text-yellow-500'
                          : i === 1 ? 'text-neutral-400'
                          : i === 2 ? 'text-amber-700'
                          : 'text-neutral-500'
                        }`}>
                          {isRanked ? `#${i + 1}` : 'N/A'}
                        </td>
                        {candidateCell}
                        {statusCell}
                        <td className="px-4 py-3 text-neutral-700">{formatScore(c.ratings?.communication?.score)}</td>
                        <td className="px-4 py-3 text-neutral-700">{formatScore(c.ratings?.technical_skills?.score)}</td>
                        <td className="px-4 py-3 text-neutral-700">{formatScore(c.ratings?.problem_solving?.score)}</td>
                        {scoreCell}
                        {actionsCell}
                      </>
                    ) : (
                      <>
                        {candidateCell}
                        {statusCell}
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">{formatDateTime(c.scheduled_at)}</td>
                        {scoreCell}
                        <td className="px-4 py-3">
                          <div className={`${flex.row} gap-2`}>
                            <div className={`w-7 h-7 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${avatarColor(c.interviewer ?? '')}`}>
                              {initials(c.interviewer ?? '')}
                            </div>
                            <span className="text-neutral-600">{c.interviewer}</span>
                          </div>
                        </td>
                        {actionsCell}
                      </>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
