import { useEffect, useRef, useState } from 'react'
import { modal, form } from '../../styles/layout'
import { useAuth } from '../../lib/AuthContext.jsx'
import { isEmail, isPhone, isFullName, isFutureDateTime } from '../../lib/validators.js'
import InterviewerCombobox from './InterviewerCombobox.jsx'

function FileDropzone({
  label,
  file,
  onFileChange,
  onRemove,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handlePick(fileList) {
    const picked = fileList?.[0]
    if (!picked) return
    onFileChange(picked)
  }

  return (
    <div>
      <label className={form.label}>{label}</label>

      {file ? (
        <div className="flex items-center gap-2 pt-2">
          <span className="text-coral-500 text-base">📄</span>
          <span className="truncate text-sm text-primary-500 underline underline-offset-2">
            {file.name}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 text-base text-neutral-500 hover:text-neutral-800"
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handlePick(e.target.files)}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handlePick(e.dataTransfer.files)
            }}
            className={`flex h-[130px] w-full flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-colors ${
              dragging
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 bg-white'
            }`}
          >
            <p className="text-sm text-neutral-400">
              Drag & drop or click to upload
            </p>
            <p className="text-sm text-neutral-300">.PDF only</p>
          </button>
        </>
      )}
    </div>
  )
}

export default function AddCandidateForm({ jobs = [], onClose, onSaved }) {
  const { user } = useAuth()

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    job_id: '',
    interviewer: '',
    interviewer_user_id: '',
    scheduled_at: '',
  })

  const [cvFile, setCvFile] = useState(null)
  const [coverLetterFile, setCoverLetterFile] = useState(null)
  const [interviewers, setInterviewers] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadInterviewers() {
      if (!user?.comp_id) return
      try {
        const res = await fetch(`/api/users?comp_id=${user.comp_id}&role=interviewer`)
        if (!res.ok) throw new Error()
        const data = await res.json()
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
    if (formState.scheduled_at && !isFutureDateTime(formState.scheduled_at)) {
      return setError('Scheduled date/time must be in the future.')
    }

    setError('')
    setSubmitting(true)

    try {
      // Replace with real upload logic later.
      const cv_url = null
      const cover_letter_url = null

      const res = await fetch(`/api/candidates/create-for-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cand_full_name: formState.name.trim(),
          cand_email: formState.email.trim().toLowerCase(),
          cand_phone: formState.phone.trim() || null,
          cand_cv_url: cv_url,
          cand_cover_letter_url: cover_letter_url,
          comp_id: user.comp_id,
          job_id: formState.job_id,
          interviewer_user_id: formState.interviewer_user_id || null,
          scheduled_at: formState.scheduled_at || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const detail = data?.detail
        const message =
          typeof detail === 'string' ? detail
          : Array.isArray(detail) ? detail.map((d) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join(' • ')
          : 'Failed to add candidate.'
        throw new Error(message)
      }

      const saved = await res.json()
      onSaved(saved.candidate ?? saved)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} max-w-[760px] px-8 py-7`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-5 text-2xl text-neutral-400 hover:text-neutral-700"
        >
          ×
        </button>

        <h2 className="mb-1 text-3xl font-bold text-neutral-800">Add Candidate</h2>
        <p className="mb-5 text-sm text-neutral-500">
          Required field are indicated with asterisk <span className="text-coral-500">*</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={form.label}>NAME <span className="text-coral-500">*</span></label>
            <input
              value={formState.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="eg. John Doe"
              className={`${form.input} h-12`}
            />
          </div>

          <div>
            <label className={form.label}>EMAIL <span className="text-coral-500">*</span></label>
            <input
              value={formState.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="eg. johndoe123@gmail.com"
              className={`${form.input} h-12`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={form.label}>PHONE <span className="text-coral-500">*</span></label>
              <input
                value={formState.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="04XXXXXXXX"
                className={`${form.input} h-12`}
              />
            </div>

            <div>
              <label className={form.label}>ASSIGN TO JOB <span className="text-coral-500">*</span></label>
              <select
                value={formState.job_id}
                onChange={(e) => setField('job_id', e.target.value)}
                className={`${form.input} h-12`}
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

          <div className="grid grid-cols-2 gap-4">
            <FileDropzone
              label="RESUME / CV"
              file={cvFile}
              onFileChange={setCvFile}
              onRemove={() => setCvFile(null)}
            />

            <FileDropzone
              label="COVER LETTER"
              file={coverLetterFile}
              onFileChange={setCoverLetterFile}
              onRemove={() => setCoverLetterFile(null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={form.label}>INTERVIEWER</label>
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
              />
            </div>

            <div>
              <label className={form.label}>INTERVIEW DATE</label>
              <input
                type="datetime-local"
                value={formState.scheduled_at}
                onChange={(e) => setField('scheduled_at', e.target.value)}
                className={`${form.input} h-12`}
              />
            </div>
          </div>

          {error && <p className="text-sm text-coral-500">{error}</p>}

          <div className="mt-4 flex justify-center gap-5">
            <button
              type="button"
              onClick={onClose}
              className="min-w-[110px] rounded-2xl bg-neutral-200 px-5 py-2 text-lg font-bold text-neutral-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="min-w-[110px] rounded-2xl bg-primary-500 px-5 py-2 text-lg font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}