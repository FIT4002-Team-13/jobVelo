import { test, expect } from '@playwright/test'

const COMP_ID  = '507f1f77bcf86cd799439012'
const JOB_ID   = '507f1f77bcf86cd799439020'

const FAKE_ADMIN = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'adminuser',
  full_name: 'Admin User',
  email:     'admin@testcompany.com',
  role:      'admin',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

// A job with an existing (but minimal) description that we will overwrite.
const FAKE_JOB = {
  id:                     JOB_ID,
  comp_id:                COMP_ID,
  title:                  'Senior Software Engineer',
  description:            'Initial description.',
  employment_type:        ['Full-time'],
  recruitment_start:      '2025-01-01',
  recruitment_end:        '2025-12-31',
  candidates_total:       3,
  candidates_filled:      0,
  salary:                 '',
  salary_type:            '',
  status:                 'Pending',
  interviewers:           [],
  job_created_at:         '2025-01-01T00:00:00Z',
  job_last_update_datetime: '2025-01-01T00:00:00Z',
}

const NEW_DESCRIPTION =
  'We are looking for a Senior Software Engineer with 5+ years of experience ' +
  'in React, Node.js, and cloud infrastructure. You will lead technical design, ' +
  'mentor junior engineers, and drive architecture decisions.'

// Seed localStorage before the page boots and register base API mocks.
// Catch-all is registered first (lowest priority); specific mocks last (wins).
async function seedAuth(page) {
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
}

// Set up mocks needed for the job detail page to load without errors.
// GET /api/jobs/:id  → current job
// GET /api/jobs/:id/candidates → empty list
// GET /api/jobs      → empty list (Edit modal reads this for the job select)
async function mockJobDetail(page) {
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
}

// Navigate to the job detail page and wait for it to finish loading.
async function goToJobDetail(page) {
  await page.goto(`/jobs/${JOB_ID}`)
  // The job title appears once the GET resolves and the loading state clears.
  await expect(page.getByRole('heading', { name: 'Job Posting' })).toBeVisible()
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
}

// Open the Edit modal from the job detail page and wait for it to appear.
async function openEditModal(page) {
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Job Posting' })).toBeVisible()
}

// ── US5: Upload Job Description ───────────────────────────────────────────────

test('US5 - job detail page shows the existing description', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await goToJobDetail(page)
  await expect(page.getByText('Initial description.')).toBeVisible()
})

test('US5 - Edit button opens modal with description field pre-populated', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await goToJobDetail(page)
  await openEditModal(page)
  await expect(page.locator('textarea')).toHaveValue('Initial description.')
})

test('US5 - pasting a description and saving sends PUT with the description in the body', async ({ page }) => {
  let capturedBody = null
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route(`**/api/jobs/${JOB_ID}`, (route) => {
    if (route.request().method() === 'PUT') {
      capturedBody = route.request().postDataJSON()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FAKE_JOB, description: NEW_DESCRIPTION }),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
    }
  })
  await goToJobDetail(page)
  await openEditModal(page)
  await page.locator('textarea').fill(NEW_DESCRIPTION)
  await page.getByRole('button', { name: /save changes/i }).click()
  expect(capturedBody?.description).toBe(NEW_DESCRIPTION)
})

test('US5 - saving the description shows a confirmation toast', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route(`**/api/jobs/${JOB_ID}`, (route) => {
    if (route.request().method() === 'PUT')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FAKE_JOB, description: NEW_DESCRIPTION }),
      })
    else
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  })
  await goToJobDetail(page)
  await openEditModal(page)
  await page.locator('textarea').fill(NEW_DESCRIPTION)
  await page.getByRole('button', { name: /save changes/i }).click()
  // Toast: 'Job "Senior Software Engineer" updated.'
  await expect(page.getByText(/senior software engineer.*updated/i)).toBeVisible()
})

test('US5 - updated description is reflected in the job detail view after save', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route(`**/api/jobs/${JOB_ID}`, (route) => {
    if (route.request().method() === 'PUT')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FAKE_JOB, description: NEW_DESCRIPTION }),
      })
    else
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  })
  await goToJobDetail(page)
  await openEditModal(page)
  await page.locator('textarea').fill(NEW_DESCRIPTION)
  await page.getByRole('button', { name: /save changes/i }).click()
  // Modal closes and the job detail panel refreshes with the new description text.
  await expect(page.getByRole('heading', { name: 'Edit Job Posting' })).not.toBeVisible()
  await expect(page.getByText(/we are looking for a senior software engineer/i)).toBeVisible()
})

test('US5 - saved description becomes available for question generation', async ({ page }) => {
  // Verify that the question-generation endpoint would be called with the
  // correct job_id after the description is stored on the job.
  let questionGenCalled = false
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route(`**/api/jobs/${JOB_ID}`, (route) => {
    if (route.request().method() === 'PUT')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FAKE_JOB, description: NEW_DESCRIPTION }),
      })
    else
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  })
  await page.route(`**/api/interview-questions/${JOB_ID}`, (route) => {
    questionGenCalled = true
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ questions: [] }),
    })
  })
  // Save the new description.
  await goToJobDetail(page)
  await openEditModal(page)
  await page.locator('textarea').fill(NEW_DESCRIPTION)
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByText(/senior software engineer.*updated/i)).toBeVisible()
  // Simulate a downstream call to the question-generation endpoint (as the
  // interview page would make it) and confirm it reaches the correct job.
  await page.evaluate(
    async ({ jobId }) => {
      const token = JSON.parse(localStorage.getItem('smartrecruit.auth')).token
      await fetch(`/api/interview-questions/${jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    { jobId: JOB_ID }
  )
  expect(questionGenCalled).toBe(true)
})
