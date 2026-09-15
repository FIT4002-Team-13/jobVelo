import { test, expect } from '@playwright/test'

const COMP_ID    = '507f1f77bcf86cd799439012'
const JOB_ID     = '507f1f77bcf86cd799439020'
const CAND_ID_1  = '507f1f77bcf86cd799439031'
const CAND_ID_2  = '507f1f77bcf86cd799439032'
const JOBCAND_1  = '507f1f77bcf86cd799439041'
const JOBCAND_2  = '507f1f77bcf86cd799439042'
const INTV_ID_1  = '507f1f77bcf86cd799439051'

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
  candidates_total: 2, candidates_filled: 0, salary: '', salary_type: '',
  status: 'In Progress', interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
}

const FAKE_CANDIDATES = [
  {
    id: JOBCAND_1, cand_id: CAND_ID_1, name: 'Alice Smith',
    status: 'SCHEDULED', score: null, interviewer: 'Interviewer User',
    intv_id: INTV_ID_1, intv_completed: false,
    scheduled_at: '2027-02-01T10:00:00Z', ratings: null,
  },
  {
    id: JOBCAND_2, cand_id: CAND_ID_2, name: 'Bob Jones',
    status: 'NOT SCHEDULED', score: null, interviewer: null,
    intv_id: null, intv_completed: false,
    scheduled_at: null, ratings: null,
  },
]

const FAKE_CANDIDATE_DETAIL = {
  cand_id: CAND_ID_1,
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CANDIDATES) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
}

async function mockCandidateDetail(page) {
  await page.route(`**/api/candidates/${CAND_ID_1}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CANDIDATE_DETAIL) })
  )
  await page.route(`**/api/job-candidates/by-candidate/${CAND_ID_1}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ jobcand_id: JOBCAND_1, job_id: JOB_ID, cand_id: CAND_ID_1, status: 'scheduled' }]),
    })
  )
  await page.route(`**/api/interviews**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
}

// ── US7: View List of Candidates per Job ──────────────────────────────────────

test('US7 - candidates table renders rows from API data', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByText('Bob Jones')).toBeVisible()
})

test('US7 - candidate status pills are shown for each row', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('SCHEDULED')).toBeVisible()
  await expect(page.getByText('NOT SCHEDULED')).toBeVisible()
})

test('US7 - search input filters candidates by name', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByText('Bob Jones')).toBeVisible()
  await page.getByPlaceholder('Candidate Name').fill('Alice')
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByText('Bob Jones')).not.toBeVisible()
})

test('US7 - filter clears and shows all candidates again', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByPlaceholder('Candidate Name').fill('Alice')
  await expect(page.getByText('Bob Jones')).not.toBeVisible()
  await page.getByPlaceholder('Candidate Name').fill('')
  await expect(page.getByText('Bob Jones')).toBeVisible()
})

test('US7 - SCHEDULES and RANKINGS tabs are visible', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByRole('button', { name: 'SCHEDULES' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'RANKINGS' })).toBeVisible()
})

test('US7 - Interview Status panel shows total candidate count', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  // InterviewStatusPanel: "Total Candidates" label + count
  await expect(page.getByText('Total Candidates')).toBeVisible()
  await expect(page.getByText('2')).toBeVisible()
})

// ── US8: Organise Candidates by Job ──────────────────────────────────────────

test('US8 - candidates on the job detail page are scoped to that job', async ({ page }) => {
  // JobDetailPage fetches /api/jobs/:id/candidates so the table only shows
  // candidates linked to this specific job - verifies the job-scoped grouping.
  let requestedJobId = null
  await seedAuth(page)
  await page.route(`**/api/jobs/${JOB_ID}/candidates`, (route) => {
    requestedJobId = JOB_ID
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CANDIDATES) })
  })
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  expect(requestedJobId).toBe(JOB_ID)
})

// ── US9: View Candidate Profile ───────────────────────────────────────────────

test('US9 - clicking a candidate row navigates to the candidate detail page', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await mockCandidateDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  // The entire row is clickable - click the candidate name cell to navigate
  await page.getByText('Alice Smith').click()
  await expect(page).toHaveURL(`/candidates/${CAND_ID_1}/${JOB_ID}`)
})

test('US9 - candidate detail page loads and shows the candidate name', async ({ page }) => {
  await seedAuth(page)
  await mockCandidateDetail(page)
  await page.goto(`/candidates/${CAND_ID_1}/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
})

test('US9 - candidate detail page shows the job title', async ({ page }) => {
  await seedAuth(page)
  await mockCandidateDetail(page)
  await page.goto(`/candidates/${CAND_ID_1}/${JOB_ID}`)
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
})
