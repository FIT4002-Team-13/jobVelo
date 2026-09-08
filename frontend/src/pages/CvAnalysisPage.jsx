import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { api, ApiError } from '../lib/api.js'
import { useToast } from '../components/common/ToastContext.jsx'
import { button, card, modal, page } from '../styles/layout'
import ScoreBar from '../components/common/ScoreBar.jsx'
import FitVerdict, { FIT_METRICS } from '../components/candidate/FitVerdict.jsx'
import InsightTabs from '../components/candidate/InsightTabs.jsx'
import QuestionCard from '../components/candidate/QuestionCard.jsx'
import PdfPreview from '../components/candidate/PdfPreview.jsx'

// ── Page ─────────────────────────────────────────────────────────────────

// Full-page interstitial used for the loading / processing / error branches
// so they share the sidebar + centring instead of five bespoke layouts.
function StatusShell({ children }) {
  return (
    <div className={page.shell}>
      <Sidebar />
      <main className={`${page.main} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-3 text-center">{children}</div>
      </main>
    </div>
  )
}

export default function CvAnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { jobcandId } = useParams()

  // Seed from navigation state when the candidate page hands us the record
  // (instant render, no flash), then refresh from the API so deep links and
  // page refreshes work identically.
  const [analysis, setAnalysis] = useState(() => {
    const seeded = location.state?.analysis
    return seeded?.jobcand_id === jobcandId ? seeded : null
  })
  const [loadError, setLoadError] = useState(null)

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    let timer = null

    async function fetchAnalysis() {
      try {
        const data = await api.getCvAnalysisByJobcand(jobcandId)
        if (cancelled) return
        setAnalysis(data)
        setLoadError(null)
        // Landed here while the background analysis is still running -
        // keep polling so the report appears the moment it completes.
        if (data?.status === 'processing') {
          timer = setTimeout(fetchAnalysis, 4000)
        }
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? 'No CV analysis exists for this application yet. Upload a CV from the candidate page.'
            : err.message || 'Failed to load the analysis.'
        )
      }
    }

    fetchAnalysis()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobcandId])

  if (loadError) {
    return (
      <StatusShell>
        <p className="text-sm text-coral-500">{loadError}</p>
        <button type="button" onClick={() => navigate(-1)} className={button.primary}>
          Back
        </button>
      </StatusShell>
    )
  }

  if (!analysis) {
    return (
      <StatusShell>
        <p className="text-sm text-neutral-400">Loading…</p>
      </StatusShell>
    )
  }

  if (analysis.status === 'processing') {
    return (
      <StatusShell>
        <svg
          className="h-8 w-8 animate-spin text-primary-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.2-8.56" />
        </svg>
        <p className="text-base font-semibold text-neutral-700">Analysing the CV…</p>
        <p className="text-sm text-neutral-400">
          This usually takes under a minute. The page updates automatically.
        </p>
      </StatusShell>
    )
  }

  if (analysis.status === 'failed') {
    return (
      <StatusShell>
        <p className="text-base font-semibold text-coral-500">CV analysis failed.</p>
        {analysis.error && <p className="max-w-md text-sm text-neutral-500">{analysis.error}</p>}
        <p className="text-sm text-neutral-400">
          Re-upload the CV from the candidate page (Edit) to retry.
        </p>
        <button type="button" onClick={() => navigate(-1)} className={button.primary}>
          Back
        </button>
      </StatusShell>
    )
  }

  const {
    analysis_id,
    candidate_name,
    position_title,
    position_fit,
    key_strengths       = [],
    improvements        = [],
    inconsistencies     = [],
    interview_questions = [],
    cv_path,
  } = analysis

  // Delete drops the record AND the stored PDFs (the server also clears
  // the candidate profile's links to those files, so no dead "View"/"PDF"
  // buttons linger). Confirmed via the same styled modal every other
  // destructive action in the app uses - window.confirm looked jarringly
  // out of place. On success, go back to wherever the user came from.
  async function confirmDelete() {
    if (!analysis_id) {
      setShowDeleteConfirm(false)
      setDeleteError('This analysis cannot be deleted (no id).')
      return
    }
    setDeleteError(null)
    setDeleting(true)
    try {
      await api.deleteCvAnalysis(analysis_id)
      toast.success('CV analysis and stored PDFs deleted.')
      navigate(-1)
    } catch (err) {
      setShowDeleteConfirm(false)
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete analysis.')
      setDeleting(false)
    }
  }

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        {/* Header strip: title + candidate identity + Back button. H1 matches
            the textRole.h1 scale used elsewhere (text-4xl, extrabold); the
            sub-line uses textRole.body so candidate name + position read at
            the same weight as the analysis bullets below. */}
        <div className="flex items-start justify-between mb-6">
          <div>
            {/* Back chip above the title - matches the JobDetail / Candidate
                detail pages so the back action reads the same everywhere. */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={deleting}
              className="flex items-center gap-2 mb-3 rounded-lg border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-sm font-semibold text-neutral-600 transition-colors hover:border-primary-200 hover:bg-primary-500/10 hover:text-primary-600 disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              Candidate CV/Resume
            </h1>
            <p className="text-base text-neutral-700 mt-1">
              <span className="font-bold">{candidate_name || 'Candidate Name'}</span>
              <span className="ml-3 text-neutral-500 font-medium">{position_title}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className={`${button.danger} px-5 py-2.5 disabled:opacity-60`}
            title="Delete this analysis and its stored PDFs (lets you upload a new CV)"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {/* Delete errors live up here at the page level (not inside a card)
            so they don't shove the layout when they appear/disappear. */}
        {deleteError && (
          <p className="text-sm text-coral-500 mb-4">{deleteError}</p>
        )}

        {/* Two-column body: PDF preview (2/3) + analysis cards (1/3) */}
        <div className="grid grid-cols-3 gap-5 items-start">
          <div className="col-span-2">
            <PdfPreview src={cv_path} label="CV / Resume" />
          </div>

          <div className="flex flex-col gap-4">
            {/* Position Fit Summary - verdict chip first, bars as detail */}
            <div className={card.sm}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-neutral-800">Position Fit Summary</h3>
                <FitVerdict positionFit={position_fit} />
              </div>
              <div className="flex flex-col gap-3">
                {FIT_METRICS.map((m) => (
                  <ScoreBar
                    key={m.key}
                    label={m.label}
                    value={position_fit?.[m.key]}
                    barClass={m.bar}
                    variant="block"
                  />
                ))}
              </div>
            </div>

            <InsightTabs
              strengths={key_strengths}
              improvements={improvements}
              inconsistencies={inconsistencies}
            />

            <QuestionCard
              items={interview_questions}
              emptyText="No interview questions suggested."
            />
          </div>
        </div>
      </main>

      {/* Delete confirmation - same chrome as the other destructive modals
          (DeleteCandidateModal / JobsPage's DeleteConfirmModal) so the
          action reads identically across the app. */}
      {showDeleteConfirm && (
        <div className={modal.overlay}>
          <div className="bg-neutral-0 rounded-2xl w-full max-w-sm shadow-xl p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-pill bg-coral-100 mx-auto mb-4">
              <svg
                width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" className="text-coral-500"
              >
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-neutral-800 text-center mb-1">
              Delete CV Analysis
            </h2>
            <p className="text-sm text-neutral-500 text-center mb-6">
              This removes the analysis report <span className="font-semibold text-neutral-700">and the stored CV / cover-letter PDFs</span>.
              The candidate stays on the job — you can upload a new CV from
              the candidate page afterwards.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className={`flex-1 py-2 ${button.cancel} disabled:opacity-60`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className={`flex-1 py-2 ${button.danger}`}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
