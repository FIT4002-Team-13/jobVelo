import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, X, CheckCircle2 } from 'lucide-react'
import Sidebar from '../components/common/Sidebar'
import { api, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { button, card, form, page } from '../styles/layout'

// 8 MB cap on each PDF. Gemini's free-tier limits + our own bandwidth
// budget make this a reasonable line; if you need bigger CVs later, also
// bump the FastAPI side (no explicit cap there today but watch memory).
const MAX_PDF_BYTES = 8 * 1024 * 1024

// ── DropZone ──────────────────────────────────────────────────────────────
// Single-file picker that doubles as a drag-target. Used for both CV and
// cover letter. Parent owns the File state; this component only collects.

function DropZone({ label, file, onPick, required = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  function handleFile(f) {
    setError(null)
    if (!f) return
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are accepted.')
      return
    }
    if (f.size > MAX_PDF_BYTES) {
      setError(`File is too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`)
      return
    }
    onPick(f)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div>
      <label className={form.label}>
        {label} {required && <span className="text-coral-500">*</span>}
      </label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
          dragging
            ? 'border-primary-400 bg-primary-500/5'
            : file
              ? 'border-primary-200 bg-primary-500/5'
              : 'border-neutral-300 bg-neutral-50 hover:border-primary-300 hover:bg-primary-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {file ? (
          <div className="flex items-center gap-3 w-full justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={18} className="text-primary-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-800 truncate">{file.name}</p>
                <p className="text-xs text-neutral-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPick(null) }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud size={28} className="text-primary-500" />
            <p className="text-sm font-semibold text-neutral-700">
              Drag &amp; drop or <span className="text-primary-600">click to browse</span>
            </p>
            <p className="text-xs text-neutral-400">PDF only · max {MAX_PDF_BYTES / 1024 / 1024} MB</p>
          </>
        )}
      </div>

      {error && <p className={`${form.error} mt-2`}>{error}</p>}
    </div>
  )
}


// ── Page ─────────────────────────────────────────────────────────────────

export default function CvUploadPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Job-candidate links in the user's company - populates the dropdown.
  // Each row already has job_title + cand_full_name + has_analysis flag
  // (joined server-side), so the picker can show useful labels without
  // additional fetches.
  const [links,          setLinks]          = useState([])
  const [linksLoading,   setLinksLoading]   = useState(true)
  const [selectedJobcandId, setSelectedJobcandId] = useState('')

  const [cvFile,     setCvFile]     = useState(null)
  const [coverFile,  setCoverFile]  = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    if (!user?.comp_id) return
    let cancelled = false
    api.listJobCandidates({ comp_id: user.comp_id })
      .then((data) => {
        if (cancelled) return
        setLinks(Array.isArray(data) ? data : [])
      })
      .catch(() => !cancelled && setLinks([]))
      .finally(() => !cancelled && setLinksLoading(false))
    return () => { cancelled = true }
  }, [user?.comp_id])

  const selectedLink = links.find((l) => l.jobcand_id === selectedJobcandId)
  // When the picked link already has a cached analysis, we hide the upload
  // form and show a "View existing" CTA instead - no need to re-upload to
  // see what's there.
  const hasCached = !!selectedLink?.has_analysis

  async function handleViewExisting() {
    if (!selectedLink) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.getCvAnalysisByJobcand(selectedLink.jobcand_id)
      navigate('/cv-analysis/result', { state: { analysis: result } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load existing analysis.')
      setSubmitting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!selectedLink) return setError('Please pick a job-candidate to analyse.')
    if (!cvFile)       return setError('Please attach a CV PDF.')

    const fd = new FormData()
    fd.append('jobcand_id', selectedLink.jobcand_id)
    fd.append('cv', cvFile)
    if (coverFile) fd.append('cover_letter', coverFile)

    setSubmitting(true)
    try {
      const result = await api.analyseCv(fd)
      navigate('/cv-analysis/result', { state: { analysis: result } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to analyse the CV.')
      setSubmitting(false)
    }
  }

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">CV Analyser</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Pick a candidate, upload their CV, and get an AI-generated fit summary, strengths,
              improvement areas, and inconsistencies scored against the job description.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5`}>
            {/* Job-candidate picker. Label shows job title + candidate name
                so the user can disambiguate; (✓) next to a row indicates the
                link already has a cached analysis. */}
            <div>
              <label className={form.label}>Job &middot; Candidate *</label>
              <select
                value={selectedJobcandId}
                onChange={(e) => setSelectedJobcandId(e.target.value)}
                disabled={linksLoading || links.length === 0}
                className={`${form.input} ${links.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">
                  {linksLoading
                    ? 'Loading…'
                    : links.length === 0
                      ? 'No candidates linked to any job yet'
                      : 'Select a job-candidate…'}
                </option>
                {links.map((l) => (
                  <option key={l.jobcand_id} value={l.jobcand_id}>
                    {l.job_title} — {l.cand_full_name}
                    {l.has_analysis ? '  ✓ analysed' : ''}
                  </option>
                ))}
              </select>

              {!linksLoading && links.length === 0 && (
                <p className="text-xs text-coral-500 mt-1">
                  No candidates on any job yet.{' '}
                  <Link to="/jobs" className="font-semibold underline underline-offset-2 hover:text-coral-700">
                    Add a candidate to a job
                  </Link>{' '}
                  before running an analysis.
                </p>
              )}
            </div>

            {/* Cached-analysis path: show a banner + "View existing" CTA
                instead of the upload zones. User can delete the cached
                analysis from the result page if they want to re-run. */}
            {hasCached ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-mint-200 bg-mint-50 px-4 py-3">
                  <CheckCircle2 size={18} className="text-mint-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-mint-700">Analysis already exists for this candidate.</p>
                    <p className="text-xs text-mint-700/80 mt-0.5">
                      Open it below, or delete it from the result page to upload a new CV.
                    </p>
                  </div>
                </div>

                {error && <p className={form.error}>{error}</p>}

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    disabled={submitting}
                    className={`${button.cancel} px-6 py-2`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleViewExisting}
                    disabled={submitting}
                    className={`${button.primary} disabled:opacity-60`}
                  >
                    {submitting ? 'Loading…' : 'View Analysis'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Read-only context strip so the user can see what JD will be
                    used; mirrors the same info from the link's job. */}
                {selectedLink && (
                  <div>
                    <label className={form.label}>
                      Job Description
                      <span className="ml-2 text-[10px] font-medium text-neutral-400 normal-case tracking-normal">
                        (from {selectedLink.job_title})
                      </span>
                    </label>
                    <p className="text-[11px] text-neutral-400">
                      The analyser uses this job&apos;s description as the source of truth for scoring.{' '}
                      <Link
                        to={`/jobs/${selectedLink.job_id}`}
                        className="font-semibold text-primary-600 hover:text-primary-700"
                      >
                        Edit the JD
                      </Link>
                      {' '}on the job detail page if it needs changes first.
                    </p>
                  </div>
                )}

                <DropZone label="CV / Resume" file={cvFile} onPick={setCvFile} required />
                <DropZone label="Cover Letter (optional)" file={coverFile} onPick={setCoverFile} />

                {error && <p className={form.error}>{error}</p>}

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    disabled={submitting}
                    className={`${button.cancel} px-6 py-2`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || links.length === 0}
                    className={`${button.primary} disabled:opacity-60`}
                  >
                    {submitting ? 'Analysing…' : 'Analyse CV'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
