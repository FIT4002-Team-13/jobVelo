// Minimal fetch wrapper for the Smart Recruit backend.
// The dev server proxies /api/* to http://localhost:8000 (vite.config.js).

import { getToken } from './authStore.js'

const BASE = '/api'

export class ApiError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

// Drop-in replacement for window.fetch that injects the Bearer token from
// authStore. Takes the URL EXACTLY as you'd pass to fetch (e.g.
// "/api/jobs") and returns the raw Response, so call sites that do their
// own res.ok / res.json() handling keep working unchanged - the only edit
// needed is `fetch(` → `authedFetch(`.
//
// Every data endpoint is tenant-scoped server-side now (comp_id from the
// JWT), so without this header those requests 401.
export function authedFetch(url, init = {}) {
  const token = getToken()
  const headers = { ...(init.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url, { ...init, headers })
}

// Auto-detects JSON vs FormData bodies:
// - plain object → JSON encoded with Content-Type: application/json
// - FormData     → sent raw (browser sets the multipart boundary header)
async function request(path, { method = 'GET', body, headers, auth = false } = {}) {
  const isFormData = body instanceof FormData
  const finalHeaders = { ...(headers || {}) }
  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }
  if (body && !isFormData) finalHeaders['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    // FastAPI uses { detail: string | [{loc, msg, type}] }
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(' • ')
          : `Request failed (${res.status})`
    throw new ApiError(message, { status: res.status, detail })
  }

  return data
}

export const api = {
  // ---------- auth ------------------------------------------------------
  // Invited-teammate signup. payload includes the invitation_code.
  signup:        (payload)   => request('/auth/signup',         { method: 'POST', body: payload }),
  // Company + admin signup. Takes FormData (logo file + all company fields).
  // Returns { access_token, user, company }.
  signupCompany: (formData)  => request('/auth/signup-company', { method: 'POST', body: formData }),
  // Validate an invitation code before showing the signup form.
  checkCode:     (code)      => request(`/auth/check-code/${encodeURIComponent(code)}`),
  login:         (payload)   => request('/auth/login',          { method: 'POST', body: payload }),
  me:            ()          => request('/auth/me',             { auth: true }),

  // ---------- invitations (admin only) ----------------------------------
  listInvitations:  ()        => request('/invitations',       { auth: true }),
  // Admin must pick the role at generation time - the invitee no longer
  // chooses one at signup. role: 'recruiter' | 'interviewer' | 'hiring_manager'.
  createInvitation: (role)    => request('/invitations',       { method: 'POST', body: { role }, auth: true }),
  deleteInvitation: (id)      => request(`/invitations/${id}`, { method: 'DELETE', auth: true }),

  // ---------- jobs -------------------------------------------------------
  // List jobs, optionally scoped to a company.
  listJobs: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/jobs${qs ? `?${qs}` : ''}`, { auth: true })
  },

  // ---------- job-candidate links ---------------------------------------
  // Flat enumeration with job_title + cand_full_name pre-joined, used by
  // the CV Analyser picker. Each row also carries `has_analysis`.
  listJobCandidates: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/job-candidates${qs ? `?${qs}` : ''}`, { auth: true })
  },

  // ---------- CV analysis ----------------------------------------------
  // POST is multipart now: { jobcand_id, cv?, cover_letter? }. The CV is
  // optional when a cached analysis already exists for the jobcand_id -
  // the backend short-circuits and returns the cached record.
  analyseCv: (formData) => request('/cv-analysis', { method: 'POST', body: formData, auth: true }),
  // Pure read - returns the existing analysis or throws ApiError(404).
  getCvAnalysisByJobcand: (jobcandId) =>
    request(`/cv-analysis/by-jobcand/${encodeURIComponent(jobcandId)}`, { auth: true }),
  // Removes the record + PDFs. Lets the user upload a different CV.
  deleteCvAnalysis: (analysisId) =>
    request(`/cv-analysis/${encodeURIComponent(analysisId)}`, { method: 'DELETE', auth: true }),

  // ---------- candidate documents ---------------------------------------
  // Standalone cover-letter upload (multipart: { cover_letter }). Used when
  // a cover letter is added WITHOUT a new CV - a CV upload goes through
  // analyseCv, which stores the cover letter as part of the analysis.
  uploadCandidateCoverLetter: (candId, formData) =>
    request(`/candidates/${encodeURIComponent(candId)}/cover-letter`, {
      method: 'POST',
      body: formData,
      auth: true,
    }),

  // ---------- users ------------------------------------------------------
  // List teammates, optionally filtered by comp_id / role. Used by the
  // AddCandidate modal's interviewer combobox:
  //   api.listUsers({ comp_id, role: 'interviewer' })
  listUsers: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/users${qs ? `?${qs}` : ''}`, { auth: true })
  },

  // ---------- companies --------------------------------------------------
  getCompany:    (comp_id)          => request(`/companies/${comp_id}`,  { auth: true }),
  updateCompany: (comp_id, payload) => request(`/companies/${comp_id}`,  { method: 'PUT', body: payload, auth: true }),
  updateCompanyLogo: (comp_id, formData) => request(`/companies/${comp_id}/logo`, { method: 'PATCH', body: formData, auth: true }),

}
