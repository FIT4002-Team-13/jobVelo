import { test, expect } from '@playwright/test'

const COMP_ID    = '507f1f77bcf86cd799439012'
const JOB_ID     = '507f1f77bcf86cd799439020'
const CAND_ID_1  = '507f1f77bcf86cd799439031'
const CAND_ID_2  = '507f1f77bcf86cd799439032'
const CAND_ID_3  = '507f1f77bcf86cd799439033'

const FAKE_HIRING_MANAGER = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'hmuser',
  full_name: 'Hiring Manager',
  email:     'hm@testcompany.com',
  role:      'hiring_manager',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_JOB = {
  id: JOB_ID, comp_id: COMP_ID, title: 'Senior Software Engineer',
  description: '', employment_type: ['Full-time'],
  recruitment_start: '2025-01-01', recruitment_end: '2027-12-31',
  candidates_total: 3, candidates_filled: 3,
  status: 'Completed', interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
}

// Three candidates with different scores for ranking.
// The RANKINGS tab sorts highest score first.
const FAKE_CANDIDATES = [
  {
    id: '507f1f77bcf86cd799439041', cand_id: CAND_ID_1, name: 'Alice Smith',
    status: 'EVALUATED', score: 8.2,
    ratings: { communication: { score: 8.0 }, technical_skills: { score: 7.5 }, problem_solving: { score: 9.0 } },
    intv_id: '507f1f77bcf86cd799439051', intv_completed: true,
    interviewer: 'Interviewer User', scheduled_at: '2027-01-10T10:00:00Z',
  },
  {
    id: '507f1f77bcf86cd799439042', cand_id: CAND_ID_2, name: 'Bob Jones',
    status: 'EVALUATED', score: 9.0,
    ratings: { communication: { score: 9.5 }, technical_skills: { score: 8.5 }, problem_solving: { score: 9.0 } },
    intv_id: '507f1f77bcf86cd799439052', intv_completed: true,
    interviewer: 'Interviewer User', scheduled_at: '2027-01-11T10:00:00Z',
  },
  {
    id: '507f1f77bcf86cd799439043', cand_id: CAND_ID_3, name: 'Carol White',
    status: 'EVALUATED', score: 6.5,
    ratings: { communication: { score: 6.0 }, technical_skills: { score: 7.0 }, problem_solving: { score: 6.5 } },
    intv_id: '507f1f77bcf86cd799439053', intv_completed: true,
    interviewer: 'Interviewer User', scheduled_at: '2027-01-12T10:00:00Z',
  },
]

async function seedAuth(page) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_HIRING_MANAGER }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_HIRING_MANAGER) })
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

// ── US30: View All Interviewed Candidates ─────────────────────────────────────

test('US30 - job detail page shows all three evaluated candidates', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByText('Bob Jones')).toBeVisible()
  await expect(page.getByText('Carol White')).toBeVisible()
})

test('US30 - candidate overall scores are shown in the SCHEDULES table', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  // All three scores should appear in the Score column
  await expect(page.getByText('8.2')).toBeVisible()
  await expect(page.getByText('9.0').first()).toBeVisible()
  await expect(page.getByText('6.5')).toBeVisible()
})

// ── US31: Candidates Ranked Based on Evaluation Scores ───────────────────────

test('US31 - RANKINGS tab is accessible from the candidates table', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  const rankingsTab = page.getByRole('button', { name: 'RANKINGS' })
  await expect(rankingsTab).toBeVisible()
  await rankingsTab.click()
  // After switching, the Rank column header should appear
  await expect(page.getByRole('columnheader', { name: 'Rank' })).toBeVisible()
})

test('US31 - RANKINGS tab shows the Rank column header', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  await expect(page.getByRole('columnheader', { name: 'Rank' })).toBeVisible()
})

test('US31 - RANKINGS tab shows Communication, Problem Solving column headers', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  await expect(page.getByRole('columnheader', { name: 'Communication' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Problem Solving' })).toBeVisible()
})

test('US31 - highest-scoring candidate appears first (#1) in the RANKINGS tab', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  // Bob Jones has the highest score (9.0) so should be ranked #1
  const rows = page.getByRole('row')
  // Row 0 is the header; row 1 is the first data row
  await expect(rows.nth(1).getByText('#1')).toBeVisible()
  await expect(rows.nth(1).getByText('Bob Jones')).toBeVisible()
})

test('US31 - lowest-scoring candidate appears last in the RANKINGS tab', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  // Carol White has the lowest score (6.5) → #3
  const rows = page.getByRole('row')
  await expect(rows.nth(3).getByText('#3')).toBeVisible()
  await expect(rows.nth(3).getByText('Carol White')).toBeVisible()
})

test('US31 - individual criteria scores are shown in the RANKINGS view', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  // Bob Jones' communication score (9.5) should appear in the table
  await expect(page.getByText('9.5')).toBeVisible()
})

test('US31 - switching back to SCHEDULES tab restores the original columns', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await page.getByRole('button', { name: 'RANKINGS' }).click()
  await expect(page.getByRole('columnheader', { name: 'Rank' })).toBeVisible()
  await page.getByRole('button', { name: 'SCHEDULES' }).click()
  await expect(page.getByRole('columnheader', { name: 'Rank' })).not.toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Datetime' })).toBeVisible()
})
