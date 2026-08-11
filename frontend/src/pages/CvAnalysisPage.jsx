import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { api, ApiError } from '../lib/api.js'
import { button, card, page } from '../styles/layout'

// Match the score-bar colour to the metric so the legend is implicit.
// Coral = experience, primary = technical, mint = soft — same vibe as the
// dashboard summary cards.
const FIT_METRICS = [
  { key: 'relevant_experience', label: 'Relevant Experience', bar: 'bg-coral-500'   },
  { key: 'technical_fit',       label: 'Technical Fit',       bar: 'bg-primary-500' },
  { key: 'soft_skills',         label: 'Soft Skills',         bar: 'bg-mint-500'    },
]

// ── Score bar (Position Fit summary panel) ───────────────────────────────

// Type sizing across this page lines up with the textRole tokens in
// styles/typography.js:
//   - card title         → lg   (textRole.bodyLg / heading weight)
//   - bullet title/detail→ sm   (textRole.bodySm)
//   - score-bar label    → sm   (textRole.bodySm)
//   - score-bar value    → base (textRole.body, bold for emphasis)
//   - empty / hint text  → sm   (textRole.bodySm)

function ScoreBar({ label, value, barClass }) {
  // Backend gives us a 0-10 score; render the full track and let the fill
  // length encode it. `value ?? 0` guards against the LLM dropping a key.
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / 10) * 100))
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-base font-bold text-neutral-700 tabular-nums">
        {(value ?? 0).toFixed(1)}
      </span>
      <div className="col-span-2 h-2 rounded-pill bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-pill ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Bullet card (Strengths / Improvements / Inconsistencies) ─────────────

function BulletCard({ title, items, emptyText }) {
  return (
    <div className={`${card.sm}`}>
      <h3 className="text-lg font-bold text-neutral-800 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 italic">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((b, i) => (
            <li key={i} className="text-sm">
              <p className="font-semibold text-neutral-700">• {b.title}</p>
              <p className="text-neutral-500 leading-relaxed pl-3 mt-0.5">{b.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Question card (Suggested Interview Questions) ────────────────────────
// Different shape from BulletCard (category chip + question + rationale)
// so it's a dedicated component rather than shoehorning it into the
// title/detail layout.

// Category → chip colour, kept in the same family as the status pill palette
// used elsewhere. Any unknown category falls back to neutral.
const QUESTION_CATEGORY_STYLES = {
  technical:  'bg-primary-100 text-primary-600',
  behavioral: 'bg-mint-100 text-mint-700',
  experience: 'bg-coral-100 text-coral-700',
}

function QuestionCard({ items, emptyText }) {
  return (
    <div className={`${card.sm}`}>
      <h3 className="text-lg font-bold text-neutral-800 mb-3">Suggested Interview Questions</h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 italic">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((q, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-start gap-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-pill shrink-0 mt-0.5 ${
                    QUESTION_CATEGORY_STYLES[q.category] ?? 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {q.category}
                </span>
                <p className="font-semibold text-neutral-700 leading-relaxed">
                  {q.question}
                </p>
              </div>
              {q.rationale && (
                <p className="text-neutral-500 leading-relaxed pl-3 mt-1 italic">
                  {q.rationale}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── PDF preview ──────────────────────────────────────────────────────────
// Uses the browser's built-in PDF viewer via <iframe>. Good enough for an
// MVP; if the team wants paging + zoom controls matching the mockup,
// swap for react-pdf later. The file is served by /api/files which already
// streams from backend/uploads.

function PdfPreview({ src, label }) {
  if (!src) {
    return (
      <div className={`${card.base} flex items-center justify-center h-[600px] text-base text-neutral-400`}>
        No document attached.
      </div>
    )
  }
  return (
    <div className={`${card.flat} overflow-hidden`}>
      <div className="px-4 py-2 border-b border-neutral-100 text-sm font-medium text-neutral-500">
        {label}
      </div>
      <iframe
        title={label}
        src={`/api/files/${src}#toolbar=1`}
        className="w-full h-[600px] bg-neutral-50"
      />
    </div>
  )
}

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

  // Delete drops the record so the user can upload a different CV for the
  // same job-candidate (via the candidate page's Edit form). We confirm via
  // window.confirm to keep this inline (the destructive action is narrow
  // and rare; no need for a full modal here). On success, go back to
  // wherever the user came from - usually the candidate page.
  async function handleDelete() {
    if (!analysis_id) {
      setDeleteError('This analysis cannot be deleted (no id).')
      return
    }
    const ok = window.confirm(
      'Delete this analysis?\n\nThe job-candidate link is kept - you can upload a different CV ' +
      'from the candidate page (Edit) right after.'
    )
    if (!ok) return

    setDeleteError(null)
    setDeleting(true)
    try {
      await api.deleteCvAnalysis(analysis_id)
      navigate(-1)
    } catch (err) {
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
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              Candidate CV/Resume
            </h1>
            <p className="text-base text-neutral-700 mt-1">
              <span className="font-bold">{candidate_name || 'Candidate Name'}</span>
              <span className="ml-3 text-neutral-500 font-medium">{position_title}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Delete first - destructive action sits LEFT of the primary so
                people don't muscle-memory click through it. */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={`${button.danger} px-5 py-2.5 disabled:opacity-60`}
              title="Delete this analysis (lets you upload a new CV)"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={deleting}
              className={`${button.primary} disabled:opacity-60`}
            >
              Back
            </button>
          </div>
        </div>

        {/* Delete errors live up here at the page level (not inside a card)
            so they don't shove the layout when they appear/disappear. */}
        {deleteError && (
          <p className="text-sm text-coral-500 mb-4">{deleteError}</p>
        )}

        {/* Two-column body: PDF preview (2/3) + analysis cards (1/3) */}
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2">
            <PdfPreview src={cv_path} label="CV / Resume" />
          </div>

          <div className="flex flex-col gap-4">
            {/* Position Fit Summary */}
            <div className={card.sm}>
              <h3 className="text-lg font-bold text-neutral-800 mb-3">Position Fit Summary</h3>
              <div className="flex flex-col gap-3">
                {FIT_METRICS.map((m) => (
                  <ScoreBar
                    key={m.key}
                    label={m.label}
                    value={position_fit?.[m.key]}
                    barClass={m.bar}
                  />
                ))}
              </div>
            </div>

            <BulletCard
              title="Key Strengths"
              items={key_strengths}
              emptyText="No strengths identified."
            />

            <BulletCard
              title="Improvements"
              items={improvements}
              emptyText="No improvement areas identified."
            />

            <BulletCard
              title="Inconsistencies"
              items={inconsistencies}
              emptyText="No inconsistencies found."
            />

            <QuestionCard
              items={interview_questions}
              emptyText="No interview questions suggested."
            />
          </div>
        </div>
      </main>
    </div>
  )
}
