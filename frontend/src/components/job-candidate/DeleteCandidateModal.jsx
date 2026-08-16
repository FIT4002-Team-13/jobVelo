import { useState } from 'react'
import { modal, button } from '../../styles/layout'
import { authedFetch } from '../../lib/api'

/**
 * Confirmation dialog for removing a candidate from a job.
 *
 * Visual style mirrors the inline DeleteConfirmModal in JobsPage.jsx so
 * destructive actions look identical across the app:
 *   - small (max-w-sm) centered panel
 *   - coral-tinted trash icon at the top
 *   - bold short title + neutral explainer underneath
 *   - "Cancel" (outline) + "Delete" (solid coral) buttons side-by-side
 *
 * Props:
 *   candidate - the row being removed (we only read `name` + `id`)
 *   jobId     - id of the job the link belongs to (used for the DELETE URL)
 *   onClose   - close without deleting (Cancel button + overlay click)
 *   onDeleted - called with the deleted candidate's `id` on success; the
 *               parent is responsible for removing the row from its list
 */
export default function DeleteCandidateModal({ candidate, jobId, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await authedFetch(`/api/jobs/${jobId}/candidates/${candidate.id}`, {
        method: 'DELETE',
      })
      // 204 No Content is the success case; anything else is an error we surface.
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Failed to remove candidate.')
      }
      onDeleted(candidate.id)
    } catch (err) {
      setError(err.message || 'Failed to remove candidate.')
      setDeleting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className="bg-neutral-0 rounded-2xl w-full max-w-sm shadow-xl p-6">
        {/* Coral-tinted trash icon - same chrome as DeleteConfirmModal in JobsPage. */}
        <div className="flex items-center justify-center w-12 h-12 rounded-pill bg-coral-100 mx-auto mb-4">
          <svg
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" className="text-coral-500"
          >
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>

        <h2 className="text-base font-bold text-neutral-800 text-center mb-1">
          Remove Candidate
        </h2>
        <p className="text-sm text-neutral-500 text-center mb-6">
          Are you sure you want to remove{' '}
          <span className="font-semibold text-neutral-700">
            &quot;{candidate?.name || 'this candidate'}&quot;
          </span>{' '}
          from this job?
        </p>

        {error && <p className="text-xs text-coral-500 text-center mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className={`flex-1 py-2 ${button.cancel} disabled:opacity-60`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className={`flex-1 py-2 ${button.danger}`}
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
