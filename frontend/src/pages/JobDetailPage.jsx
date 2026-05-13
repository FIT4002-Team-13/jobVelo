import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import JobFormModal from '../components/job-candidate/JobFormModal'
import { flex, card, badge, form, button, modal, page } from '../styles/layout'
import { fontSize } from '../styles/typography'

import { useAuth } from '../lib/AuthContext.jsx'
import { api } from '../lib/api.js'

// ── Constants ─────────────────────────────────────────────────────────────────

// Solid-fill status pills - kept in sync with JobsPage + DashboardPage.
// Pending = warning (coral), In Progress = active (primary), Completed = done (mint).
const STATUS_STYLES = {
  Pending:       'bg-coral-500 text-white',
  'In Progress': 'bg-primary-500 text-white',
  Completed:     'bg-mint-500 text-white',
}

const CANDIDATE_STATUS_STYLES = {
  EVALUATED: 'bg-sky-100 text-sky-600',
  HIRED:     'bg-mint-100 text-mint-600',
  SCHEDULED: 'bg-neutral-100 text-neutral-500',
  REJECTED:  'bg-coral-100 text-coral-500',
}

const AVATAR_COLORS = [
  'bg-primary-500', 'bg-sky-500', 'bg-mint-500', 'bg-coral-500'
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(name = '') {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatDate(iso) {
  if (!iso) return '--'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return isToday ? `Today, ${time}` : `${formatDate(iso.slice(0, 10))}, ${time}`
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-xs'
  return (
    <div title={name}
      className={`${sz} rounded-pill ${flex.rowCenter} text-white font-bold border-2 border-neutral-0 -ml-2 first:ml-0 ${avatarColor(name)}`}>
      {initials(name)}
    </div>
  )
}

// ── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({ jobId, onClose, onAdded }) {
  const { user } = useAuth()
  // Mirrors the AddCandidateToJob Pydantic model on the backend:
  //   name + email are required (so the candidate doc has real identity);
  //   phone, cv_url, cover_letter_url, interviewer, scheduled_at are optional.
  const [form_state, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    cv_url: '',
    cover_letter_url: '',
    interviewer: '',
    scheduled_at: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Interviewers in the caller's company - powers the combobox below.
  const [interviewers, setInterviewers] = useState([])

  useEffect(() => {
    if (!user?.comp_id) return
    api.listUsers({ comp_id: user.comp_id, role: 'interviewer' })
      .then(setInterviewers)
      .catch(() => setInterviewers([]))   // empty -> dropdown shows "no interviewers"
  }, [user?.comp_id])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form_state.name.trim())  return setError('Candidate name is required.')
    if (!form_state.email.trim()) return setError('Candidate email is required.')

    setError(null)
    setSubmitting(true)
    // Convert empty optional strings to null so EmailStr / URL validators
    // on the backend don't trip on "".
    const body = {
      name: form_state.name.trim(),
      email: form_state.email.trim().toLowerCase(),
      phone: form_state.phone.trim() || null,
      cv_url: form_state.cv_url.trim() || null,
      cover_letter_url: form_state.cover_letter_url.trim() || null,
      interviewer: form_state.interviewer.trim() || null,
      scheduled_at: form_state.scheduled_at || null,
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        // Surface FastAPI's actual error so 422s aren't silently "Failed to add candidate."
        const data = await res.json().catch(() => null)
        const detail = data?.detail
        const message =
          typeof detail === 'string' ? detail
          : Array.isArray(detail)    ? detail.map((d) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join(' • ')
          :                            `Request failed (${res.status})`
        throw new Error(message)
      }
      onAdded(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} scrollbar-primary max-w-md max-h-[90vh] overflow-y-auto`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        <h2 className="text-xl font-bold text-neutral-800 mb-1">Add Candidate</h2>
        <p className="text-xs text-neutral-400 mb-5">Required fields are indicated with an asterisk *</p>

        <form onSubmit={handleSubmit} className={`${flex.col} gap-4`}>
          <SectionLabel>Candidate</SectionLabel>

          <div>
            <label className={form.label}>Full Name *</label>
            <input value={form_state.name} onChange={e => set('name', e.target.value)}
              placeholder="eg. John Doe"
              className={form.input} />
          </div>
          <div>
            <label className={form.label}>Email *</label>
            <input type="email" value={form_state.email} onChange={e => set('email', e.target.value)}
              placeholder="eg. john.doe@example.com"
              className={form.input} />
          </div>
          <div>
            <label className={form.label}>Phone</label>
            <input value={form_state.phone} onChange={e => set('phone', e.target.value)}
              placeholder="eg. +61 412 345 678"
              className={form.input} />
          </div>
          <div>
            <label className={form.label}>CV URL</label>
            <input type="url" value={form_state.cv_url} onChange={e => set('cv_url', e.target.value)}
              placeholder="https://..."
              className={form.input} />
          </div>
          <div>
            <label className={form.label}>Cover Letter URL</label>
            <input type="url" value={form_state.cover_letter_url} onChange={e => set('cover_letter_url', e.target.value)}
              placeholder="https://..."
              className={form.input} />
          </div>

          <SectionLabel>Interview (optional)</SectionLabel>

          <div>
            <label className={form.label}>Interviewer</label>
            <InterviewerCombobox
              value={form_state.interviewer}
              onChange={(v) => set('interviewer', v)}
              options={interviewers}
            />
          </div>
          <div>
            <label className={form.label}>Scheduled Date & Time</label>
            <input type="datetime-local" value={form_state.scheduled_at} onChange={e => set('scheduled_at', e.target.value)}
              className={form.input} />
          </div>

          {error && <p className={form.error}>{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className={`${button.cancel} px-6 py-2`}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-6 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-60">
              {submitting ? 'Adding…' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider text-primary-600 pt-1">
      {children}
    </div>
  )
}

// Searchable dropdown for picking an interviewer from the company roster.
// Behaviour:
//   - typing filters the list by full_name / username / email (case-insensitive)
//   - clicking an option fills the field with the user's full_name
//   - clicking outside closes the panel
//   - this is a SELECT (not free-text) - the picker only ever sets values
//     from the supplied options, so we don't end up with typos in the DB
function InterviewerCombobox({ value, onChange, options }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Keep query in sync if the parent clears/sets value externally.
  useEffect(() => { setQuery(value || '') }, [value])

  // Close panel on outside click.
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = query.toLowerCase().trim()
  const filtered = q
    ? options.filter((o) =>
        (o.full_name || '').toLowerCase().includes(q) ||
        (o.username  || '').toLowerCase().includes(q) ||
        (o.email     || '').toLowerCase().includes(q)
      )
    : options

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={options.length === 0 ? 'No interviewers in your company yet' : 'Type to search interviewers…'}
        className={form.input}
      />
      {open && (
        <div className="scrollbar-primary absolute z-10 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-400">
              {options.length === 0
                ? 'No interviewers yet — invite one from the admin dashboard.'
                : `No matches for "${query}".`}
            </div>
          ) : (
            <ul>
              {filtered.map((o) => (
                <li key={o.userid}>
                  <button
                    type="button"
                    onClick={() => {
                      const picked = o.full_name || o.username || o.email || ''
                      onChange(picked)
                      setQuery(picked)
                      setOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary-500/10 transition-colors flex items-center gap-3"
                  >
                    <Avatar name={o.full_name || o.username || o.email || '?'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-800 truncate">{o.full_name || o.username}</div>
                      {o.email && <div className="text-xs text-neutral-400 truncate">{o.email}</div>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Interview Status Panel ────────────────────────────────────────────────────

function InterviewStatusPanel({ candidates, job }) {
  const counts = { HIRED: 0, REJECTED: 0, EVALUATED: 0, SCHEDULED: 0 }
  let scoreSum = 0, scoreCount = 0

  for (const c of candidates) {
    if (counts[c.status] !== undefined) counts[c.status]++
    if (c.score != null) { scoreSum += c.score; scoreCount++ }
  }

  const total = candidates.length
  const avgScore = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : '--'

  const uniqueInterviewers = [...new Set(
    candidates.map(c => c.interviewer).filter(Boolean)
  )]

  return (
    <div className={`${card.base} ${flex.col} gap-4`}>
      <h2 className="text-sm font-bold text-neutral-800">Interview Status</h2>

      <div className="text-center">
        <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Total Candidates</p>
        <p className="text-5xl font-extrabold text-primary-500">{total}</p>
      </div>

      <div className={`${flex.col} gap-1.5`}>
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className={`${flex.rowBetween} text-sm`}>
            <span className="text-neutral-500 font-medium">{status}</span>
            <span className="font-bold text-neutral-700">{count}</span>
          </div>
        ))}
      </div>

      <hr className="border-neutral-100" />

      <div className={flex.rowBetween}>
        <div>
          <p className="text-xs text-neutral-400 mb-2">Interviewer</p>
          <div className={flex.row}>
            {uniqueInterviewers.slice(0, 5).map((name, i) => (
              <Avatar key={i} name={name} size="sm" />
            ))}
            {uniqueInterviewers.length > 5 && (
              <div className={`w-7 h-7 rounded-pill bg-neutral-200 ${flex.rowCenter} text-xs font-bold text-neutral-500 border-2 border-neutral-0 -ml-2`}>
                +{uniqueInterviewers.length - 5}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400 mb-1">Average Score</p>
          <p className="text-xl font-extrabold text-neutral-700">{avgScore}</p>
        </div>
      </div>
    </div>
  )
}

// ── Candidates Table ──────────────────────────────────────────────────────────

function CandidatesTable({ candidates, tab, setTab }) {
  const [search, setSearch] = useState('')

  const sorted = tab === 'RANKINGS'
    ? [...candidates].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : [...candidates].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))

  const filtered = sorted.filter(c =>
    (c.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Single row: tabs on the left, search + sort + filter on the right. */}
      <div className={`${flex.rowBetween} gap-3 mb-4`}>
        <div className={`${flex.row} gap-2`}>
          {['SCHEDULES', 'RANKINGS'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === t
                  ? 'bg-primary-500 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className={`${flex.row} gap-3`}>
          <div className={`${flex.row} gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-neutral-0`}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Candidate Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-32" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <button className={`${flex.row} gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M6 12h12M9 18h6" />
            </svg>
            Sort
          </button>
          <button className={`${flex.row} gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter
          </button>
        </div>
      </div>

      <div className={`${card.flat} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              {['Candidate','Status','Datetime','Score','Interviewer','Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-400">No candidates found.</td>
              </tr>
            ) : filtered.map((c, i) => (
              <tr key={c.id ?? i} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors">
                {/* Candidate */}
                <td className="px-4 py-3">
                  <div className={`${flex.row} gap-3`}>
                    <div className={`w-8 h-8 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${avatarColor(c.name)}`}>
                      {initials(c.name)}
                    </div>
                    <span className="font-medium text-neutral-800">{c.name}</span>
                  </div>
                </td>
                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`${badge.sm} ${CANDIDATE_STATUS_STYLES[c.status] ?? 'bg-neutral-100 text-neutral-500'}`}>
                    {c.status}
                  </span>
                </td>
                {/* Datetime */}
                <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                  {formatDateTime(c.scheduled_at)}
                </td>
                {/* Score */}
                <td className="px-4 py-3 font-semibold text-neutral-700">
                  {c.score != null ? c.score : '--'}
                </td>
                {/* Interviewer */}
                <td className="px-4 py-3">
                  <div className={`${flex.row} gap-2`}>
                    <div className={`w-7 h-7 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${avatarColor(c.interviewer)}`}>
                      {initials(c.interviewer)}
                    </div>
                    <span className="text-neutral-600">{c.interviewer}</span>
                  </div>
                </td>
                {/* Actions */}
                <td className="px-4 py-3">
                  <div className={`${flex.row} gap-2`}>
                    <button className={`${flex.row} gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Start Interview
                    </button>
                    <button className={`w-7 h-7 ${flex.rowCenter} rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [job, setJob]               = useState(null)
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [tab, setTab]               = useState('SCHEDULES')
  const [showEdit, setShowEdit]     = useState(false)
  const [showAddCandidate, setShowAddCandidate] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [jobRes, candsRes] = await Promise.all([
          fetch(`/api/jobs/${id}`),
          fetch(`/api/jobs/${id}/candidates`),
        ])
        if (!jobRes.ok) throw new Error('Job not found.')
        setJob(await jobRes.json())

        // Defend against the candidates endpoint failing or returning a
        // non-array shape (e.g. FastAPI's {detail: ...} on a 404). Without
        // this guard the InterviewStatusPanel and CandidatesTable crash with
        // "candidates is not iterable" on first render.
        if (candsRes.ok) {
          const data = await candsRes.json().catch(() => [])
          setCandidates(Array.isArray(data) ? data : [])
        } else {
          setCandidates([])
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  function handleJobSaved(updated) {
    setJob(updated)
    setShowEdit(false)
  }

  function handleCandidateAdded({ candidate, job: updatedJob }) {
    setCandidates(prev => [...prev, candidate])
    setJob(updatedJob)
    setShowAddCandidate(false)
  }

  if (loading) return (
    <div className={page.loading}>
      <p className="text-sm text-neutral-400">Loading…</p>
    </div>
  )

  if (error) return (
    <div className={page.loading}>
      <p className="text-sm text-coral-500">{error}</p>
    </div>
  )

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => navigate('/jobs')}
              className={`${flex.row} gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-2 transition-colors`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
              </svg>
              Back to Jobs
            </button>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">Job Posting</h1>
            <p className="text-sm text-neutral-400 mt-1">Manage your open positions</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAddCandidate(true)}
              className={`${flex.row} gap-2 ${button.primary}`}>
              + Add Candidate
            </button>
        
          </div>
        </div>

        {/* Top panels */}
        <div className="grid grid-cols-3 gap-5 mb-6">
          {/* Job Info */}
          <div className={`col-span-2 ${card.base}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-neutral-800">{job.title}</h2>
                <p className={`text-xs text-neutral-400 mt-0.5 ${flex.row} gap-1`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                  Last Update {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className={`${flex.row} gap-2`}>
                <button onClick={() => setShowEdit(true)}
                  className="text-xs font-medium text-neutral-500 border border-neutral-200 px-3 py-1 rounded-lg hover:bg-neutral-50 transition-colors">
                  Edit
                </button>
                <span className={`text-xs font-bold px-3 py-1 rounded-pill ${STATUS_STYLES[job.status] ?? 'bg-neutral-100 text-neutral-500'}`}>
                  {job.status}
                </span>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-xs font-bold text-neutral-700 mb-1">Description</p>
              <p className="text-xs text-neutral-500 leading-relaxed">{job.description || '—'}</p>
            </div>

            {job.employment_type?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {job.employment_type.map(t => (
                  <span key={t} className={`${badge.base} bg-sky-100 text-sky-600`}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className={`${flex.row} gap-8 text-xs text-neutral-500`}>
              <div>
                <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">Start</span>
                <span className="font-semibold text-neutral-700">{formatDate(job.recruitment_start)}</span>
              </div>
              <div>
                <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">End</span>
                <span className="font-semibold text-neutral-700">{formatDate(job.recruitment_end)}</span>
              </div>
              {job.salary && (
                <div>
                  <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">Salary</span>
                  <span className="font-semibold text-neutral-700">
                    $ {job.salary}{job.salary_type === 'Yearly' ? ' / year' : job.salary_type === 'Hourly' ? ' / hr' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Interview Status */}
          <InterviewStatusPanel candidates={candidates} job={job} />
        </div>

        {/* Candidates section - tabs are now inside CandidatesTable so they
            align in the same row as the search + sort + filter controls. */}
        <div className={card.base}>
          <CandidatesTable candidates={candidates} tab={tab} setTab={setTab} />
        </div>
      </main>

      {showEdit && (
        <JobFormModal initialJob={job} onClose={() => setShowEdit(false)} onSaved={handleJobSaved} />
      )}

      {showAddCandidate && (
        <AddCandidateModal jobId={id} onClose={() => setShowAddCandidate(false)} onAdded={handleCandidateAdded} />
      )}
    </div>
  )
}
