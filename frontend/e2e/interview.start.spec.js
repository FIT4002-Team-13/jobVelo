import { test, expect } from '@playwright/test'

const COMP_ID   = '507f1f77bcf86cd799439012'
const JOB_ID    = '507f1f77bcf86cd799439020'
const CAND_ID   = '507f1f77bcf86cd799439031'
const JOBCAND   = '507f1f77bcf86cd799439041'
const INTV_ID   = '507f1f77bcf86cd799439051'

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
  candidates_total: 1, candidates_filled: 0, salary: '', salary_type: '',
  status: 'In Progress', interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
}

// A SCHEDULED candidate row as returned by /api/jobs/:id/candidates.
const FAKE_SCHEDULED_CANDIDATE = {
  id: JOBCAND, cand_id: CAND_ID, name: 'Alice Smith',
  status: 'SCHEDULED', score: null,
  interviewer: 'Interviewer User', intv_id: INTV_ID, intv_completed: false,
  scheduled_at: '2027-09-20T14:00:00Z', ratings: null,
}

const FAKE_EXISTING_INTERVIEW = {
  intv_id: INTV_ID, intv_status: 'scheduled',
  cand_id: CAND_ID, job_id: JOB_ID,
}

const FAKE_CANDIDATE_DETAIL = {
  cand_id: CAND_ID,
  cand_full_name: 'Alice Smith',
  cand_email: 'alice@example.com',
  cand_phone: '0412345678',
  cand_updated_at: '2025-01-01T00:00:00Z',
}

async function seedAuth(page) {
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
}

async function mockJobDetail(page) {
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_SCHEDULED_CANDIDATE]) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
}

async function mockCandidateDetail(page) {
  await page.route(`**/api/candidates/${CAND_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CANDIDATE_DETAIL) })
  )
  await page.route(`**/api/job-candidates/by-candidate/${CAND_ID}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ jobcand_id: JOBCAND, job_id: JOB_ID, cand_id: CAND_ID, status: 'scheduled' }]),
    })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
}

// ── US14: Start Interview Session ─────────────────────────────────────────────

test('US14 - SCHEDULES tab shows Start Interview button for SCHEDULED candidate', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  // The SCHEDULED candidate row should have an enabled Start Interview button
  const startBtn = page.getByRole('button', { name: 'Start Interview' }).first()
  await expect(startBtn).toBeVisible()
  await expect(startBtn).not.toBeDisabled()
})

test('US14 - clicking Start Interview opens the confirmation modal', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await expect(page.getByRole('heading', { name: 'Start Interview Session' })).toBeVisible()
})

test('US14 - confirmation modal shows the candidate name', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await expect(page.getByText('Alice Smith').last()).toBeVisible()
})

test('US14 - confirmation modal shows the job title', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
})

test('US14 - Cancel button closes the modal without navigating', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await expect(page.getByRole('heading', { name: 'Start Interview Session' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Start Interview Session' })).not.toBeVisible()
  await expect(page).toHaveURL(`/jobs/${JOB_ID}`)
})

// ── US15: Select Candidate for Interview ──────────────────────────────────────

test('US15 - confirming Start navigates to the interview page for that candidate', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  // Existing interview found → resume that session.
  await page.route(`**/api/interviews**`, (route) => {
    if (route.request().method() === 'GET')
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_EXISTING_INTERVIEW]) })
    else
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ intv_id: INTV_ID }) })
  })
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page).toHaveURL(`/interview/${INTV_ID}`)
})

test('US15 - new interview is created when no existing scheduled/in-progress interview', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  const NEW_INTV_ID = '507f1f77bcf86cd799439099'
  await page.route(`**/api/interviews**`, (route) => {
    if (route.request().method() === 'GET')
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    else
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ intv_id: NEW_INTV_ID }) })
  })
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'Start Interview' }).first().click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page).toHaveURL(`/interview/${NEW_INTV_ID}`)
})

test('US15 - non-SCHEDULED candidate has a disabled Start Interview button', async ({ page }) => {
  await seedAuth(page)
  // Override candidates with a NOT SCHEDULED one
  const notScheduled = { ...FAKE_SCHEDULED_CANDIDATE, status: 'NOT SCHEDULED', scheduled_at: null }
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([notScheduled]) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  const startBtn = page.getByRole('button', { name: 'Start Interview' }).first()
  await expect(startBtn).toBeDisabled()
})

test('US15 - Start Interview button is also present on the candidate detail page', async ({ page }) => {
  await seedAuth(page)
  await mockCandidateDetail(page)
  // The interview for this candidate is SCHEDULED
  await page.route(`**/api/interviews**`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ intv_id: INTV_ID, intv_status: 'scheduled', cand_id: CAND_ID, job_id: JOB_ID }]),
    })
  )
  await page.goto(`/candidates/${CAND_ID}/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByRole('button', { name: /start interview/i })).toBeVisible()
})
