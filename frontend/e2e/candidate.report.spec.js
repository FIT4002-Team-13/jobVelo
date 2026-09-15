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

// US27: AI-generated candidate performance summary
const FAKE_CANDIDATE_REPORT = {
  summary: 'Alice demonstrated strong technical aptitude and clear communication throughout the session.',
  strengths: {
    items: [
      { point: 'Deep knowledge of distributed systems', evidence: [] },
      { point: 'Clear and structured communication',    evidence: [] },
    ],
  },
  improvements: {
    items: [
      { point: 'Limited hands-on cloud infrastructure experience', evidence: [] },
    ],
  },
  // US28: Candidate answers mapped to job requirements
  requirements_mapping: [
    { requirement: '5+ years TypeScript',   addressed: true,  justification: 'Candidate has 6 years.' },
    { requirement: 'Cloud infrastructure', addressed: false, justification: 'Candidate lacks this.' },
  ],
}

// US33/34: Interviewer feedback and questioning patterns
const FAKE_INTERVIEWER_REPORT = {
  summary: 'The interviewer asked mostly open-ended questions and covered all planned topics.',
  strengths: {
    items: [
      { point: 'Good use of open-ended questions', evidence: [] },
    ],
  },
  improvements: {
    items: [
      { point: 'Could probe deeper on system design answers', evidence: [] },
    ],
  },
  requirements_mapping: [],
}

// US21 (Bias tab): bias incidents from the session
const FAKE_BIAS_INCIDENTS = [
  { quote: 'Are you planning to start a family?', category: 'family_status', reason: 'Discriminatory question.', suggestion: 'Focus on commitment and availability instead.', timestamp: '05:30' },
]

const FAKE_RATINGS = {
  communication:    { score: 8.0, skill: 'Communication'   },
  technical_skills: { score: 7.5, skill: 'Technical Skills' },
  problem_solving:  { score: 9.0, skill: 'Problem Solving'  },
}

const FAKE_INTERVIEW = {
  intv_id:                 INTV_ID,
  intv_status:             'completed',
  cand_id:                 CAND_ID,
  job_id:                  JOB_ID,
  intv_ratings:            FAKE_RATINGS,
  intv_candidate_report:   FAKE_CANDIDATE_REPORT,
  intv_interviewer_report: FAKE_INTERVIEWER_REPORT,
  intv_bias_incidents:     FAKE_BIAS_INCIDENTS,
  intv_transcript:         [],
}

const FAKE_CANDIDATE = {
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
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route(`**/api/users**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
}

async function goToCandidatePage(page) {
  await page.goto(`/candidates/${CAND_ID}/${JOB_ID}`)
  await expect(page.getByText('Alice Smith')).toBeVisible()
}

// ── US27: AI-Generated Summary of Candidate Performance ───────────────────────

test('US27 - Reports panel heading is visible on the candidate detail page', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
})

test('US27 - Candidate tab is the default active tab', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: 'Candidate' })).toBeVisible()
})

test('US27 - AI summary text is shown on the Candidate tab', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Alice demonstrated strong technical aptitude')).toBeVisible()
})

test('US27 - Strengths section shows candidate strengths from the report', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Deep knowledge of distributed systems')).toBeVisible()
  await expect(page.getByText('Clear and structured communication')).toBeVisible()
})

test('US27 - Improvements section shows areas for development', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Limited hands-on cloud infrastructure experience')).toBeVisible()
})

// ── US28: Candidate Answers Mapped to Job Requirements ────────────────────────

test('US28 - Job Requirements section is shown on the Candidate tab', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Job Requirements')).toBeVisible()
})

test('US28 - Met requirements show a Met pill', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Met').first()).toBeVisible()
})

test('US28 - Gap requirements show a Gap pill', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('Gap').first()).toBeVisible()
})

test('US28 - Job requirement text from the report is displayed', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByText('5+ years TypeScript')).toBeVisible()
  await expect(page.getByText('Cloud infrastructure')).toBeVisible()
})

// ── US33/34: Interviewer Feedback and Questioning Patterns ────────────────────

test('US33 - Interviewer tab is visible in the Reports panel', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: 'Interviewer' })).toBeVisible()
})

test('US33 - switching to Interviewer tab shows the interviewer report summary', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await page.getByRole('button', { name: 'Interviewer' }).click()
  await expect(page.getByText('The interviewer asked mostly open-ended questions')).toBeVisible()
})

test('US34 - interviewer Strengths section is shown on the Interviewer tab', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await page.getByRole('button', { name: 'Interviewer' }).click()
  await expect(page.getByText('Good use of open-ended questions')).toBeVisible()
})

test('US34 - interviewer Improvements section is shown on the Interviewer tab', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await page.getByRole('button', { name: 'Interviewer' }).click()
  await expect(page.getByText('Could probe deeper on system design answers')).toBeVisible()
})

test('US21 - Bias tab is visible in the Reports panel', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await expect(page.getByRole('button', { name: /bias/i })).toBeVisible()
})

test('US21 - Bias tab shows a non-zero incident badge when incidents exist', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  // The tab button shows a count chip when biasIncidents.length > 0
  const biasTab = page.getByRole('button', { name: /bias/i })
  await expect(biasTab.getByText('1')).toBeVisible()
})

test('US21 - switching to Bias tab shows the flagged quote', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page)
  await goToCandidatePage(page)
  await page.getByRole('button', { name: /bias/i }).click()
  await expect(page.getByText('Are you planning to start a family?')).toBeVisible()
})

test('US27 - empty state shown on Candidate tab when no report generated yet', async ({ page }) => {
  await seedAuth(page)
  await mockCandidatePage(page, { intv_candidate_report: null })
  await goToCandidatePage(page)
  await expect(page.getByText(/no candidate report generated yet/i)).toBeVisible()
})
