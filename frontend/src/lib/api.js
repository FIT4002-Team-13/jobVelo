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

// Download a file from an auth-protected endpoint and hand it to the
// browser as a save-as. window.open can't carry the Bearer token, so we
// fetch the bytes ourselves and click a temporary object-URL link.
export async function downloadFileWithAuth(fileUrl, filename) {
  const res = await authedFetch(fileUrl)
  if (!res.ok) {
    let message = `Download failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.detail === 'string') message = data.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, { status: res.status })
  }
  // Prefer the server's Content-Disposition filename (it carries the
  // candidate name + interview datetime); an explicit `filename` arg wins.
  const disposition = res.headers.get('content-disposition') || ''
  const serverName = disposition.match(/filename="?([^";]+)"?/)?.[1]

  const blobUrl = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename || serverName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
}

// Build a query string from a params object, dropping undefined/null/'' values.
// Returns '' or '?a=1&b=2' so call sites can do `/path${qs(params)}`.
function qs(params = {}) {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString()
  return s ? `?${s}` : ''
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
  listJobs: (params = {}) => request(`/jobs${qs(params)}`, { auth: true }),
  getJob:   (jobId)       => request(`/jobs/${encodeURIComponent(jobId)}`, { auth: true }),

  // Create/update/delete a job posting.
  createJob: (payload)         => request('/jobs',      { method: 'POST', body: payload, auth: true }),
  updateJob: (jobId, payload)  => request(`/jobs/${jobId}`, { method: 'PUT', body: payload, auth: true }),
  deleteJob: (jobId)           => request(`/jobs/${jobId}`, { method: 'DELETE', auth: true }),

  // Enriched candidate rows for one job (name + interview status + score +
  // interviewer pre-joined server-side).
  getJobCandidates: (jobId) =>
    request(`/jobs/${encodeURIComponent(jobId)}/candidates`, { auth: true }),
  // Unlink a candidate from a job (204).
  deleteJobCandidate: (jobId, jobcandId) =>
    request(`/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(jobcandId)}`, {
      method: 'DELETE',
      auth: true,
    }),

  // ---------- job-candidate links ---------------------------------------
  // Flat enumeration with job_title + cand_full_name pre-joined, used by
  // the CV Analyser picker. Each row also carries `has_analysis`.
  listJobCandidates: (params = {}) => request(`/job-candidates${qs(params)}`, { auth: true }),
  // Every job link for one candidate.
  getJobCandidatesByCandidate: (candId) =>
    request(`/job-candidates/by-candidate/${encodeURIComponent(candId)}`, { auth: true }),
  // Persist an edited/reordered interview plan (array of plan_sections).
  updateJobCandidatePlan: (jobcandId, planSections) =>
    request(`/job-candidates/${encodeURIComponent(jobcandId)}/plan`, {
      method: 'PATCH',
      body: { plan_sections: planSections },
      auth: true,
    }),

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

  // ---------- candidates ----------------------------------------------
  getCandidate:    (candId)          => request(`/candidates/${encodeURIComponent(candId)}`, { auth: true }),
  updateCandidate: (candId, patch)   => request(`/candidates/${encodeURIComponent(candId)}`, { method: 'PATCH', body: patch, auth: true }),
  // Create a candidate and link it to a job in one call. Returns
  // { candidate, job_candidate }.
  createCandidateForJob: (payload)   => request('/candidates/create-for-job', { method: 'POST', body: payload, auth: true }),
  // Aggregate view for the candidate-detail screen: candidate + job +
  // job_candidate + interview + interviewer + cv_analysis in one response.
  getCandidateDetail: (candId, jobId) =>
    request(`/candidates/${encodeURIComponent(candId)}/detail${qs({ job_id: jobId })}`, { auth: true }),
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
  listUsers: (params = {}) => request(`/users${qs(params)}`, { auth: true }),
  // Convenience wrapper - the interviewer combobox only ever wants this slice.
  listInterviewers: () => request(`/users${qs({ role: 'interviewer' })}`, { auth: true }),
  // Single teammate by id (company-scoped server-side).
  getUser: (userId) => request(`/users/${encodeURIComponent(userId)}`, { auth: true }),

  // ---------- interviews ---------------------------------------------------
  // Company-wide interviews list, optionally filtered (e.g. by cand_id/job_id).
  listInterviews: (params = {}) => request(`/interviews${qs(params)}`, { auth: true }),
  getInterview:   (id)          => request(`/interviews/${encodeURIComponent(id)}`, { auth: true }),
  // Aggregate view for the interview screen: interview + job + candidate +
  // job_candidate + cv_analysis + interviewer in one response.
  getInterviewContext: (id) =>
    request(`/interviews/${encodeURIComponent(id)}/context`, { auth: true }),
  createInterview: (payload)   => request('/interviews', { method: 'POST', body: payload, auth: true }),
  updateInterview: (id, patch) => request(`/interviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, auth: true }),
  // Finalise an interview. Body carries the transcript plus the client-side
  // duration and any bias incidents surfaced during the session.
  completeInterview: (id, payload) =>
    request(`/interviews/${encodeURIComponent(id)}/complete`, { method: 'POST', body: payload, auth: true }),
  // AI interview-section plan. payload: { job_id, cand_id, total_minutes? }.
  generatePlan: (payload) => request('/interviews/generate-plan', { method: 'POST', body: payload, auth: true }),

  // ---------- interview questions ---------------------------------------
  generateQuestions:        (jobId)       => request(`/interview-questions/${encodeURIComponent(jobId)}`, { method: 'POST', auth: true }),
  generateFollowUpQuestions: (jobId, body) => request(`/interview-questions/${encodeURIComponent(jobId)}/follow-up`, { method: 'POST', body, auth: true }),
  generateSimilarQuestions:  (jobId, body) => request(`/interview-questions/${encodeURIComponent(jobId)}/similar`, { method: 'POST', body, auth: true }),

  // ---------- interview-users -----------------------------------------
  getInterviewUsersByInterview: (intvId) =>
    request(`/interview-users/by-interview/${encodeURIComponent(intvId)}`, { auth: true }),

  // ---------- applications ------------------------------------------------
  // Flat application rows (candidate + job + status pre-joined), scoped
  // server-side to the caller.
  listApplications: (params = {}) => request(`/applications${qs(params)}`, { auth: true }),
  updateApplication: (applicationId, patch) =>
    request(`/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: patch, auth: true }),

  // ---------- dashboard ----------------------------------------------------
  getDashboardSummary: () => request('/dashboard/summary', { auth: true }),

  // ---------- companies --------------------------------------------------
  getCompany:    (comp_id)          => request(`/companies/${comp_id}`,  { auth: true }),
  updateCompany: (comp_id, payload) => request(`/companies/${comp_id}`,  { method: 'PUT', body: payload, auth: true }),
  updateCompanyLogo: (comp_id, formData) => request(`/companies/${comp_id}/logo`, { method: 'PATCH', body: formData, auth: true }),
}