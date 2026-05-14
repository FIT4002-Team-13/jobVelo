import { modal, button } from '../../styles/layout'

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

// "2026-04-07T14:00:00" -> "Apr 7, 2:00 PM"
function formatScheduledAt(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}


// ── Component ────────────────────────────────────────────────────────────────

/**
 * Confirmation dialog shown before kicking off a live interview session.
 *
 * Props:
 *   candidate  - the row clicked in the candidates table (needs name + scheduled_at)
 *   jobTitle   - the role being interviewed for (shown under the name)
 *   onClose    - close without doing anything
 *   onConfirm  - PLACEHOLDER for now: the eventual handler will flip the
 *                job_candidate status to EVALUATED + open the Deepgram
 *                transcription UI. Wire it up when that pipeline lands.
 */
export default function StartInterviewModal({ candidate, jobTitle, onClose, onConfirm }) {
  return (
    <div className={modal.overlay}>
      <div className="relative bg-neutral-0 rounded-2xl w-full max-w-md shadow-xl">
        {/* Header strip */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-base font-bold text-neutral-800">Start Interview Session</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6">
          {/* Identity block */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-pill bg-primary-500 flex items-center justify-center text-white font-bold text-2xl mb-3">
              {initials(candidate?.name)}
            </div>
            <p className="text-lg font-bold text-neutral-800">
              {candidate?.name || 'Unknown candidate'}
            </p>
            {jobTitle && (
              <p className="text-sm text-neutral-500 mt-0.5">{jobTitle}</p>
            )}
            <p className="text-sm font-bold text-neutral-700 mt-2">
              {formatScheduledAt(candidate?.scheduled_at)}
            </p>
          </div>

          {/* Disclaimer banner */}
          <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex gap-3 mb-6">
            <svg
              className="shrink-0 text-primary-500 mt-0.5"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-xs text-primary-700 leading-relaxed">
              Once started, the interview session{' '}
              <strong className="font-bold">cannot be reverted</strong> to Scheduled
              status. The system will request microphone and audio access for live
              transcription.
            </p>
          </div>

          {/* Action buttons - use shared button tokens so primary/cancel pairs
              look identical across every modal in the app. */}
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-2 ${button.cancel}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`flex items-center gap-2 ${button.primary}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
