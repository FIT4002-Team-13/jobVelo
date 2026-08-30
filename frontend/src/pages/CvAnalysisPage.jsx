import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/common/Sidebar'
import { api, ApiError } from '../lib/api.js'
import { useToast } from '../components/common/ToastContext.jsx'
import { button, card, modal, page } from '../styles/layout'

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

// ── Fit verdict chip ─────────────────────────────────────────────────────
// Average of the three fit scores mapped to a coloured label, so the
// recruiter gets the takeaway before reading a single bullet.

function FitVerdict({ positionFit }) {
  const values = FIT_METRICS
    .map((m) => positionFit?.[m.key])
    .filter((v) => typeof v === 'number')
  if (values.length === 0) return null

  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const [label, chipClass] =
    avg >= 7.5 ? ['Strong fit',   'bg-mint-50 text-mint-700']
    : avg >= 4.5 ? ['Moderate fit', 'bg-sky-50 text-sky-700']
    :              ['Weak fit',     'bg-coral-50 text-coral-700']

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-xs font-bold ${chipClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden />
      {label}
      <span className="font-semibold opacity-70 tabular-nums">{avg.toFixed(1)}/10</span>
    </span>
  )
}

// ── Insight tabs (Strengths / Improvements / Inconsistencies) ────────────
// One card, one list visible at a time. The three lists together held a
// dozen-plus bullets and dominated the rail; tabs keep the counts visible
// while showing a single list. Pill styling mirrors the Reports panel on
// the candidate detail page so tabs read the same everywhere.

// Per-tab accent colour: mint = what's working, sky = what to grow,
// coral = red flags. The dot carries the colour so list text stays calm.
const INSIGHT_TABS = [
  {
    key: 'strengths',
    label: 'Strengths',
    emptyText: 'No strengths identified.',
    dot: 'bg-mint-500',
    badge: 'bg-mint-100 text-mint-700',
  },
  {
    key: 'improvements',
    label: 'Improvements',
    emptyText: 'No improvement areas identified.',
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'inconsistencies',
    label: 'Inconsistencies',
    emptyText: 'No inconsistencies found.',
    dot: 'bg-coral-500',
    badge: 'bg-coral-100 text-coral-700',
  },
]

function InsightTabs({ strengths = [], improvements = [], inconsistencies = [] }) {
  const [active, setActive] = useState('strengths')
  const itemsByKey = { strengths, improvements, inconsistencies }
  const activeTab = INSIGHT_TABS.find((t) => t.key === active)
  const items = itemsByKey[active]

  return (
    <div className={card.sm}>
      {/* Underline tabs - compact enough for the narrow rail, with the
          count badge always visible so hidden tabs still announce how
          much they hold. */}
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 border-b border-neutral-100">
        {INSIGHT_TABS.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-primary-500 text-neutral-800'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {t.label}
              <span
                className={`rounded-pill px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  isActive ? t.badge : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {itemsByKey[t.key].length}
              </span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="py-5 text-center text-sm italic text-neutral-400">{activeTab?.emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((b, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${activeTab?.dot}`} aria-hidden />
                <p className="font-semibold text-neutral-800">{b.title}</p>
              </div>
              <p className="mt-1 pl-3.5 leading-relaxed text-neutral-500">{b.detail}</p>
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
  // Rationales sit one click away so the list stays scannable: chip +
  // question by default, and the interviewer's "why" note expands per
  // question when wanted.
  const [expanded, setExpanded] = useState(() => new Set())

  function toggleRationale(i) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className={card.sm}>
      <h3 className="mb-4 text-lg font-bold text-neutral-800">Suggested Interview Questions</h3>
      {items.length === 0 ? (
        <p className="py-5 text-center text-sm italic text-neutral-400">{emptyText}</p>
      ) : (
        // Single column of tiles - the card lives in the narrow right rail
        // alongside the insight tabs, so one tile per row keeps the text
        // readable.
        <ul className="grid gap-3">
          {items.map((q, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    QUESTION_CATEGORY_STYLES[q.category] ?? 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {q.category}
                </span>
                {q.rationale && (
                  <button
                    type="button"
                    onClick={() => toggleRationale(i)}
                    className="shrink-0 rounded-pill border border-neutral-200 bg-neutral-0 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary-200 hover:text-primary-600"
                  >
                    {expanded.has(i) ? 'Hide note ▾' : 'Why ask this ▸'}
                  </button>
                )}
              </div>

              <p className="font-semibold leading-relaxed text-neutral-800">
                {q.question}
              </p>

              {q.rationale && expanded.has(i) && (
                <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-700">
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
      <div className={`${card.base} flex items-center justify-center aspect-[1/1.5] text-base text-neutral-400`}>
        No document attached.
      </div>
    )
  }
  return (
    <div className={`${card.flat} overflow-hidden`}>
      <div className="px-4 py-2 border-b border-neutral-100 text-sm font-medium text-neutral-500">
        {label}
      </div>

      <div className="w-full aspect-[1/1.5] bg-neutral-50">
        <iframe
          title={label}
          src={`/api/files/${src}#toolbar=1&view=FitH`}
          className="w-full h-full bg-neutral-50"
        />
      </div>
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
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className={`${button.danger} px-5 py-2.5 disabled:opacity-60`}
              title="Delete this analysis and its stored PDFs (lets you upload a new CV)"
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
