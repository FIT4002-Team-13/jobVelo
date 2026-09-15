import { test, expect } from '@playwright/test'

const COMP_ID = '507f1f77bcf86cd799439012'
const JOB_ID  = '507f1f77bcf86cd799439020'

const FAKE_ADMIN = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'adminuser',
  full_name: 'Admin User',
  email:     'admin@testcompany.com',
  role:      'admin',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_JOB = {
  id:                     JOB_ID,
  comp_id:                COMP_ID,
  title:                  'Senior Software Engineer',
  description:            'We are looking for a great engineer.',
  employment_type:        ['Full-time'],
  recruitment_start:      '2025-01-01',
  recruitment_end:        '2027-12-31',
  candidates_total:       5,
  candidates_filled:      1,
  salary:                 '',
  salary_type:            '',
  status:                 'In Progress',
  interviewers:           [],
  job_created_at:         '2025-01-01T00:00:00Z',
  job_last_update_datetime: '2025-01-01T00:00:00Z',
}

const FAKE_CREATED_CANDIDATE = {
  candidate: { cand_id: '507f1f77bcf86cd799439099', cand_full_name: 'New Candidate', cand_email: 'new@example.com' },
  job_candidate: { jobcand_id: '507f1f77bcf86cd799439098', job_id: JOB_ID },
}

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
  await page.route('**/api/users**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
}

async function openAddCandidateForm(page) {
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
  await page.getByRole('button', { name: /add candidate/i }).click()
  await expect(page.getByRole('heading', { name: 'Add Candidate' })).toBeVisible()
}

// ── US6: Upload CV and Cover Letter ──────────────────────────────────────────

test('US6 - Add Candidate button is visible on the job detail page', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.goto(`/jobs/${JOB_ID}`)
  await expect(page.getByText('Senior Software Engineer')).toBeVisible()
  await expect(page.getByRole('button', { name: /add candidate/i })).toBeVisible()
})

test('US6 - clicking Add Candidate opens the modal', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await openAddCandidateForm(page)
  await expect(page.getByRole('heading', { name: 'Add Candidate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()
})

test('US6 - submitting without name shows client-side error without hitting server', async ({ page }) => {
  let serverCalled = false
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route('**/api/candidates/create-for-job', (route) => {
    serverCalled = true
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(FAKE_CREATED_CANDIDATE) })
  })
  await openAddCandidateForm(page)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(/candidate name is required/i)).toBeVisible()
  expect(serverCalled).toBe(false)
})

test('US6 - submitting with invalid email shows email error without hitting server', async ({ page }) => {
  let serverCalled = false
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route('**/api/candidates/create-for-job', (route) => {
    serverCalled = true
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(FAKE_CREATED_CANDIDATE) })
  })
  await openAddCandidateForm(page)
  await page.getByPlaceholder('eg. John Doe').fill('John Doe')
  await page.getByPlaceholder('eg. johndoe123@gmail.com').fill('not-an-email')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(/valid email/i)).toBeVisible()
  expect(serverCalled).toBe(false)
})

test('US6 - attaching a CV file shows the filename in the dropzone', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await openAddCandidateForm(page)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-fake'),
  })
  await expect(page.getByText('resume.pdf')).toBeVisible()
})

test('US6 - attaching a cover letter file shows the filename', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await openAddCandidateForm(page)
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: 'cover-letter.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-fake'),
  })
  await expect(page.getByText('cover-letter.pdf')).toBeVisible()
})

test('US6 - valid submission POSTs to create-for-job with correct body', async ({ page }) => {
  let capturedBody = null
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route('**/api/candidates/create-for-job', (route) => {
    capturedBody = route.request().postDataJSON()
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(FAKE_CREATED_CANDIDATE) })
  })
  await openAddCandidateForm(page)
  await page.getByPlaceholder('eg. John Doe').fill('New Candidate')
  await page.getByPlaceholder('eg. johndoe123@gmail.com').fill('new@example.com')
  await page.getByRole('button', { name: 'Add' }).click()
  expect(capturedBody?.cand_full_name).toBe('New Candidate')
  expect(capturedBody?.cand_email).toBe('new@example.com')
  expect(capturedBody?.job_id).toBe(JOB_ID)
})

test('US6 - successful submission closes the modal and shows success toast', async ({ page }) => {
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route('**/api/candidates/create-for-job', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(FAKE_CREATED_CANDIDATE) })
  )
  await openAddCandidateForm(page)
  await page.getByPlaceholder('eg. John Doe').fill('New Candidate')
  await page.getByPlaceholder('eg. johndoe123@gmail.com').fill('new@example.com')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('heading', { name: 'Add Candidate' })).not.toBeVisible()
  await expect(page.getByText(/new candidate.*added/i)).toBeVisible()
})

test('US6 - cancelling the form closes the modal without hitting server', async ({ page }) => {
  let serverCalled = false
  await seedAuth(page)
  await mockJobDetail(page)
  await page.route('**/api/candidates/create-for-job', (route) => {
    serverCalled = true
    route.continue()
  })
  await openAddCandidateForm(page)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Add Candidate' })).not.toBeVisible()
  expect(serverCalled).toBe(false)
})
