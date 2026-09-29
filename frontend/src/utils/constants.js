function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function withAllOption(options, allLabel = 'All') {
  return [{ value: '', label: allLabel }, ...options]
}

// Job status enum - kept in sync with the backend's job status field.
export const JOB_STATUSES = ['Pending', 'In Progress', 'Completed']

export const JOB_STATUS_OPTIONS = JOB_STATUSES.map((s) => ({ value: s, label: s }))

// Candidate/application status enum - mirrors the interview status values
// the rows can actually hold (upper-cased), so every filter built from this
// list only ever matches real data.
export const CANDIDATE_STATUSES = ['NOT SCHEDULED', 'SCHEDULED', 'IN PROGRESS', 'COMPLETED']

export const CANDIDATE_FILTER_OPTIONS = CANDIDATE_STATUSES.map((s) => ({
  value: s,
  label: toTitleCase(s),
}))

// Roles an admin can assign to a new invitation. "admin" deliberately
// absent - admin status only comes from creating a company. Kept in sync
// with NonAdminRole in backend/models/user.py.
export const ROLE_OPTIONS = [
  { value: 'interviewer',    label: 'Interviewer' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'recruiter',      label: 'Recruiter' },
]

export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]))

// Rotation of brand accent colors used to distinguish interview sections
// across the plan editor and the live section timers. Shared here so the
// two views always agree on which color goes with which section index.
export const SECTION_COLORS = [
  {
    bg: 'bg-primary-50', border: 'border-primary-200', dot: 'bg-primary-400', time: 'text-primary-500',
    activeBorder: 'border-primary-300', ring: 'ring-primary-100', badge: 'bg-primary-100 text-primary-700',
    pauseBg: 'bg-primary-100 hover:bg-primary-200 text-primary-600', timer: 'text-primary-600',
  },
  {
    bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-400', time: 'text-sky-500',
    activeBorder: 'border-sky-300', ring: 'ring-sky-100', badge: 'bg-sky-100 text-sky-700',
    pauseBg: 'bg-sky-100 hover:bg-sky-200 text-sky-600', timer: 'text-sky-600',
  },
  {
    bg: 'bg-mint-50', border: 'border-mint-200', dot: 'bg-mint-400', time: 'text-mint-600',
    activeBorder: 'border-mint-300', ring: 'ring-mint-100', badge: 'bg-mint-100 text-mint-700',
    pauseBg: 'bg-mint-100 hover:bg-mint-200 text-mint-600', timer: 'text-mint-600',
  },
  {
    bg: 'bg-coral-50', border: 'border-coral-200', dot: 'bg-coral-400', time: 'text-coral-500',
    activeBorder: 'border-coral-300', ring: 'ring-coral-100', badge: 'bg-coral-100 text-coral-700',
    pauseBg: 'bg-coral-100 hover:bg-coral-200 text-coral-600', timer: 'text-coral-600',
  },
]
