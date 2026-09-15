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

// ── US35: View Interview Performance Statistics ────────────────────────────────
// NOTE: The stats panel currently renders hardcoded data (as noted in the
// source: "// Note: Stats are hardcoded for now but will be created by US35").
// These tests verify that the UI structure is correctly rendered so the page
// is ready for the real data wiring.

test('US35 - profile page loads with the interviewer name displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('Interviewer User')).toBeVisible()
})

test('US35 - TOTAL INTERVIEWS stat label is shown', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('TOTAL INTERVIEWS')).toBeVisible()
})

test('US35 - total interviews count value is displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  // Hardcoded value is 20
  await expect(page.getByText('20')).toBeVisible()
})

test('US35 - AVERAGE CANDIDATE SCORE stat label is shown', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('AVERAGE CANDIDATE SCORE')).toBeVisible()
})

test('US35 - average score value is displayed', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  // Hardcoded value is 7.4
  await expect(page.getByText('7.4')).toBeVisible()
})

test('US35 - SCORE TRENDS label and bar chart are rendered', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('SCORE TRENDS')).toBeVisible()
  // Month labels from the hardcoded stats array
  await expect(page.getByText('Jan')).toBeVisible()
  await expect(page.getByText('Now')).toBeVisible()
})

// ── US33/34: Interviewer Feedback on Profile ──────────────────────────────────
// NOTE: Strengths and Improvements are hardcoded on the Profile page until
// US34 wires them to real LLM-generated data. These tests verify the UI
// scaffold is correctly rendered.

test('US34 - Strengths section heading is visible on the profile page', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Strengths' })).toBeVisible()
})

test('US34 - hardcoded strength items are rendered', async ({ page }) => {
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

test('US34 - hardcoded improvement items are rendered', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('System Design Depth')).toBeVisible()
  await expect(page.getByText('Edge Case Handling')).toBeVisible()
})

test('US35 - role label is displayed correctly on the profile card', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  // "interviewer" → formatted as "Interviewer"
  await expect(page.getByText('Interviewer')).toBeVisible()
})

test('US35 - user email is displayed on the profile card', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/profile')
  await expect(page.getByText('interviewer@testcompany.com')).toBeVisible()
})
