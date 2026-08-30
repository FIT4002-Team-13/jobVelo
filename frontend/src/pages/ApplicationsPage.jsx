import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import AddCandidateForm from '../components/candidate/AddCandidateForm'
import EditCandidateForm from '../components/candidate/EditCandidateForm'
import { SortMenu, FilterMenu } from '../components/job-candidate/TableControls'
import { page, card, button, badge } from '../styles/layout'
import { useAuth } from '../lib/AuthContext.jsx'
import { authedFetch } from '../lib/api.js'

function getInitials(name = '') {
  const safeName = typeof name === 'string' ? name.trim() : ''
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return initials || '--'
}

function avatarColor(name = '') {
  const colors = ['bg-primary-500', 'bg-sky-500', 'bg-mint-500', 'bg-coral-500']
  const safeName = typeof name === 'string' ? name : ''
  let hash = 0
  for (const c of safeName) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}

// Unified palette - mirrors JobDetailPage / DashboardPage / CandidateDetailPage
// so the same status reads identically across the app. Key change: SCHEDULED
// now flips to primary blue (was grey) so it's visually distinct from
// NOT SCHEDULED, which stays grey.
function statusClass(status) {
  switch (status) {
    case 'NOT SCHEDULED':
      return 'bg-neutral-100 text-neutral-500'
    case 'SCHEDULED':
      return 'bg-primary-100 text-primary-600'
    case 'IN PROGRESS':
      return 'bg-sky-100 text-sky-600'
    case 'COMPLETED':
    case 'EVALUATED':
      return 'bg-mint-100 text-mint-700'
    case 'HIRED':
      return 'bg-mint-500 text-white'
    case 'REJECTED':
      return 'bg-coral-100 text-coral-700'
    default:
      return 'bg-neutral-100 text-neutral-500'
  }
}

function formatScore(score) {
  if (score == null) return '--'
  return Number(score).toFixed(1)
}

function getCandidateScore(ratings) {
  if (!ratings) return null

  const scores = [
    ratings.communication?.score,
    ratings.technical_skills?.score,
    ratings.problem_solving?.score,
  ].filter(
    (score) =>
      typeof score === 'number' &&
      Number.isFinite(score)
  )

  if (scores.length === 0) return null

  const average = scores.reduce((total, score) => total + score, 0) / scores.length

  return Math.round(average * 10) / 10
}

function formatShortDate(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'score', label: 'Score' },
  { value: 'name_asc', label: 'Name A - Z' },
  { value: 'name_desc', label: 'Name Z - A' },
]

// Kept in sync with the dashboard candidates panel + JobDetailPage candidate
// filter so the same statuses are filterable wherever the user looks. HIRED
// and REJECTED rows can still exist in the data; they show up under "All"
// but aren't surfaced as their own filter chips here - rare enough that the
// noise wasn't worth the extra dropdown options.
const FILTER_OPTIONS = [
  { value: '',              label: 'All'           },
  { value: 'NOT SCHEDULED', label: 'Not Scheduled' },
  { value: 'SCHEDULED',     label: 'Scheduled'     },
  { value: 'EVALUATED',     label: 'Evaluated'     },
]

// Previously had a bespoke OptionsPopup component here - replaced by the
// shared SortMenu / FilterMenu from TableControls so this page reads
// identically to the dashboard and Jobs/JobDetail pages.

export default function ApplicationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [sortValue, setSortValue] = useState('date')
  const [filterValue, setFilterValue] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  async function loadApplications() {
    const res = await authedFetch(
      `/api/applications?user_id=${encodeURIComponent(user?.userid || '')}`
    )
    if (!res.ok) throw new Error('Failed to load applications.')
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')

        const [jobsRes] = await Promise.all([
          authedFetch('/api/jobs'),
          loadApplications(),
        ])

        if (!jobsRes.ok) throw new Error('Failed to load jobs.')

        const jobsData = await jobsRes.json()
        setJobs(Array.isArray(jobsData) ? jobsData : [])
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    }

    if (user?.userid) {
      load()
    }
  }, [user?.userid])

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()

    let next = rows.filter((row) => {
      const matchesSearch =
        !needle ||
        (row.candidate_name || '').toLowerCase().includes(needle) ||
        (row.job_title || '').toLowerCase().includes(needle)

      const matchesFilter =
        !filterValue || row.status === filterValue

      return matchesSearch && matchesFilter
    })

    next = [...next].sort((a, b) => {
      switch (sortValue) {
        case 'score': 
          return ((getCandidateScore(b.ratings) ?? -Infinity) - (getCandidateScore(a.ratings) ?? -Infinity))
        case 'name_asc':
          return (a.candidate_name || '').localeCompare(b.candidate_name || '')
        case 'name_desc':
          return (b.candidate_name || '').localeCompare(a.candidate_name || '')
        case 'date':
        default:
          return new Date(b.interview_datetime || 0) - new Date(a.interview_datetime || 0)
      }
    })

    return next
  }, [rows, search, sortValue, filterValue])

  async function handleAddSaved() {
    try {
      await loadApplications()
      setShowAddModal(false)
    } catch (err) {
      setError(err.message || 'Failed to refresh applications.')
    }
  }

  async function handleEditSaved() {
    try {
      await loadApplications()
      setShowEditModal(false)
      setSelectedRow(null)
    } catch (err) {
      setError(err.message || 'Failed to refresh applications.')
    }
  }

  function openCandidate(row) {
    if (!row?.cand_id || !row?.job_id) return
    navigate(`/candidates/${row.cand_id}/${row.job_id}`)
  }

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        {/* Header + controls render unconditionally - same skeleton as
            JobsPage, where loading/error/empty states appear as a small
            status line BELOW the controls instead of blanking the page. */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              Applications
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Manage all candidates across jobs
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={`flex items-center gap-2 ${button.primary}`}
          >
            <span className="text-lg leading-none">+</span> Add Candidate
          </button>
        </div>

        {/* Controls row - matches the JobsPage search/sort/filter styling so
            the two pages read identically: same search-bar size, same icon'd
            sort/filter buttons, vertically centered. */}
        <div className="mb-5 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-0 px-3 py-1.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Candidate Name"
              className="w-32 border-none bg-transparent text-sm text-neutral-600 outline-none placeholder:text-neutral-400"
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          {/* Shared SortMenu - same compact dropdown used on Dashboard,
              JobsPage and JobDetailPage. */}
          <SortMenu
            value={sortValue}
            onChange={setSortValue}
            options={SORT_OPTIONS}
          />

          {/* Shared FilterMenu in single-select mode. We feed the current
              filterValue as a single-item array (or wrap '' for the "All"
              sentinel) and unwrap on change. Result: the dropdown lights
              up "All" when nothing is filtering, exactly like the other
              status filters across the app. */}
          <FilterMenu
            values={[filterValue]}
            onChange={(newValues) => setFilterValue(newValues[0] ?? '')}
            options={FILTER_OPTIONS}
            singleSelect
          />
        </div>

        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {!loading && error && <p className="text-sm text-coral-500">{error}</p>}

        {!loading && !error && (
          filteredRows.length === 0
            ? <p className="text-sm text-neutral-400">No applications found.</p>
            : (
        <div className={`${card.base} overflow-hidden !p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Job Applied
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    CV
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    CL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"></th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => (
                    // Whole row navigates to the candidate page now. Action
                    // cells below (CV / CL links, Edit button) all carry
                    // stopPropagation so they keep their own click without
                    // also opening the candidate page.
                    <tr
                      key={row.application_id}
                      onClick={() => openCandidate(row)}
                      className="border-t border-neutral-100 last:border-b-0 hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-bold text-white ${avatarColor(row.candidate_name)}`}
                          >
                            {getInitials(row.candidate_name)}
                          </div>
                          <span className="font-medium text-neutral-800">
                            {row.candidate_name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-neutral-700">
                        {row.job_title}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`${badge.sm} ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {/* Once an analysis exists the cell links to the CV
                            analysis report; the raw-PDF link only remains for
                            legacy rows that have a file but no analysis. */}
                        {row.cv_analysis_status === 'completed' ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/cv-analysis/${row.application_id}`)}
                            className="text-primary-500 font-semibold hover:underline"
                          >
                            View
                          </button>
                        ) : row.cv_analysis_status === 'processing' ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-neutral-400"
                            title="The CV is being analysed."
                          >
                            <svg
                              className="h-3.5 w-3.5 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                            >
                              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                            </svg>
                            Analysing…
                          </span>
                        ) : row.cv_analysis_status === 'failed' ? (
                          <span
                            className="text-coral-500"
                            title="Analysis failed. Re-upload the CV via Edit to retry."
                          >
                            Failed
                          </span>
                        ) : row.cv_url ? (
                          <a
                            href={row.cv_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-coral-500 hover:underline"
                          >
                            PDF
                          </a>
                        ) : (
                          '--'
                        )}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {row.cover_letter_url ? (
                          <a
                            href={row.cover_letter_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-500 hover:underline"
                          >
                            PDF
                          </a>
                        ) : (
                          '--'
                        )}
                      </td>

                      <td className="px-4 py-3 font-semibold text-neutral-700">
                        {formatScore(getCandidateScore(row.ratings))}
                      </td>

                      <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                        {formatShortDate(row.interview_datetime)}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRow(row)
                            setShowEditModal(true)
                          }}
                          className="text-neutral-400 hover:text-neutral-700"
                          title="Edit candidate"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
            )
        )}
      </main>

      {showAddModal && (
        <AddCandidateForm
          jobs={jobs}
          onClose={() => setShowAddModal(false)}
          onSaved={handleAddSaved}
        />
      )}

      {showEditModal && selectedRow && (
        <EditCandidateForm
          jobs={jobs}
          initialData={selectedRow}
          onClose={() => {
            setShowEditModal(false)
            setSelectedRow(null)
          }}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  )
}