// Mirrors the server-side rules in backend/security.py so the client can
// give immediate feedback. The backend remains the source of truth.

const RULES = [
  { id: 'length',  test: (p) => p.length >= 8,           label: 'At least 8 characters' },
  { id: 'upper',   test: (p) => /[A-Z]/.test(p),         label: 'One uppercase letter' },
  { id: 'number',  test: (p) => /\d/.test(p),            label: 'One number' },
  { id: 'special', test: (p) => /[^A-Za-z0-9\s]/.test(p),label: 'One special character' },
]

export function checkPassword(password) {
  return RULES.map((r) => ({ ...r, ok: r.test(password) }))
}

export function isPasswordStrong(password) {
  return RULES.every((r) => r.test(password))
}
