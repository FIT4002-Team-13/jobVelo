// Minimal fetch wrapper for the Smart Recruit backend.
// The dev server proxies /api/* to http://localhost:8000 (vite.config.js).

import { getToken } from './authStore.js'

const BASE = import.meta.env.VITE_API_URL || '/api'
const FETCH_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || ''

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
  return fetch(`${FETCH_BASE}${url}`, { ...init, headers })
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
}