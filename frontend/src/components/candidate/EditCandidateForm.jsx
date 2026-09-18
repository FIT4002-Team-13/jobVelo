import { useEffect, useState } from 'react'
import { modal, form, flex, button } from '../../styles/layout'
import { isEmail, isPhone, isFullName, isFutureDateTime } from '../../lib/validators.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { api } from '../../lib/api.js'
import InterviewerCombobox from './InterviewerCombobox.jsx'

// Turn an ApiError (or any error) into a user-facing message, expanding
// FastAPI's `detail` array into `field: message` bullets when present.
function messageFromError(err, fallback) {
  const detail = err?.detail
  if (Array.isArray(detail)) {
    return detail.map((d) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join(' • ')
  }
  return err?.message || fallback
}

export default function EditCandidateForm({
  jobs = [],
  initialData,
  onClose,
  onSaved,
  noOverlay = false,
}) {
  const { user } = useAuth()

  const initialScheduledAt = initialData?.interview_datetime
    ? initialData.interview_datetime.slice(0, 16)
    : ''

  const [formState, setFormState] = useState({
    cand_id: initialData?.cand_id || '',
    application_id: initialData?.application_id || '',
    name: initialData?.candidate_name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    job_id: initialData?.job_id || '',
    interviewer: initialData?.interviewer || '',
    interviewer_user_id: initialData?.interviewer_user_id || '',
    scheduled_at: initialScheduledAt,
  })

  const [interviewers, setInterviewers] = useState([])
  const [interviewerOpen, setInterviewerOpen] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInterviewers() {
      if (!user?.comp_id || !['recruiter', 'admin'].includes(user?.role)) return
      try {
        const [interviewerRes, hiringManagerRes] = await Promise.all([
          authedFetch('/api/users?role=interviewer'),
          authedFetch('/api/users?role=hiring_manager'),
        ])

        if (!interviewerRes.ok || !hiringManagerRes.ok) throw new Error()

        const interviewerData = await interviewerRes.json()
        const hiringManagerData = await hiringManagerRes.json()

        setInterviewers([
          ...(Array.isArray(interviewerData) ? interviewerData : []),
          ...(Array.isArray(hiringManagerData) ? hiringManagerData : []),
        ])
          } catch {
        setInterviewers([])
      }
    }
    loadInterviewers()
  }, [user?.comp_id, user?.role])

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
    // Only insist on a future date when the user actually CHANGED it. The
    // form pre-fills the existing interview datetime, which is naturally in
    // the past once the interview has happened - failing validation on the
    // untouched value made completed candidates impossible to edit at all.
    const initialScheduledAt = initialData?.interview_datetime
      ? initialData.interview_datetime.slice(0, 16)
      : ''
    if (
      formState.scheduled_at &&
      formState.scheduled_at !== initialScheduledAt &&
      !isFutureDateTime(formState.scheduled_at)
    ) {
      return setError('Scheduled date/time must be in the future.')
    }

    setError('')
    setSubmitting(true)

    try {
      // 1. Update candidate profile. Document URLs are deliberately NOT
      //    sent here - CV/cover letter are uploaded separately (the
      //    candidate page's CV/Cover Letter tabs), and sending null used to
      //    wipe the existing links on every save.
      try {
        await api.updateCandidate(formState.cand_id, {
          cand_full_name: formState.name.trim(),
          cand_email: formState.email.trim().toLowerCase(),
          cand_phone: formState.phone.trim() || null,
        })
      } catch (err) {
        throw new Error(messageFromError(err, 'Failed to update candidate.'))
      }

      // 2. Update application/job/interview side
      let saved
      try {
        saved = await api.updateApplication(formState.application_id, {
          job_id: formState.job_id,
          interviewer_user_id: formState.interviewer_user_id || null,
          scheduled_at: formState.scheduled_at || null,
        })
      } catch (err) {
        throw new Error(messageFromError(err, 'Failed to update application.'))
      }

      onSaved(saved)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const panel = (
    <div className={`${modal.panel} scrollbar-primary max-w-2xl max-h-[90vh] overflow-y-auto transition-[padding] ${interviewerOpen ? 'pb-52' : ''}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none"
        >
          ×
        </button>

        <h2 className="text-xl font-bold text-neutral-800 mb-1">Edit Candidate</h2>
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
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
{/*  */}
          <div className="grid grid-cols-2 gap-4">
            <FileDropzone
              label="Resume / CV"
              existingName={existingCvName}
              file={cvFile}
              onFileChange={(file) => {
                setCvFile(file)
                setExistingCvName('')
              }}
              onRemove={() => {
                setCvFile(null)
                setExistingCvName('')
              }}
            />

            <FileDropzone
              label="Cover Letter"
              existingName={existingCoverLetterName}
              file={coverLetterFile}
              onFileChange={(file) => {
                setCoverLetterFile(file)
                setExistingCoverLetterName('')
              }}
              onRemove={() => {
                setCoverLetterFile(null)
                setExistingCoverLetterName('')
              }}
            />
          </div>
{/*  */}
            {(user?.role === 'recruiter' || user?.role === 'admin') && (            
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
          )}

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
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
  )

  return noOverlay ? panel : <div className={modal.overlay}>{panel}</div>
}
