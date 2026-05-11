import { useState } from 'react'

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Casual', 'Internship']
const STATUS_OPTIONS   = ['Pending', 'In Progress', 'Completed']
const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const YEARS  = Array.from({ length: 10 }, (_, i) => String(2024 + i))

const EMPTY_FORM = {
  title: '', description: '',
  start_dd: 'dd', start_mm: 'mm', start_yyyy: 'yyyy',
  end_dd:   'dd', end_mm:   'mm', end_yyyy:   'yyyy',
  employment_type: [], candidates_total: 1,
  salary: '', salary_type: '', status: 'Pending',
}

export function jobToForm(job) {
  const [sy, sm, sd] = (job.recruitment_start ?? '').split('-')
  const [ey, em, ed] = (job.recruitment_end   ?? '').split('-')
  return {
    title:            job.title ?? '',
    description:      job.description ?? '',
    start_dd: sd ?? 'dd', start_mm: sm ?? 'mm', start_yyyy: sy ?? 'yyyy',
    end_dd:   ed ?? 'dd', end_mm:   em ?? 'mm', end_yyyy:   ey ?? 'yyyy',
    employment_type:  job.employment_type ?? [],
    candidates_total: job.candidates_total ?? 1,
    salary:           job.salary ?? '',
    salary_type:      job.salary_type ?? '',
    status:           job.status ?? 'Pending',
  }
}

function DateSelect({ label, prefix, values, onChange }) {
  return (
    <div className="flex-1">
      <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">{label} *</label>
      <div className="flex gap-1">
        {[['dd', DAYS], ['mm', MONTHS], ['yyyy', YEARS]].map(([unit, opts]) => (
          <select key={unit} value={values[`${prefix}_${unit}`]}
            onChange={e => onChange(`${prefix}_${unit}`, e.target.value)}
            className="flex-1 border border-neutral-300 rounded-lg px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300">
            <option value={unit}>{unit}</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>
    </div>
  )
}

export default function JobFormModal({ initialJob, onClose, onSaved }) {
  const isEdit = !!initialJob
  const [form, setForm]         = useState(isEdit ? jobToForm(initialJob) : EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(null)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleType(type) {
    setForm(f => ({
      ...f,
      employment_type: f.employment_type.includes(type)
        ? f.employment_type.filter(t => t !== type)
        : [...f.employment_type, type],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())   return setError('Job title is required.')
    if (form.start_dd === 'dd' || form.start_mm === 'mm' || form.start_yyyy === 'yyyy')
      return setError('Recruitment start date is required.')
    if (form.end_dd === 'dd' || form.end_mm === 'mm' || form.end_yyyy === 'yyyy')
      return setError('Recruitment end date is required.')
    if (form.employment_type.length === 0) return setError('Select at least one employment type.')

    setError(null)
    setSubmitting(true)
    const body = {
      title: form.title.trim(), description: form.description.trim(),
      employment_type: form.employment_type,
      recruitment_start: `${form.start_yyyy}-${form.start_mm}-${form.start_dd}`,
      recruitment_end:   `${form.end_yyyy}-${form.end_mm}-${form.end_dd}`,
      candidates_total: Number(form.candidates_total),
      salary: form.salary, salary_type: form.salary_type,
      ...(isEdit && { status: form.status }),
    }
    try {
      const res = await fetch(
        isEdit ? `/api/jobs/${initialJob.id}` : '/api/jobs',
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      if (!res.ok) throw new Error('Request failed.')
      onSaved(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        <h2 className="text-xl font-bold text-neutral-800 mb-1">{isEdit ? 'Edit Job Posting' : 'Create Job Posting'}</h2>
        <p className="text-xs text-neutral-400 mb-5">Required fields are indicated with a asterisk *</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">Job Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="eg. Senior Software Engineer"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300" />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
          </div>

          <div className="flex gap-4">
            <DateSelect label="Recruitment Start Date" prefix="start" values={form} onChange={set} />
            <DateSelect label="Recruitment End Date"   prefix="end"   values={form} onChange={set} />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-2 tracking-wide uppercase">Employment Type *</label>
            <div className="flex flex-wrap gap-4">
              {EMPLOYMENT_TYPES.map(type => (
                <label key={type} className="flex items-center gap-1.5 text-sm text-neutral-600 cursor-pointer">
                  <input type="checkbox" checked={form.employment_type.includes(type)}
                    onChange={() => toggleType(type)} className="w-4 h-4 accent-primary-500" />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-4">
            <div className="w-36">
              <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">No. of Candidates *</label>
              <input type="number" min={1} value={form.candidates_total}
                onChange={e => set('candidates_total', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase">Salary</label>
              <div className="flex gap-2 items-center">
                <div className="flex items-center border border-neutral-300 rounded-lg overflow-hidden flex-1">
                  <span className="px-2 text-sm text-neutral-400 bg-neutral-50 border-r border-neutral-300 py-2">$</span>
                  <input value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="100k"
                    className="flex-1 px-2 py-2 text-sm text-neutral-700 focus:outline-none" />
                </div>
                {['Hourly', 'Yearly'].map(t => (
                  <label key={t} className="flex items-center gap-1 text-sm text-neutral-600 cursor-pointer whitespace-nowrap">
                    <input type="radio" name="salary_type" value={t} checked={form.salary_type === t}
                      onChange={e => set('salary_type', e.target.value)} className="accent-primary-500" />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-coral-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-6 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
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
