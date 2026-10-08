import { test, expect } from '@playwright/test'

const COMP_ID = '507f1f77bcf86cd799439012'
const JOB_ID  = '507f1f77bcf86cd799439020'

const FAKE_ADMIN = {
  userid:    '507f1f77bcf86cd799439010',
  username:  'adminuser',
  full_name: 'Admin User',
  email:     'admin@testcompany.com',
  role:      'admin',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_INTERVIEWER = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'intervieweruser',
  full_name: 'Interviewer User',
  email:     'interviewer@testcompany.com',
  role:      'interviewer',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_JOB = {
  id: JOB_ID, comp_id: COMP_ID, title: 'Senior Software Engineer',
  description: '', employment_type: ['Full-time'],
  recruitment_start: '2025-01-01', recruitment_end: '2027-12-31',
  candidates_total: 1, candidates_filled: 0,
  status: 'In Progress', interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
}

// ── A01: Broken Access Control ────────────────────────────────────────────────

test('A01 - unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
  // No localStorage seeded — no token, so AuthContext bootstraps immediately
  // with isAuthenticated=false and RequireAuth redirects to /login.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
})

test('A01 - unauthenticated visit to /jobs redirects to /login', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.goto('/jobs')
  await expect(page).toHaveURL('/login')
})

test('A01 - unauthenticated visit to /admin/dashboard redirects to /login', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.goto('/admin/dashboard')
  await expect(page).toHaveURL('/login')
})

test('A01 - expired token (401 from /me) redirects to /login on protected route', async ({ page }) => {
  // Seed a token so AuthContext calls /me, but /me returns 401 (expired).
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'expired-token', user: FAKE_INTERVIEWER }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Token expired' }) })
  )
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
})

// ── A01: Role-Based Access Control ───────────────────────────────────────────

test('A01 - interviewer role cannot access /admin/dashboard (shows 403)', async ({ page }) => {
  // Seed an interviewer — RequireRole(['admin']) should block them.
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_INTERVIEWER }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INTERVIEWER) })
  )
  await page.goto('/admin/dashboard')
  await expect(page.getByText('Access restricted')).toBeVisible()
  await expect(page).not.toHaveURL('/login')
})

// ── A04: Insecure Design — input boundary validation ─────────────────────────

async function seedAdmin(page) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_ADMIN }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ADMIN) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: JOB_ID, comp_id: COMP_ID, title: 'Senior Software Engineer',
      description: '', employment_type: ['Full-time'],
      recruitment_start: '2025-01-01', recruitment_end: '2027-12-31',
      candidates_total: 0, candidates_filled: 0,
      status: 'In Progress', interviewers: [],
      job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
    }) })
  )
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/users**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
}

test('A04 - job title exceeding 120 characters is rejected client-side', async ({ page }) => {
  let serverCalled = false
  await seedAdmin(page)
  await page.route('**/api/jobs', (route) => {
    if (route.request().method() === 'POST') serverCalled = true
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/jobs')
  await page.getByRole('button', { name: /create job/i }).click()
  await expect(page.getByRole('heading', { name: 'Create Job Posting' })).toBeVisible()
  const titleInput = page.locator('input[placeholder]').first()
  const maxLength = await titleInput.getAttribute('maxlength')
  expect(Number(maxLength)).toBe(120)
  expect(serverCalled).toBe(false)
})

test('A04 - candidate name under 2 characters is rejected client-side', async ({ page }) => {
  let serverCalled = false
  await seedAdmin(page)
  await page.route('**/api/candidates/create-for-job', (route) => {
    serverCalled = true
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
  })
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByRole('button', { name: /add candidate/i })).toBeVisible()
  await page.getByRole('button', { name: /add candidate/i }).click()
  await expect(page.getByRole('heading', { name: 'Add Candidate' })).toBeVisible()
  await page.getByPlaceholder('eg. John Doe').fill('A')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(/2-100 characters/i)).toBeVisible()
  expect(serverCalled).toBe(false)
})

test('A04 - weak password (missing uppercase) is rejected client-side on signup', async ({ page }) => {
  let serverCalled = false
  await page.route('**/api/auth/check-code/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ valid: true, comp_name: 'Test Co', role: 'interviewer' }) })
  )
  await page.route('**/api/auth/signup', (route) => {
    serverCalled = true
    route.fulfill({ status: 201, body: '{}' })
  })
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill('INV-TEST-0001')
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByLabel('Full name').fill('Jane Doe')
  await page.getByLabel('Username').fill('janedoe23')
  await page.getByLabel('Email').fill('jane@testco.com')
  await page.locator('input[name="password"]').fill('nouppercase1!')
  await page.locator('input[name="confirm"]').fill('nouppercase1!')
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page.getByText(/uppercase/i)).toBeVisible()
  expect(serverCalled).toBe(false)
})

// ── A03: XSS — candidate name injection ──────────────────────────────────────

const XSS_PAYLOAD = '<img src=x onerror=alert(1)>'

test('A03 - XSS payload in candidate name is not executed (no injected img element)', async ({ page }) => {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_INTERVIEWER }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INTERVIEWER) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: '507f1f77bcf86cd799439041',
        cand_id: '507f1f77bcf86cd799439031',
        name: XSS_PAYLOAD,
        status: 'NOT SCHEDULED',
        score: null,
        interviewer: null,
        intv_id: null,
        intv_completed: false,
        scheduled_at: null,
        ratings: null,
      }]),
    })
  )

  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()

  // The payload must NOT produce a live <img onerror=…> element in the DOM.
  await expect(page.locator('img[onerror]')).toHaveCount(0)
})

test('A03 - XSS payload in candidate name is rendered as escaped text', async ({ page }) => {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_INTERVIEWER }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INTERVIEWER) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: '507f1f77bcf86cd799439041',
        cand_id: '507f1f77bcf86cd799439031',
        name: XSS_PAYLOAD,
        status: 'NOT SCHEDULED',
        score: null,
        interviewer: null,
        intv_id: null,
        intv_completed: false,
        scheduled_at: null,
        ratings: null,
      }]),
    })
  )

  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()

  // React renders the payload as a literal text node — the angle brackets are
  // HTML-escaped, so the string appears as visible text rather than markup.
  await expect(page.getByText(XSS_PAYLOAD, { exact: false })).toBeVisible()
})
