// Tiny localStorage-backed token + user cache.
// Single key so logout is one removeItem call.

const KEY = 'smartrecruit.auth'

export function readAuth() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeAuth({ token, user }) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }))
}

export function clearAuth() {
  localStorage.removeItem(KEY)
}

export function getToken() {
  return readAuth()?.token ?? null
}
