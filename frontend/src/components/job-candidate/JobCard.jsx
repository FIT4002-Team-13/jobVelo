import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../common/Avatar'
import { JOB_STATUS_STYLES, FALLBACK_STATUS_CLASS } from '../../utils/status.js'

const EMPTY_TEXT = 'text-neutral-400 italic'

function EmptyAvatar() {
  return (
    <div
      title="No interviewer assigned"
      aria-label="No interviewer assigned"
      className="w-7 h-7 rounded-pill border-2 border-dashed border-neutral-300 -ml-2 first:ml-0"
    />
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

export default function JobCard({ job, onEdit, onDelete }) {
  const navigate = useNavigate()

  const visibleAvatars = job.interviewers?.slice(0, 3) ?? []
  const overflow = (job.interviewers?.length ?? 0) - visibleAvatars.length

  const status      = job.display_status ?? job.status ?? null
  const description = job.description?.trim()
  const interviewers = job.interviewers?.length ?? 0
  const filled      = job.candidates_filled ?? 0
  const total       = job.candidates_total  ?? 0

  return (
    <div onClick={() => navigate(`/jobs/${job.id}`)}
      className="bg-neutral-0 border border-neutral-300 rounded-2xl p-5 flex flex-col gap-2 hover:shadow-md transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-base font-bold leading-snug flex-1 ${job.title ? 'text-neutral-800' : EMPTY_TEXT}`}>
          {job.title || 'Untitled role'}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold px-3 py-1 rounded-pill whitespace-nowrap ${
            status ? (JOB_STATUS_STYLES[status] ?? FALLBACK_STATUS_CLASS) : 'bg-neutral-100 text-neutral-400'
          }`}>
            {status || '—'}
          </span>
          <CardMenu onEdit={() => onEdit(job)} onDelete={() => onDelete(job)} />
        </div>
      </div>

      <p className={`text-xs leading-relaxed line-clamp-2 min-h-[2.5rem] ${description ? 'text-neutral-500' : EMPTY_TEXT}`}>
        {description || 'No description provided.'}
      </p>

      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span className={interviewers > 0 ? 'font-semibold text-neutral-700' : 'font-semibold text-neutral-400'}>
          {interviewers}
        </span>
        interviewers
      </div>

      <div className="flex items-center">
        {visibleAvatars.length > 0 ? (
          <>
            {visibleAvatars.map((name, i) => (
              <Avatar key={i} name={name} size="sm" className="border-2 border-neutral-0 -ml-2 first:ml-0" />
            ))}
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
