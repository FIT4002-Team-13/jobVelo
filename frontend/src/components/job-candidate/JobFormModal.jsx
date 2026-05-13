import { useState } from 'react'
import { flex, form as f, button, modal } from '../../styles/layout'
import { useAuth } from '../../lib/AuthContext.jsx'

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Casual', 'Internship']
const STATUS_OPTIONS   = ['Pending', 'In Progress', 'Completed']

// Recruitment dates are stored on the backend as ISO yyyy-mm-dd strings,
// which is exactly the format <input type="date"> emits and consumes - so
// we just pass the value through with no parsing on either side.
const EMPTY_FORM = {
  title: '', description: '',
  recruitment_start: '',
  recruitment_end:   '',
  employment_type: [], candidates_total: 1,
  salary: '', salary_type: '', status: 'Pending',
}

export function jobToForm(job) {
  return {
    title:             job.title ?? '',
    description:       job.description ?? '',
    recruitment_start: job.recruitment_start ?? '',
    recruitment_end:   job.recruitment_end   ?? '',
    employment_type:   job.employment_type ?? [],
    candidates_total:  job.candidates_total ?? 1,
    salary:            job.salary ?? '',
    salary_type:       job.salary_type ?? '',
    status:            job.status ?? 'Pending',
  }
}

export default function JobFormModal({ initialJob, onClose, onSaved }) {
  const isEdit = !!initialJob
  const { user } = useAuth()
  const [form, setForm]         = useState(isEdit ? jobToForm(initialJob) : EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(null)

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  function toggleType(type) {
    setForm(prev => ({
      ...prev,
      employment_type: prev.employment_type.includes(type)
        ? prev.employment_type.filter(t => t !== type)
        : [...prev.employment_type, type],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())             return setError('Job title is required.')
    if (!form.recruitment_start)        return setError('Recruitment start date is required.')
    if (!form.recruitment_end)          return setError('Recruitment end date is required.')
    // yyyy-mm-dd is lexicographically orderable, so direct string compare works.
    if (form.recruitment_end < form.recruitment_start)
      return setError('End date must be on or after the start date.')
    if (form.employment_type.length === 0) return setError('Select at least one employment type.')
    // comp_id comes from the JWT-derived user; never trust the form for it.
    if (!isEdit && !user?.comp_id) return setError('You must be logged in to create a job.')

    setError(null)
    setSubmitting(true)
    const body = {
      title:             form.title.trim(),
      description:       form.description.trim(),
      employment_type:   form.employment_type,
      recruitment_start: form.recruitment_start,
      recruitment_end:   form.recruitment_end,
      candidates_total:  Number(form.candidates_total),
      salary:            form.salary,
      salary_type:       form.salary_type,
      // Only attach comp_id on create - PUT/update can't change company.
      ...(isEdit
        ? { status: form.status }
        : { comp_id: user.comp_id }),
    }
    try {
      const res = await fetch(
        isEdit ? `/api/jobs/${initialJob.id}` : '/api/jobs',
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      if (!res.ok) {
        // Surface FastAPI's actual error so 422s aren't silently "Request failed."
        const data = await res.json().catch(() => null)
        const detail = data?.detail
        const message =
          typeof detail === 'string' ? detail
          : Array.isArray(detail)    ? detail.map((d) => `${d.loc?.join('.')}: ${d.msg}`).join(' • ')
          :                            `Request failed (${res.status})`
        throw new Error(message)
      }
      onSaved(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} max-w-2xl max-h-[90vh] overflow-y-auto`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        <h2 className="text-xl font-bold text-neutral-800 mb-1">{isEdit ? 'Edit Job Posting' : 'Create Job Posting'}</h2>
        <p className="text-xs text-neutral-400 mb-5">Required fields are indicated with a asterisk *</p>

        <form onSubmit={handleSubmit} className={`${flex.col} gap-4`}>
          <div>
            <label className={f.label}>Job Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="eg. Senior Software Engineer"
              className={f.input} />
          </div>

          <div>
            <label className={f.label}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              className={`${f.input} resize-none`} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={f.label}>Recruitment Start Date *</label>
              <input
                type="date"
                value={form.recruitment_start}
                onChange={e => set('recruitment_start', e.target.value)}
                className={f.input}
              />
            </div>
            <div className="flex-1">
              <label className={f.label}>Recruitment End Date *</label>
              <input
                type="date"
                value={form.recruitment_end}
                onChange={e => set('recruitment_end', e.target.value)}
                // Browser-level guard so users can't even pick an end date
                // before the start. Validated again on submit for safety.
                min={form.recruitment_start || undefined}
                className={f.input}
              />
            </div>
          </div>

          <div>
            <label className={f.label}>Employment Type *</label>
            <div className="flex flex-wrap gap-4">
              {EMPLOYMENT_TYPES.map(type => (
                <label key={type} className={`${flex.row} gap-1.5 text-sm text-neutral-600 cursor-pointer`}>
                  <input type="checkbox" checked={form.employment_type.includes(type)}
                    onChange={() => toggleType(type)} className="w-4 h-4 accent-primary-500" />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={f.label}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className={f.input}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-4">
            <div className="w-36">
              <label className={f.label}>No. of Candidates *</label>
              <input type="number" min={1} value={form.candidates_total}
                onChange={e => set('candidates_total', e.target.value)}
                className={f.input} />
            </div>
            <div className="flex-1">
              <label className={f.label}>Salary</label>
              <div className={`${flex.row} gap-2`}>
                <div className={`${flex.row} border border-neutral-300 rounded-lg overflow-hidden flex-1`}>
                  <span className="px-2 text-sm text-neutral-400 bg-neutral-50 border-r border-neutral-300 py-2">$</span>
                  <input value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="100k"
                    className="flex-1 px-2 py-2 text-sm text-neutral-700 focus:outline-none" />
                </div>
                {['Hourly', 'Yearly'].map(t => (
                  <label key={t} className={`${flex.row} gap-1 text-sm text-neutral-600 cursor-pointer whitespace-nowrap`}>
                    <input type="radio" name="salary_type" value={t} checked={form.salary_type === t}
                      onChange={e => set('salary_type', e.target.value)} className="accent-primary-500" />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <p className={f.error}>{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className={`${button.cancel} px-6 py-2`}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-6 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-60">
              {submitting ? (isEdit ? 'Saving…' : 'Publishing…') : (isEdit ? 'Save Changes' : 'Publish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
