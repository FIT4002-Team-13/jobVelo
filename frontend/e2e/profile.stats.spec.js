import { test, expect } from '@playwright/test'

const COMP_ID = '507f1f77bcf86cd799439012'

const FAKE_INTERVIEWER = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'intervieweruser',
  full_name: 'Interviewer User',
  email:     'interviewer@testcompany.com',
  role:      'interviewer',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_STATS = {
  total_interviews: 20,
  total_interviews_delta_pct: null,
  average_candidate_score: 7.4,
  average_candidate_score_delta_pct: null,
  score_trend_range_label: 'Jan 2026 - Jun 2026',
  score_trend: [
    { label: 'Jan', tooltip_label: 'January 2026', avg_score: 6.5 },
    { label: 'Now', tooltip_label: 'June 2026', avg_score: 8.1 },
  ],
}

const feedbackItem = (id, title) => ({ id, title, detail: '', acknowledged: false, note: null })

const FAKE_FEEDBACK = {
  feedback_id: '507f1f77bcf86cd799439061',
  generated_at: '2026-06-01T00:00:00Z',
  strengths: [feedbackItem('s1', 'Strong Communication'), feedbackItem('s2', 'Fast Learner')],
  improvements: [feedbackItem('i1', 'System Design Depth'), feedbackItem('i2', 'Edge Case Handling')],
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
  await page.route('**/api/interviewer-stats**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_STATS) })
  )
  await page.route('**/api/interviewer-feedback', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_FEEDBACK) })
  )
}

// ── US35: View Interview Performance Statistics ────────────────────────────────
// Stats come from GET /api/interviewer-stats, mocked with FAKE_STATS.

test('US35 - profile page loads with the interviewer name displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Interviewer User' })).toBeVisible()
})

test('US35 - TOTAL INTERVIEWS stat label is shown', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('TOTAL INTERVIEWS')).toBeVisible()
})

test('US35 - total interviews count value is displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('20', { exact: true })).toBeVisible()
})

test('US35 - AVERAGE CANDIDATE SCORE stat label is shown', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('AVERAGE CANDIDATE SCORE')).toBeVisible()
})

test('US35 - average score value is displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('7.4', { exact: true })).toBeVisible()
})

test('US35 - SCORE TRENDS label and bar chart are rendered', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('SCORE TRENDS')).toBeVisible()
  // Axis labels from FAKE_STATS.score_trend
  await expect(page.getByText('Jan', { exact: true })).toBeVisible()
  await expect(page.getByText('Now', { exact: true })).toBeVisible()
})

// ── US33/34: Interviewer Feedback on Profile ──────────────────────────────────
// Strengths and Improvements come from GET /api/interviewer-feedback,
// mocked with FAKE_FEEDBACK.

test('US34 - Strengths section heading is visible on the profile page', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Strengths' })).toBeVisible()
})

test('US34 - strength items from the API are rendered', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('Strong Communication')).toBeVisible()
  await expect(page.getByText('Fast Learner')).toBeVisible()
})

test('US34 - Improvements section heading is visible on the profile page', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Improvements' })).toBeVisible()
})

test('US34 - improvement items from the API are rendered', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('System Design Depth')).toBeVisible()
  await expect(page.getByText('Edge Case Handling')).toBeVisible()
})

test('US35 - role label is displayed correctly on the profile card', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  // "interviewer" → formatted as "Interviewer"
  await expect(page.getByRole('main').getByText('Interviewer', { exact: true })).toBeVisible()
})

test('US35 - user email is displayed on the profile card', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('interviewer@testcompany.com')).toBeVisible()
})
