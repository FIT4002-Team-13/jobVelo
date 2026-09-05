import { card, flex } from '../../styles/layout'
import { useAuth } from '../../lib/AuthContext.jsx'
import { CANDIDATE_STATUS_STYLES, FALLBACK_STATUS_CLASS } from '../../utils/status.js'
import { formatDateTime } from '../../utils/format.js'
import { initials as getInitials } from '../../utils/avatar.js'

function CvViewButton({ cvAnalysis, cvUrl, onViewAnalysis, onAnalyse, analysing }) {
  const base =
    'inline-flex min-w-[98px] items-center justify-center gap-1.5 rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors'

  if (cvAnalysis?.status === 'processing') {
    return (
      <button
        type="button"
        disabled
        title="The CV is being analysed - this button unlocks when it's done."
        className={`${base} cursor-wait bg-primary-100 text-primary-500`}
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
      </button>
    )
  }

  if (cvAnalysis?.status === 'failed') {
    const canRetry = Boolean(cvUrl && onAnalyse)
    return (
      <button
        type="button"
        onClick={canRetry ? onAnalyse : undefined}
        disabled={!canRetry || analysing}
        title={
          canRetry
            ? `${cvAnalysis.error ? cvAnalysis.error + ' — ' : ''}Click to retry the analysis.`
            : cvAnalysis.error || 'Analysis failed. Re-upload the CV via Edit to retry.'
        }
        className={`${base} ${
          analysing
            ? 'cursor-wait bg-primary-100 text-primary-500'
            : canRetry
            ? 'bg-coral-100 text-coral-700 hover:bg-coral-200'
            : 'cursor-not-allowed bg-coral-100 text-coral-700'
        }`}
      >
        {analysing ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            Analysing…
          </>
        ) : canRetry ? (
          'Retry'
        ) : (
          'Failed'
        )}
      </button>
    )
  }

  if (cvAnalysis?.status === 'completed') {
    return (
      <button
        type="button"
        onClick={onViewAnalysis}
        className={`${base} bg-primary-500 text-white hover:bg-primary-600`}
      >
        View
      </button>
    )
  }

  if (cvUrl) {
    return (
      <button
        type="button"
        onClick={onAnalyse}
        disabled={analysing || !onAnalyse}
        title="Analyse the candidate's CV against this job"
        className={`${base} ${
          analysing
            ? 'cursor-wait bg-primary-100 text-primary-500'
            : 'bg-primary-500 text-white hover:bg-primary-600'
        }`}
      >
        {analysing ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            Analysing…
          </>
        ) : (
          'Analyse CV'
        )}
      </button>
    )
  }

  return (
    <span className={`${base} cursor-not-allowed bg-neutral-300 text-neutral-500`}>
      View
    </span>
  )
}

export default function CandidateInfoCard({
  candidate, job, interview, onStartInterview, interviewer,
  onEdit, cvAnalysis, onViewCvAnalysis, onAnalyseCv, analysingCv,
}) {
  const { user } = useAuth()
  const status = (interview?.intv_status ?? 'not_scheduled').replace(/_/g, ' ').toUpperCase()
  const canStartInterview = status === 'SCHEDULED' && user?.role === 'interviewer'
  const startLabel = status === 'IN PROGRESS' ? 'Resume Interview' : 'Start Interview'
  const statusClass = CANDIDATE_STATUS_STYLES[status] ?? FALLBACK_STATUS_CLASS

  return (
    <section className={`${card.base} ${flex.col} h-full`}>
      <div className={flex.rowBetween}>
        <div className="mb-3">
          <h2 className="text-2xl font-bold text-neutral-800">
            {candidate?.cand_full_name || '--'}
          </h2>
          <p className={`text-sm text-neutral-400 mt-0.5 ${flex.row} gap-1`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            Last Update{' '}
            {candidate?.cand_updated_at
              ? new Date(candidate.cand_updated_at).toLocaleDateString('en-AU', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '--'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canStartInterview && (
            <button
              type="button"
              onClick={onStartInterview}
              className="inline-flex items-center gap-1.5 rounded-pill bg-primary-500 px-4 py-0.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {startLabel}
            </button>
          )}

          <button
            type="button"
            disabled={status === 'COMPLETED' || status === 'CANCELLED'}
            onClick={onEdit}
            title={
              status === 'COMPLETED' || status === 'CANCELLED'
                ? 'This interview is finished - the application can no longer be edited.'
                : undefined
            }
            className={`rounded-pill border px-4 py-0.5 text-sm font-semibold ${
              status === 'COMPLETED' || status === 'CANCELLED'
                ? 'cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-300'
                : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            Edit
          </button>

          <span className={`rounded-pill px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[3fr_4fr] gap-x-16 gap-y-5">
        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">ROLE</p>
          <p className="inline-flex rounded-pill bg-primary-100 px-4 py-0.5 text-sm font-semibold text-primary-500">
            {job?.title || '--'}
          </p>
        </div>
        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">DATE</p>
          <p className="text-sm font-medium text-neutral-400">
            {formatDateTime(interview?.intv_date_time)}
          </p>
        </div>
        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">EMAIL</p>
          <p className="text-md font-medium text-neutral-400">
            {candidate?.cand_email || '--'}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-800">PHONE</p>
          <p className="text-md font-medium text-neutral-400">
            {candidate?.cand_phone || '--'}
          </p>
        </div>
      </div>

      <div className="mt-6 h-px w-[48%] bg-neutral-200" />

      <div className="mt-6 grid grid-cols-3 gap-x-10">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-800">INTERVIEWER</p>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-primary-500 text-xs font-bold text-white">
              {getInitials(interviewer)}
            </div>
            <span className="text-sm font-medium text-neutral-800">
              {interviewer || '--'}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">CV / RESUME</p>
          <CvViewButton
            cvAnalysis={cvAnalysis}
            cvUrl={candidate?.cand_cv_url}
            onViewAnalysis={onViewCvAnalysis}
            onAnalyse={onAnalyseCv}
            analysing={analysingCv}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">COVER LETTER</p>
          <a
            href={candidate?.cand_cover_letter_url || '#'}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-w-[98px] justify-center rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${
              candidate?.cand_cover_letter_url
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
            }`}
            onClick={(e) => {
              if (!candidate?.cand_cover_letter_url) e.preventDefault()
            }}
          >
            View
          </a>
        </div>
      </div>
    </section>
  )
}
