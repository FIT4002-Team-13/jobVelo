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
  candidates_total: 1, candidates_filled: 1,
  status: 'Completed', interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z', job_last_update_datetime: '2025-01-01T00:00:00Z',
}

const FAKE_CANDIDATE = {
  cand_id: CAND_ID,
  cand_full_name: 'Alice Smith',
  cand_email: 'alice@example.com',
  cand_phone: '0412345678',
  cand_updated_at: '2025-01-01T00:00:00Z',
}

// Ratings as stored on the job-candidate document (US25 criteria)
const FAKE_RATINGS = {
  communication:    { score: 8.0, skill: 'Communication'   },
  technical_skills: { score: 7.5, skill: 'Technical Skills' },
  problem_solving:  { score: 9.0, skill: 'Problem Solving'  },
}

// A completed, rated interview
const FAKE_INTERVIEW = {
  intv_id:                  INTV_ID,
  intv_status:              'completed',
  cand_id:                  CAND_ID,
  job_id:                   JOB_ID,
  intv_ratings:             FAKE_RATINGS,
  intv_candidate_report:    null,
  intv_interviewer_report:  null,
  intv_bias_incidents:      [],
  intv_transcript:          [{ id: '1', speaker: 'Candidate', timestamp: '00:10', text: 'Hello.' }],
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

async function mockCandidatePage(page, interviewOverride = {}) {
  const interview = { ...FAKE_INTERVIEW, ...interviewOverride }
  await page.route(`**/api/candidates/${CAND_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_CANDIDATE) })
  )
  await page.route(`**/api/job-candidates/by-candidate/${CAND_ID}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ jobcand_id: JOBCAND, job_id: JOB_ID, cand_id: CAND_ID, ratings: FAKE_RATINGS }]),
    })
  )
  await page.route(`**/api/interviews**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([interview]) })
  )
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  )
  await page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([FAKE_JOB]) })
  )
  await page.route(`**/api/interview-users/by-interview/${INTV_ID}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ user_id: FAKE_INTERVIEWER.userid, intv_id: INTV_ID }]),
    })
  )
  await page.route(`**/api/users**`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ userid: FAKE_INTERVIEWER.userid, full_name: FAKE_INTERVIEWER.full_name }]),
    })
  )
}

async function goToCandidatePage(page) {
  await page.goto(`/candidates/${CAND_ID}/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
}

// ── US25: Rate Candidates Against Predefined Criteria ────────────────────────

test('US25 - Scores panel heading is visible on the candidate detail page', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('heading', { name: 'Scores' })).toBeVisible()
})

test('US25 - Communication score bar is rendered', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Communication')).toBeVisible()
})

test('US25 - Technical Skills score bar is rendered', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Technical Skills')).toBeVisible()
})

test('US25 - Problem Solving score bar is rendered', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Problem Solving')).toBeVisible()
})

test('US25 - overall FINAL SCORE label is shown', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('FINAL SCORE')).toBeVisible()
})

test('US25 - computed overall score is displayed correctly', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  // Average of 8.0, 7.5, 9.0 = 8.17 → formatted as "8.2"
  await expect(page.getByText('8.2')).toBeVisible()
})

test('US25 - individual scores from API are displayed', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('8.0')).toBeVisible()
  await expect(page.getByText('7.5')).toBeVisible()
  await expect(page.getByText('9.0')).toBeVisible()
})

test('US25 - View Score and Evidence button is visible when scores exist', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: /view score and evidence/i })).toBeVisible()
})

test('US25 - scores show as dashes when interview has no ratings', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page, { intv_ratings: null })
  await goToCandidatePage(page)
  // Overall score shows "--" when unrated
  await expect(page.getByText('--').first()).toBeVisible()
})

// ── US32: Visual Breakdown of Strengths and Weaknesses ───────────────────────

test('US32 - View Transcription button is visible when transcript exists', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: /view transcription/i })).toBeVisible()
})

test('US32 - View Transcription button is disabled when no transcript', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page, { intv_transcript: [] })
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: /view transcription/i })).toBeDisabled()
})
