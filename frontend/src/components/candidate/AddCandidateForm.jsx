import { useEffect, useState } from 'react'
import { modal, form, flex, button } from '../../styles/layout'
import { useAuth } from '../../lib/AuthContext.jsx'
import { api } from '../../lib/api.js'
import { isEmail, isPhone, isFullName, isFutureDateTime } from '../../lib/validators.js'
import InterviewerCombobox from './InterviewerCombobox.jsx'
import FileDropzone from './FileDropzone.jsx'

// `fixedJobId` locks the form to one job (used from the Job Detail page, which
// is already scoped to a single role): the "Assign to Job" picker is hidden and
// that id is used directly. Left null on the Applications page, the picker shows.
export default function AddCandidateForm({ jobs = [], fixedJobId = null, onClose, onSaved }) {
  const { user } = useAuth()

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    job_id: fixedJobId || '',
    interviewer: '',
    interviewer_user_id: '',
    scheduled_at: '',
  })

  const [cvFile, setCvFile] = useState(null)
  const [coverLetterFile, setCoverLetterFile] = useState(null)
  const [interviewers, setInterviewers] = useState([])
  const [interviewerOpen, setInterviewerOpen] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInterviewers() {
      if (!user?.comp_id) return
      try {
        const data = await api.listInterviewers()
        setInterviewers(Array.isArray(data) ? data : [])
      } catch {
        setInterviewers([])
      }
    }
    loadInterviewers()
  }, [user?.comp_id])

  function setField(key, value) {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!formState.name.trim()) {
      return setError('Candidate name is required.')
    }
    if (!isFullName(formState.name)) {
      return setError('Please enter a real name (2-100 characters, includes letters).')
    }
    if (!formState.email.trim()) {
      return setError('Candidate email is required.')
    }
    if (!isEmail(formState.email)) {
      return setError('Please enter a valid email address.')
    }
    if (formState.phone.trim() && !isPhone(formState.phone)) {
      return setError('Phone number looks malformed (digits, +, spaces, dashes only).')
    }
    if (!formState.job_id) {
      return setError('Please select a job position.')
    }
    // (job_id is pre-filled and the picker hidden when fixedJobId is set.)
    if (formState.scheduled_at && !isFutureDateTime(formState.scheduled_at)) {
      return setError('Scheduled date/time must be in the future.')
    }

    setError('')
    setSubmitting(true)

    try {
      let saved
      try {
        saved = await api.createCandidateForJob({
          cand_full_name: formState.name.trim(),
          cand_email: formState.email.trim().toLowerCase(),
          cand_phone: formState.phone.trim() || null,
          // Document URLs are written server-side by the CV-analysis upload
          // below - nothing to send from here.
          cand_cv_url: null,
          cand_cover_letter_url: null,
          comp_id: user.comp_id,
          job_id: formState.job_id,
          interviewer_user_id: formState.interviewer_user_id || null,
          scheduled_at: formState.scheduled_at || null,
        })
      } catch (err) {
        const detail = err?.detail
        throw new Error(
          Array.isArray(detail)
            ? detail.map((d) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join(' • ')
            : err?.message || 'Failed to add candidate.'
        )
      }

      // Candidate added with a CV → hand it to the analyser right away
      // (the cover letter rides along). The POST returns as soon as the
      // upload is stored (status=processing); the candidate page polls for
      // completion. A cover letter WITHOUT a CV can't be analysed, so it
      // goes through the standalone document upload instead. Failures here
      // are non-fatal - the candidate exists, and the files can be
      // re-uploaded from the Edit form.
      const jobcandId = saved.job_candidate?.jobcand_id
      const candId = saved.candidate?.cand_id
      try {
        if (cvFile && jobcandId) {
          const fd = new FormData()
          fd.append('jobcand_id', jobcandId)
          fd.append('cv', cvFile)
          if (coverLetterFile) fd.append('cover_letter', coverLetterFile)
          await api.analyseCv(fd)
        } else if (coverLetterFile && candId) {
          const fd = new FormData()
          fd.append('cover_letter', coverLetterFile)
          await api.uploadCandidateCoverLetter(candId, fd)
        }
      } catch (err) {
        console.warn('Document upload failed:', err)
      }

      onSaved(saved.candidate ?? saved)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} scrollbar-primary max-w-2xl max-h-[90vh] overflow-y-auto transition-[padding] ${interviewerOpen ? 'pb-52' : ''}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none"
        >
          ×
        </button>

        <h2 className="text-xl font-bold text-neutral-800 mb-1">Add Candidate</h2>
        <p className="text-xs text-neutral-400 mb-5">Required fields are indicated with a asterisk *</p>

        <form onSubmit={handleSubmit} className={`${flex.col} gap-4`}>
          <div>
            <label className={form.label}>Name *</label>
            <input
              value={formState.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="eg. John Doe"
              className={form.input}
            />
          </div>

          <div>
            <label className={form.label}>Email *</label>
            <input
              value={formState.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="eg. johndoe123@gmail.com"
              className={form.input}
            />
          </div>

          {fixedJobId ? (
            <div>
              <label className={form.label}>Phone *</label>
              <input
                value={formState.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="04XXXXXXXX"
                className={form.input}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={form.label}>Phone *</label>
                <input
                  value={formState.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder="04XXXXXXXX"
                  className={form.input}
                />
              </div>

              <div>
                <label className={form.label}>Assign to Job *</label>
                <select
                  value={formState.job_id}
                  onChange={(e) => setField('job_id', e.target.value)}
                  className={form.input}
                >
                  <option value="">Select a existing job position</option>
                  {jobs
                    .filter((job) => (job.candidates_filled ?? 0) < (job.candidates_total ?? 1))
                    .map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FileDropzone
              label="Resume / CV"
              file={cvFile}
              onFileChange={setCvFile}
              onRemove={() => setCvFile(null)}
            />

            <FileDropzone
              label="Cover Letter"
              file={coverLetterFile}
              onFileChange={setCoverLetterFile}
              onRemove={() => setCoverLetterFile(null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={form.label}>Interviewer</label>
              <InterviewerCombobox
                value={{
                  label: formState.interviewer,
                  userId: formState.interviewer_user_id,
                }}
                onChange={({ label, userId }) => {
                  setField('interviewer', label)
                  setField('interviewer_user_id', userId)
                }}
                options={interviewers}
                onOpenChange={setInterviewerOpen}
              />
            </div>

            <div>
              <label className={form.label}>Interview Date</label>
              <input
                type="datetime-local"
                value={formState.scheduled_at}
                onChange={(e) => setField('scheduled_at', e.target.value)}
                className={form.input}
              />
            </div>
          </div>

          {error && <p className={form.error}>{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`${button.cancel} px-6 py-2`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className={`${button.primary} disabled:opacity-60`}
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}