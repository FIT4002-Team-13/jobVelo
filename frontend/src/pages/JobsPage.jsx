import { useState, useEffect } from 'react'
import Sidebar from '../components/common/Sidebar'
import JobFormModal from '../components/job-candidate/JobFormModal'
import JobCard from '../components/job-candidate/JobCard'
import DeleteJobModal from '../components/job-candidate/DeleteJobModal'
import { SortMenu, FilterMenu, makeSorter } from '../components/job-candidate/TableControls'
import { authedFetch } from '../lib/api.js'
import { useToast } from '../components/common/ToastContext.jsx'
import { button, page } from '../styles/layout'

const JOB_STATUS_OPTIONS = [
  { value: 'Pending',     label: 'Pending'     },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed'   },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const toast = useToast()
  const [jobs, setJobs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('latest')        // default: newest first
  const [statusFilters, setStatusFilters] = useState([])        // empty = all
  const [formModal, setFormModal]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  // Per-job count of DISTINCT candidates with a completed interview -
  // drives the display override on cards AND the status filter, so a
  // card's label always matches what the filter menu selects.
  const [completedByJob, setCompletedByJob] = useState(() => ({}))

  useEffect(() => {
    // Guard both the HTTP status and the payload shape: on an expired token
    // the API returns {detail: ...}, and storing that into array state used
    // to white-screen the page at `.filter is not a function`.
    authedFetch('/api/jobs')
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load jobs.')
        const data = await r.json()
        if (!Array.isArray(data)) throw new Error('Failed to load jobs.')
        setJobs(data)
      })
      .catch(() => setError('Failed to load jobs.'))
      .finally(() => setLoading(false))

    // One company-wide interviews fetch instead of one per card (the old
    // per-card version was 50 requests for 50 jobs). Best-effort: if it
    // fails, cards simply show their stored status without the override.
    authedFetch('/api/interviews')
      .then(async r => {
        if (!r.ok) return
        const interviews = await r.json()
        if (!Array.isArray(interviews)) return
        // Distinct candidates per job, so repeat interviews for the same
        // candidate don't overcount toward "everyone is done".
        const candsByJob = {}
        for (const i of interviews) {
          if (i.intv_status !== 'completed' || !i.job_id) continue
          ;(candsByJob[i.job_id] ??= new Set()).add(i.cand_id)
        }
        setCompletedByJob(
          Object.fromEntries(
            Object.entries(candsByJob).map(([jobId, cands]) => [jobId, cands.size])
          )
        )
      })
      .catch(() => {})
  }, [])

  function handleSaved(saved) {
    // Read create-vs-edit off the modal mode BEFORE closing it.
    const isNew = formModal === 'create'
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === saved.id)
      return idx === -1 ? [saved, ...prev] : prev.map(j => j.id === saved.id ? saved : j)
    })
    setFormModal(null)
    toast.success(
      isNew
        ? `Job "${saved.title || 'Untitled role'}" created.`
        : `Job "${saved.title || 'Untitled role'}" updated.`
    )
  }

  function handleDeleted(id) {
    const deleted = jobs.find(j => j.id === id)
    setJobs(prev => prev.filter(j => j.id !== id))
    setDeleteTarget(null)
    toast.success(`Job "${deleted?.title || 'Untitled role'}" deleted.`)
  }

  // Stamp each job with the status the card will actually display:
  //   - every candidate on the job has completed their interview -> Completed
  //   - some (but not all) have completed -> In Progress
  //   - a job explicitly marked Completed keeps its label either way
  // Filtering runs on this same value so the pill and the filter menu can
  // never disagree.
  const jobsWithStatus = jobs.map(j => {
    const filled = j.candidates_filled ?? 0
    const done = completedByJob[j.id] ?? 0
    const display_status =
      j.status === 'Completed'
        ? 'Completed'
        : filled > 0 && done >= filled
        ? 'Completed'
        : done > 0
        ? 'In Progress'
        : j.status || null
    return { ...j, display_status }
  })

  // search → filter by status → sort. Each stage is independent so order
  // doesn't actually matter, but read top-down it matches user mental model.
  const filtered = jobsWithStatus
    .filter(j => (j.title ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter(j => statusFilters.length === 0 || statusFilters.includes(j.display_status))
  const sorter = makeSorter(sortKey, { nameField: 'title', dateField: 'job_created_at' })
  const display = sorter ? [...filtered].sort(sorter) : filtered

  return (
    <div className={page.shell}>
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-6 shrink-0 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">Job Posting</h1>
            <p className="text-xs text-neutral-400 mt-1">Manage your open positions</p>
          </div>
          <button
            type="button"
            onClick={() => setFormModal('create')}
            className={`flex items-center gap-2 ${button.primary}`}
          >
            <span className="text-lg leading-none">+</span> Create Job
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8">

        <div className="flex justify-end items-center gap-3 mb-5">
          <div className="flex items-center gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-neutral-0">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Position Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-32" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <SortMenu value={sortKey} onChange={setSortKey} />
          <FilterMenu values={statusFilters} onChange={setStatusFilters} options={JOB_STATUS_OPTIONS} />
        </div>

        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {error   && <p className="text-sm text-coral-500">{error}</p>}

        {!loading && !error && (
          display.length === 0
            ? <p className="text-sm text-neutral-400">No jobs found.</p>
            : (
              <div className="grid grid-cols-3 gap-4">
                {display.map(job => (
                  <JobCard key={job.id} job={job}
                    onEdit={j => setFormModal(j)}
                    onDelete={j => setDeleteTarget(j)} />
                ))}
              </div>
            )
        )}
        </main>
      </div>

      {formModal && (
        <JobFormModal
          initialJob={formModal === 'create' ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <DeleteJobModal
          job={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted} />
      )}
    </div>
  )
}
