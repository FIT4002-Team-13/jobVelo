import { useState } from 'react'
import { authedFetch } from '../../lib/api.js'
import { modal, button } from '../../styles/layout'

export default function DeleteJobModal({ job, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await authedFetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
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
          Are you sure you want to delete <span className="font-semibold text-neutral-700">&quot;{job.title}&quot;</span>? This cannot be undone.
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
