import { test, expect } from '@playwright/test'

const COMP_ID    = '507f1f77bcf86cd799439012'
const JOBCAND_ID = '507f1f77bcf86cd799439041'

const FAKE_INTERVIEWER = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'intervieweruser',
  full_name: 'Interviewer User',
  email:     'interviewer@testcompany.com',
  role:      'interviewer',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

// A fully completed CV analysis document.
const FAKE_ANALYSIS = {
  analysis_id:    '507f1f77bcf86cd799439099',
  jobcand_id:     JOBCAND_ID,
  status:         'completed',
  candidate_name: 'Alice Smith',
  position_title: 'Senior Software Engineer',
  position_fit: {
    relevant_experience: 8.2,
    technical_fit:       7.5,
    soft_skills:         8.8,
  },
  key_strengths: [
    'Strong TypeScript proficiency',
    'Experience with distributed systems',
  ],
  improvements: [
    'Limited cloud infrastructure exposure',
  ],
  inconsistencies: [
    'Gap between 2022 and 2023 not explained',
  ],
  interview_questions: [
    { question: 'Describe your experience with distributed systems.', category: 'technical', rationale: 'Relevant to role' },
  ],
  cv_path: null,
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

async function goToAnalysis(page, analysis = FAKE_ANALYSIS) {
  await page.route(`**/api/cv-analysis/by-jobcand/${JOBCAND_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysis) })
  )
  await page.goto(`/cv-analysis/${JOBCAND_ID}`)
  await expect(page.getByRole('heading', { name: /candidate cv\/resume/i })).toBeVisible()
}

// ── US10: CV Analysis ─────────────────────────────────────────────────────────

test('US10 - page renders candidate name and position title', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await expect(page.getByText('Alice Smith')).toBeVisible()
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
})

test('US10 - Position Fit Summary section is visible', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await expect(page.getByText('Position Fit Summary')).toBeVisible()
})

test('US10 - all three score bar labels are rendered', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await expect(page.getByText('Relevant Experience')).toBeVisible()
  await expect(page.getByText('Technical Fit')).toBeVisible()
  await expect(page.getByText('Soft Skills')).toBeVisible()
})

test('US10 - score values from the API are displayed', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  // Values are formatted to one decimal place (e.g. 8.2, 7.5, 8.8)
  await expect(page.getByText('8.2')).toBeVisible()
  await expect(page.getByText('7.5')).toBeVisible()
  await expect(page.getByText('8.8')).toBeVisible()
})

test('US10 - fit verdict chip is shown (Strong fit for avg >= 7.5)', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  // Average of 8.2, 7.5, 8.8 = 8.17 → Strong fit
  await expect(page.getByText('Strong fit')).toBeVisible()
})

test('US10 - Moderate fit verdict for average between 4.5 and 7.5', async ({ page }) => {
  await seedAuth(page)
  const moderateAnalysis = {
    ...FAKE_ANALYSIS,
    position_fit: { relevant_experience: 6.0, technical_fit: 5.5, soft_skills: 6.0 },
  }
  await goToAnalysis(page, moderateAnalysis)
  await expect(page.getByText('Moderate fit')).toBeVisible()
})

test('US10 - Weak fit verdict for average below 4.5', async ({ page }) => {
  await seedAuth(page)
  const weakAnalysis = {
    ...FAKE_ANALYSIS,
    position_fit: { relevant_experience: 3.0, technical_fit: 2.0, soft_skills: 4.0 },
  }
  await goToAnalysis(page, weakAnalysis)
  await expect(page.getByText('Weak fit')).toBeVisible()
})

test('US10 - Strengths tab is active by default and shows items', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await expect(page.getByRole('button', { name: 'Strengths' })).toBeVisible()
  await expect(page.getByText('Strong TypeScript proficiency')).toBeVisible()
})

test('US10 - switching to Improvements tab shows improvement items', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await page.getByRole('button', { name: 'Improvements' }).click()
  await expect(page.getByText('Limited cloud infrastructure exposure')).toBeVisible()
})

test('US10 - switching to Inconsistencies tab shows flagged items', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await page.getByRole('button', { name: 'Inconsistencies' }).click()
  await expect(page.getByText(/gap between 2022 and 2023/i)).toBeVisible()
})

test('US10 - Suggested Interview Questions section renders pre-interview questions', async ({ page }) => {
  await seedAuth(page)
  await goToAnalysis(page)
  await expect(page.getByText('Suggested Interview Questions')).toBeVisible()
  await expect(page.getByText('Describe your experience with distributed systems.')).toBeVisible()
})

test('US10 - processing state shows spinner and informational message', async ({ page }) => {
  await seedAuth(page)
  await page.route(`**/api/cv-analysis/by-jobcand/${JOBCAND_ID}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...FAKE_ANALYSIS, status: 'processing' }),
    })
  )
  await page.goto(`/cv-analysis/${JOBCAND_ID}`)
  await expect(page.getByText(/analysing the cv/i)).toBeVisible()
})

test('US10 - failed state shows error message and back button', async ({ page }) => {
  await seedAuth(page)
  await page.route(`**/api/cv-analysis/by-jobcand/${JOBCAND_ID}`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...FAKE_ANALYSIS, status: 'failed', error: 'PDF parse failed' }),
    })
  )
  await page.goto(`/cv-analysis/${JOBCAND_ID}`)
  await expect(page.getByText(/cv analysis failed/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /back/i })).toBeVisible()
})

test('US10 - 404 from API shows appropriate error message', async ({ page }) => {
  await seedAuth(page)
  await page.route(`**/api/cv-analysis/by-jobcand/${JOBCAND_ID}`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) })
  )
  await page.goto(`/cv-analysis/${JOBCAND_ID}`)
  await expect(page.getByText(/no cv analysis exists/i)).toBeVisible()
})
