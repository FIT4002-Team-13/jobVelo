import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, X } from 'lucide-react'
import Sidebar from '../components/common/Sidebar'
import { api, ApiError } from '../lib/api.js'
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

// Backend caps the JD at 10,000 chars - matches Form(max_length=10_000) on
// the route. Anything longer probably isn't a JD anyway.
const JD_MAX = 10_000

export default function CvUploadPage() {
  const navigate = useNavigate()
  const [cvFile, setCvFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [position, setPosition] = useState('')
  // Optional. When supplied, the Gemini prompt grounds every score and
  // bullet in this text instead of falling back to position_title alone.
  const [jobDescription, setJobDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!cvFile) return setError('Please attach a CV PDF.')
    if (!position.trim()) return setError('Please enter the target position.')
    if (jobDescription.length > JD_MAX) {
      return setError(`Job description is too long (max ${JD_MAX} characters).`)
    }

    const fd = new FormData()
    fd.append('cv', cvFile)
    fd.append('position_title', position.trim())
    if (coverFile) fd.append('cover_letter', coverFile)
    if (jobDescription.trim()) fd.append('job_description', jobDescription.trim())

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
              Upload a candidate&apos;s CV (and optional cover letter) to get an AI-generated
              fit summary, strengths, improvement areas, and inconsistencies.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5`}>
            <div>
              <label className={form.label}>Target Position *</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="eg. Front End Developer"
                maxLength={120}
                className={form.input}
              />
            </div>

            <div>
              <label className={form.label}>
                Job Description
                <span className="ml-2 text-[10px] font-medium text-neutral-400 normal-case tracking-normal">
                  (recommended)
                </span>
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full JD here - responsibilities, required skills, years of experience, soft-skill expectations. The analyser uses this as the source of truth for every score and bullet."
                rows={6}
                maxLength={JD_MAX}
                className={`${form.input} resize-y leading-relaxed`}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-neutral-400">
                  When omitted, the analyser falls back to scoring against the position title alone.
                </p>
                <p className={`text-[11px] tabular-nums ${
                  jobDescription.length > JD_MAX * 0.95 ? 'text-coral-500' : 'text-neutral-400'
                }`}>
                  {jobDescription.length.toLocaleString()} / {JD_MAX.toLocaleString()}
                </p>
              </div>
            </div>

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
                disabled={submitting}
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
