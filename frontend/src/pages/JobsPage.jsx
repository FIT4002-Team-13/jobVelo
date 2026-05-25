import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import JobFormModal from '../components/job-candidate/JobFormModal'
import { SortMenu, FilterMenu, makeSorter } from '../components/job-candidate/TableControls'
import { authedFetch } from '../lib/api.js'
import { button, modal, page } from '../styles/layout'

const JOB_STATUS_OPTIONS = [
  { value: 'Pending',     label: 'Pending'     },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed'   },
]

// ── Constants ─────────────────────────────────────────────────────────────────

// Solid-fill status pills - white bold text on a brand-colour background.
// Pending = warning (coral), In Progress = active (primary), Completed = done (mint).
const STATUS_STYLES = {
  Pending:       'bg-coral-500 text-white',
  'In Progress': 'bg-primary-500 text-white',
  Completed:     'bg-mint-500 text-white',
}

const AVATAR_COLORS = [
  'bg-primary-500', 'bg-sky-500', 'bg-mint-500', 'bg-coral-500',
  'bg-primary-700', 'bg-sky-700', 'bg-mint-700',
]

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, index }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div title={name}
      className={`w-7 h-7 rounded-pill flex items-center justify-center text-white text-xs font-bold border-2 border-neutral-0 -ml-2 first:ml-0 ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}>
      {initials}
    </div>
  )
}

function CardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-neutral-0 border border-neutral-200 rounded-xl shadow-lg py-1 w-32">
          <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-sm text-coral-500 hover:bg-coral-50 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// Empty-state placeholder used by JobCard when a field hasn't been filled.
// Italic + light-grey reads as "missing" without breaking the card's
// vertical rhythm - every card stays the same height regardless of how
// complete its data is.
const EMPTY_TEXT = 'text-neutral-400 italic'

// Dashed circle that mimics an Avatar's footprint. Used when a role has
// no interviewers assigned yet, so the avatar row never collapses.
function EmptyAvatar() {
  return (
    <div
      title="No interviewer assigned"
      aria-label="No interviewer assigned"
      className="w-7 h-7 rounded-pill border-2 border-dashed border-neutral-300 -ml-2 first:ml-0"
    />
  )
}

function JobCard({ job, onEdit, onDelete }) {
  const navigate = useNavigate()
  // Show up to 3 avatars; anything beyond collapses into a grey "+N" chip.
  const visibleAvatars = job.interviewers?.slice(0, 3) ?? []
  const overflow = (job.interviewers?.length ?? 0) - visibleAvatars.length

  // Field-level fallbacks so empty cards stay structurally identical to
  // fully-populated ones. Each "missing" value renders as a muted italic
  // placeholder (status pill = neutral chip, numbers = 0) instead of an
  // empty string that would collapse the line and ruin the grid rhythm.
  const status         = job.status        || null
  const description    = job.description?.trim()
  const interviewers   = job.interviewers?.length ?? 0
  const filled         = job.candidates_filled ?? 0
  const total          = job.candidates_total  ?? 0

  // Typography hierarchy on this card:
  //   1. Title       - text-base, bold, ink-dark   (the "what")
  //   2. Description - text-xs,   regular, mid-grey (the "context")
  //   3. Meta rows   - text-xs,   regular, light-grey, with key numbers
  //                    bumped to medium weight + darker for scannability
  return (
    <div onClick={() => navigate(`/jobs/${job.id}`)}
      className="bg-neutral-0 border border-neutral-300 rounded-2xl p-5 flex flex-col gap-2 hover:shadow-md transition-all cursor-pointer">
      {/* Title + status + menu */}
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-base font-bold leading-snug flex-1 ${job.title ? 'text-neutral-800' : EMPTY_TEXT}`}>
          {job.title || 'Untitled role'}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status pill - when status is missing fall back to the same
              neutral chip used elsewhere for unset statuses, with a dash
              so the pill keeps its footprint. */}
          <span className={`text-xs font-bold px-3 py-1 rounded-pill whitespace-nowrap ${
            status ? (STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-500') : 'bg-neutral-100 text-neutral-400'
          }`}>
            {status || '—'}
          </span>
          <CardMenu onEdit={() => onEdit(job)} onDelete={() => onDelete(job)} />
        </div>
      </div>

      {/* Description - always reserve 2 lines so card heights line up. */}
      <p className={`text-xs leading-relaxed line-clamp-2 min-h-[2.5rem] ${description ? 'text-neutral-500' : EMPTY_TEXT}`}>
        {description || 'No description provided.'}
      </p>

      {/* Interviewers count */}
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span className={interviewers > 0 ? 'font-semibold text-neutral-700' : 'font-semibold text-neutral-400'}>
          {interviewers}
        </span>
        interviewers
      </div>

      {/* Avatars - render dashed placeholders when nobody is assigned so the
          row keeps its height. Three dashed circles read as "three open
          slots", which is the right mental model for an empty interview team. */}
      <div className="flex items-center">
        {visibleAvatars.length > 0 ? (
          <>
            {visibleAvatars.map((name, i) => <Avatar key={i} name={name} index={i} />)}
            {overflow > 0 && (
              <div className="w-7 h-7 rounded-pill bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-500 border-2 border-neutral-0 -ml-2">
                +{overflow}
              </div>
            )}
          </>
        ) : (
          <>
            <EmptyAvatar />
            <EmptyAvatar />
            <EmptyAvatar />
          </>
        )}
      </div>

      {/* Candidates count - 0/0 falls back to muted styling so empty roles
          read as "not started yet" rather than "filled to capacity". */}
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className={total > 0 ? 'font-semibold text-neutral-700' : 'font-semibold text-neutral-400'}>
          {filled}
        </span>
        / {total} candidates
      </div>
    </div>
  )
}

function DeleteConfirmModal({ job, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await authedFetch(`/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete.')
      onDeleted(job.id)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className="bg-neutral-0 rounded-2xl w-full max-w-sm shadow-xl p-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-pill bg-coral-100 mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-coral-500">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <h2 className="text-base font-bold text-neutral-800 text-center mb-1">Delete Job Posting</h2>
        <p className="text-sm text-neutral-500 text-center mb-6">
          Are you sure you want to delete <span className="font-semibold text-neutral-700">"{job.title}"</span>? This cannot be undone.
        </p>
        {error && <p className="text-xs text-coral-500 text-center mb-3">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className={`flex-1 py-2 ${button.cancel}`}>
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className={`flex-1 py-2 ${button.danger}`}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [jobs, setJobs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('latest')        // default: newest first
  const [statusFilters, setStatusFilters] = useState([])        // empty = all
  const [formModal, setFormModal]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    authedFetch('/jobs')
      .then(r => r.json())
      .then(setJobs)
      .catch(() => setError('Failed to load jobs.'))
      .finally(() => setLoading(false))
  }, [])

  function handleSaved(saved) {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === saved.id)
      return idx === -1 ? [saved, ...prev] : prev.map(j => j.id === saved.id ? saved : j)
    })
    setFormModal(null)
  }

  function handleDeleted(id) {
    setJobs(prev => prev.filter(j => j.id !== id))
    setDeleteTarget(null)
  }

  // search → filter by status → sort. Each stage is independent so order
  // doesn't actually matter, but read top-down it matches user mental model.
  const filtered = jobs
    .filter(j => j.title.toLowerCase().includes(search.toLowerCase()))
    .filter(j => statusFilters.length === 0 || statusFilters.includes(j.status))
  const sorter = makeSorter(sortKey, { nameField: 'title', dateField: 'job_created_at' })
  const display = sorter ? [...filtered].sort(sorter) : filtered

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        <div className="flex items-start justify-between mb-6">
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
        </div>

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

      {formModal && (
        <JobFormModal
          initialJob={formModal === 'create' ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          job={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted} />
      )}
    </div>
  )
}
