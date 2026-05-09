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

async function request(path, { method = 'GET', body, headers, auth = false } = {}) {
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  }
  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })

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
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  login:  (payload) => request('/auth/login',  { method: 'POST', body: payload }),
  me:     ()        => request('/auth/me',     { auth: true }),
}
