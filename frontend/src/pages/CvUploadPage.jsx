import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, X } from 'lucide-react'
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

  // Jobs in the user's company - populates the dropdown. Loaded once on
  // mount; we don't need filtering/pagination here, just the picker list.
  const [jobs,         setJobs]         = useState([])
  const [jobsLoading,  setJobsLoading]  = useState(true)
  // selectedJobId is "" until the user picks; we derive position + JD from
  // the chosen job at submit time so we never let the form drift out of
  // sync with the dropdown.
  const [selectedJobId, setSelectedJobId] = useState('')

  const [cvFile, setCvFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.comp_id) return
    let cancelled = false
    api.listJobs({ comp_id: user.comp_id })
      .then((data) => {
        if (cancelled) return
        // Defensive: API should return an array but a 404 / malformed
        // response would crash the .map below if we don't guard here.
        setJobs(Array.isArray(data) ? data : [])
      })
      .catch(() => !cancelled && setJobs([]))
      .finally(() => !cancelled && setJobsLoading(false))
    return () => { cancelled = true }
  }, [user?.comp_id])

  const selectedJob = jobs.find((j) => (j.id ?? j._id) === selectedJobId)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!selectedJob) return setError('Please pick a job to analyse against.')
    if (!cvFile)      return setError('Please attach a CV PDF.')

    const fd = new FormData()
    fd.append('cv', cvFile)
    // Position title + JD are sourced from the picked job - no manual
    // input - so the analyser is always scoring against an actual posting
    // that exists in the database.
    fd.append('position_title', selectedJob.title || '')
    if (selectedJob.description?.trim()) {
      fd.append('job_description', selectedJob.description.trim())
    }
    if (coverFile) fd.append('cover_letter', coverFile)

    setSubmitting(true)
    try {
      const result = await api.analyseCv(fd)
      // We pass the analysis through navigation state so the result page
      // can render without re-fetching. The analysis itself isn't persisted
      // server-side yet - if you refresh on the result page, you'll need
      // to re-upload. Add persistence when the team needs share-able links.
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
              Pick a job from your company&apos;s postings, upload the candidate&apos;s CV
              (and optional cover letter), and get an AI-generated fit summary,
              strengths, improvement areas, and inconsistencies.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5`}>
            {/* Job picker - replaces the old "Target Position" + "Job Description"
                manual inputs. Description auto-populates from the selection.   */}
            <div>
              <label className={form.label}>Job *</label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                disabled={jobsLoading || jobs.length === 0}
                className={`${form.input} ${jobs.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">
                  {jobsLoading
                    ? 'Loading jobs…'
                    : jobs.length === 0
                      ? 'No jobs available'
                      : 'Select a job…'}
                </option>
                {jobs.map((j) => (
                  <option key={j.id ?? j._id} value={j.id ?? j._id}>
                    {j.title}
                  </option>
                ))}
              </select>

              {/* Helper / empty-state line under the picker. */}
              {!jobsLoading && jobs.length === 0 && (
                <p className="text-xs text-coral-500 mt-1">
                  You don&apos;t have any jobs yet.{' '}
                  <Link to="/jobs" className="font-semibold underline underline-offset-2 hover:text-coral-700">
                    Create one
                  </Link>{' '}
                  before running an analysis.
                </p>
              )}
            </div>

            {/* Read-only JD preview - shows the description tied to the picked
                job so the user knows what the analyser will be scoring against.
                Collapses to a "no description" hint when the job has none. */}
            {selectedJob && (
              <div>
                <label className={form.label}>
                  Job Description
                  <span className="ml-2 text-[10px] font-medium text-neutral-400 normal-case tracking-normal">
                    (from the selected job)
                  </span>
                </label>
                <div className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                  {selectedJob.description?.trim()
                    ? selectedJob.description
                    : <span className="italic text-neutral-400">No description on this job.</span>}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Edit the JD on the{' '}
                  <Link
                    to={`/jobs/${selectedJob.id ?? selectedJob._id}`}
                    className="font-semibold text-primary-600 hover:text-primary-700"
                  >
                    job detail page
                  </Link>
                  {' '}if it needs changes before the analysis.
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
                disabled={submitting || jobs.length === 0}
                className={`${button.primary} disabled:opacity-60`}
              >
                {submitting ? 'Analysing…' : 'Analyse CV'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
