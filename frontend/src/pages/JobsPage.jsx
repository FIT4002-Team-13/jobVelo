import { useState } from 'react'
import Sidebar from '../components/common/Sidebar'
import JobFormModal from '../components/job-candidate/JobFormModal'
import JobCard from '../components/job-candidate/JobCard'
import DeleteJobModal from '../components/job-candidate/DeleteJobModal'
import { SortMenu, FilterMenu } from '../components/job-candidate/TableControls'
import { api } from '../lib/api.js'
import { useToast } from '../components/common/ToastContext.jsx'
import { button, page } from '../styles/layout'
import { JOB_STATUS_OPTIONS } from '../utils/constants.js'
import { useAsync } from '../hooks/useAsync.js'
import { useTableControls } from '../hooks/useTableControls.js'

// One company-wide interviews fetch instead of one per card (the old
// per-card version was 50 requests for 50 jobs). Best-effort: if it fails,
// cards simply show their stored status without the completed override.
async function loadJobsData() {
  const [jobsData, interviews] = await Promise.all([
    api.listJobs(),
    api.listInterviews().catch(() => []),
  ])
  // Distinct candidates per job, so repeat interviews for the same
  // candidate don't overcount toward "everyone is done".
  const candsByJob = {}
  for (const i of interviews) {
    if (i.intv_status !== 'completed' || !i.job_id) continue
    ;(candsByJob[i.job_id] ??= new Set()).add(i.cand_id)
  }
  const completedByJob = Object.fromEntries(
    Object.entries(candsByJob).map(([jobId, cands]) => [jobId, cands.size])
  )
  return { jobs: Array.isArray(jobsData) ? jobsData : [], completedByJob }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const toast = useToast()
  const { data, setData, loading, error } = useAsync(loadJobsData, [])
  const jobs = data?.jobs ?? []
  const completedByJob = data?.completedByJob ?? {}

  const [formModal, setFormModal]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  function handleSaved(saved) {
    // Read create-vs-edit off the modal mode BEFORE closing it.
    const isNew = formModal === 'create'
    setData(prev => {
      const prevJobs = prev?.jobs ?? []
      const idx = prevJobs.findIndex(j => j.id === saved.id)
      const nextJobs = idx === -1 ? [saved, ...prevJobs] : prevJobs.map(j => j.id === saved.id ? saved : j)
      return { ...prev, jobs: nextJobs }
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
    setData(prev => ({ ...prev, jobs: (prev?.jobs ?? []).filter(j => j.id !== id) }))
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

  const table = useTableControls(jobsWithStatus, {
    matchesSearch: (j, needle) => (j.title ?? '').toLowerCase().includes(needle),
    matchesFilter: (j, filters) => filters.length === 0 || filters.includes(j.display_status),
    sortFields: { nameField: 'title', dateField: 'job_created_at' },
  })

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
            <input value={table.search} onChange={e => table.setSearch(e.target.value)} placeholder="Position Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-32" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <SortMenu value={table.sortKey} onChange={table.setSortKey} />
          <FilterMenu values={table.filters} onChange={table.setFilters} options={JOB_STATUS_OPTIONS} />
        </div>

        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {error   && <p className="text-sm text-coral-500">{error}</p>}

        {!loading && !error && (
          table.paged.length === 0
            ? <p className="text-sm text-neutral-400">No jobs found.</p>
            : (
              <div className="grid grid-cols-3 gap-4">
                {table.paged.map(job => (
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
