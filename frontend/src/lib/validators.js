// Shared client-side validators. The backend (Pydantic) remains the source
// of truth - these are here so users get immediate inline feedback instead
// of waiting for a 422 round-trip.
//
// Rule of thumb: every check here MUST be at least as permissive as the
// matching backend rule, otherwise we'd block valid submissions.

// ── Strings ────────────────────────────────────────────────────────────

// RFC-5322-lite. Good enough to catch typos like "foo@bar" without rejecting
// legitimate addresses. Real verification happens server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// http(s) only - the URL constructor would happily accept "javascript:" etc.
// so we do an explicit protocol check after parsing.
export function isEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s.trim())
}

export function isHttpUrl(s) {
  if (typeof s !== 'string' || !s.trim()) return false
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Phone: digits, spaces, dashes, parens, optional leading +. 6-20 chars.
// Loose on purpose - international formats vary wildly.
export function isPhone(s) {
  if (typeof s !== 'string') return false
  const cleaned = s.trim()
  if (cleaned.length < 6 || cleaned.length > 20) return false
  return /^[+]?[\d\s\-().]+$/.test(cleaned)
}

// Username: 3-40 chars, letters/digits/._- only. No spaces.
export function isUsername(s) {
  return typeof s === 'string' && /^[A-Za-z0-9._-]{3,40}$/.test(s.trim())
}

// Full name: 2-100 chars, at least one letter (rejects "  " and "12345").
export function isFullName(s) {
  if (typeof s !== 'string') return false
  const t = s.trim()
  return t.length >= 2 && t.length <= 100 && /[A-Za-z]/.test(t)
}

// ── Dates ──────────────────────────────────────────────────────────────

// True if the ISO datetime is strictly in the future (now + 0s).
// Used by the scheduled-interview field so users can't book the past.
export function isFutureDateTime(iso) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

// ── Files ──────────────────────────────────────────────────────────────

// 2 MB cap on the company logo. Big enough for a high-res PNG, small enough
// that we don't have to think about chunked uploads or progress UI yet.
export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp']

export function checkLogoFile(file) {
  if (!file) return 'Please upload a company logo.'
  if (!ALLOWED_LOGO_MIMES.includes(file.type)) {
    return 'Logo must be a PNG, JPEG or WebP image.'
  }
  if (file.size > MAX_LOGO_BYTES) {
    return `Logo is too large (max ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB).`
  }
  return null
}

// ── Numbers ────────────────────────────────────────────────────────────

// Returns the parsed integer if value is a positive integer string/number,
// or null otherwise. Lets callers do `const n = toPositiveInt(...); if (n == null) ...`.
export function toPositiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null
  return n
}

// Salary: allow "100000", "100k", "100,000", "$100,000". We strip commas,
// dollar signs and a trailing 'k' multiplier, then parse. Returns a number
// in plain dollars, or null on failure.
export function parseSalary(value) {
  if (value === '' || value == null) return 0 // optional - empty is fine
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = String(value).trim().replace(/[$,\s]/g, '')
  let multiplier = 1
  if (/k$/i.test(s)) { multiplier = 1000; s = s.slice(0, -1) }
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n * multiplier
}
