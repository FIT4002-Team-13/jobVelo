import { test, expect } from '@playwright/test'

const COMP_ID = '507f1f77bcf86cd799439012'

const FAKE_ADMIN = {
  userid: '507f1f77bcf86cd799439011',
  username: 'adminuser',
  full_name: 'Admin User',
  email: 'admin@testcompany.com',
  role: 'admin',
  comp_id: COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_JOB = {
  id: '507f1f77bcf86cd799439020',
  comp_id: COMP_ID,
  title: 'Senior Software Engineer',
  description: '',
  employment_type: ['Full-time'],
  recruitment_start: '2025-01-01',
  recruitment_end: '2025-12-31',
  candidates_total: 1,
  candidates_filled: 0,
  salary: '',
  salary_type: '',
  status: 'Pending',
  interviewers: [],
  job_created_at: '2025-01-01T00:00:00Z',
  job_last_update_datetime: '2025-01-01T00:00:00Z',
}

// Seed localStorage before the page boots and register a catch-all so
// unrelated API calls don't hang or error during the test.
async function seedAuth(page) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_ADMIN }
  )
  // Catch-all registered first = lowest priority
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  // Specific mocks registered last = higher priority (last-registered wins)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ADMIN) })
  )
}

// Navigate to /jobs and open the Create Job modal.
async function openCreateModal(page) {
  await page.goto('/jobs')
  await page.getByRole('button', { name: /create job/i }).click()
  await expect(page.getByRole('heading', { name: 'Create Job Posting' })).toBeVisible()
}

// ── US4: Job Posting ──────────────────────────────────────────────────────────

test('US4 - jobs page loads with Create Job button visible', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/jobs')
  await expect(page.getByRole('button', { name: /create job/i })).toBeVisible()
})

test('US4 - clicking Create Job opens the job creation modal', async ({ page }) => {
  await seedAuth(page)
  await openCreateModal(page)
  await expect(page.getByRole('button', { name: /publish/i })).toBeVisible()
})

test('US4 - submitting without title shows validation error without hitting server', async ({ page }) => {
  let postCalled = false
  await seedAuth(page)
  await page.route('**/api/jobs', (route) => {
    if (route.request().method() === 'POST') postCalled = true
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  })
  await openCreateModal(page)
  // Fill all other required fields but leave title blank
  await page.locator('input[type="date"]').first().fill('2025-01-01')
  await page.locator('input[type="date"]').last().fill('2025-12-31')
  await page.getByLabel('Full-time').check()
  await page.getByRole('button', { name: /publish/i }).click()
  await expect(page.getByText('Job title is required.')).toBeVisible()
  expect(postCalled).toBe(false)
})

test('US4 - submitting without employment type shows validation error without hitting server', async ({ page }) => {
  let postCalled = false
  await seedAuth(page)
  await page.route('**/api/jobs', (route) => {
    if (route.request().method() === 'POST') postCalled = true
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
  })
  await openCreateModal(page)
  await page.locator('input[placeholder="eg. Senior Software Engineer"]').fill('Senior Software Engineer')
  await page.locator('input[type="date"]').first().fill('2025-01-01')
  await page.locator('input[type="date"]').last().fill('2025-12-31')
  // Deliberately skip all employment type checkboxes
  await page.getByRole('button', { name: /publish/i }).click()
  await expect(page.getByText('Select at least one employment type.')).toBeVisible()
  expect(postCalled).toBe(false)
})

test('US4 - valid form submission publishes the job and shows success toast', async ({ page }) => {
  await seedAuth(page)
  await page.route('**/api/jobs', (route) => {
    if (route.request().method() === 'POST')
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(FAKE_JOB) })
    else
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await openCreateModal(page)
  await page.locator('input[placeholder="eg. Senior Software Engineer"]').fill('Senior Software Engineer')
  await page.locator('input[type="date"]').first().fill('2025-01-01')
  await page.locator('input[type="date"]').last().fill('2025-12-31')
  await page.getByLabel('Full-time').check()
  await page.getByRole('button', { name: /publish/i }).click()
  // Toast: 'Job "Senior Software Engineer" created.'
  await expect(page.getByText(/senior software engineer.*created/i)).toBeVisible()
})

test('US4 - dashboard View All link navigates to jobs page', async ({ page }) => {
  await seedAuth(page)
  await page.goto('/dashboard')
  // Wait for dashboard content to load
  await expect(page.getByRole('link', { name: /view all/i }).first()).toBeVisible()
  // The Jobs panel's "View All" link (first on page) leads to /jobs
  await page.getByRole('link', { name: /view all/i }).first().click()
  await expect(page).toHaveURL('/jobs')
})
