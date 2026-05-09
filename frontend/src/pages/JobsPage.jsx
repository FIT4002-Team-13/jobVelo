import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import JobFormModal from '../components/JobFormModal'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  Pending:       'bg-red-100 text-red-500',
  Completed:     'bg-green-100 text-green-600',
  'In Progress': 'bg-blue-100 text-blue-600',
}

const AVATAR_COLORS = [
  'bg-blue-500','bg-orange-400','bg-green-500',
  'bg-purple-500','bg-teal-500','bg-pink-500','bg-yellow-500',
]

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, index }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div title={name}
      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white -ml-2 first:ml-0 ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}>
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
        <div className="absolute right-0 top-8 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 w-32">
          <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
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

function JobCard({ job, onEdit, onDelete }) {
  const navigate = useNavigate()
  const visibleAvatars = job.interviewers?.slice(0, 4) ?? []
  const overflow = (job.interviewers?.length ?? 0) - visibleAvatars.length

  return (
    <div onClick={() => navigate(`/jobs/${job.id}`)}
      className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-800 flex-1">{job.title}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[job.status] ?? 'bg-neutral-100 text-neutral-500'}`}>
            {job.status}
          </span>
          <CardMenu onEdit={() => onEdit(job)} onDelete={() => onDelete(job)} />
        </div>
      </div>

      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{job.description}</p>

      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        {job.interviewers?.length ?? 0} interviewers
      </div>

      <div className="flex items-center">
        {visibleAvatars.map((name, i) => <Avatar key={i} name={name} index={i} />)}
        {overflow > 0 && (
          <div className="w-7 h-7 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-500 border-2 border-white -ml-2">
            +{overflow}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {job.candidates_filled} / {job.candidates_total} candidates
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
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete.')
      onDeleted(job.id)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <h2 className="text-base font-bold text-neutral-800 text-center mb-1">Delete Job Posting</h2>
        <p className="text-sm text-neutral-500 text-center mb-6">
          Are you sure you want to delete <span className="font-semibold text-neutral-700">"{job.title}"</span>? This cannot be undone.
        </p>
        {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
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
  const [formModal, setFormModal]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    fetch('/api/jobs')
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

  const filtered = jobs.filter(j => j.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-screen bg-neutral-50 font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto px-10 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">Job Posting</h1>
            <p className="text-sm text-neutral-400 mt-1">Manage your open positions</p>
          </div>
          <button onClick={() => setFormModal('create')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <span className="text-lg leading-none">+</span> Create Job
          </button>
        </div>

        <div className="flex justify-end items-center gap-3 mb-5">
          <div className="flex items-center gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-white">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Position Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-36" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <button className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter
          </button>
        </div>

        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {error   && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && (
          filtered.length === 0
            ? <p className="text-sm text-neutral-400">No jobs found.</p>
            : (
              <div className="grid grid-cols-3 gap-4">
                {filtered.map(job => (
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
