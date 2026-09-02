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

const FAKE_INTERVIEWER = {
  userid: '507f1f77bcf86cd799439013',
  username: 'intervieweruser',
  full_name: 'Interviewer User',
  email: 'interviewer@testcompany.com',
  role: 'interviewer',
  comp_id: COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_COMPANY = {
  comp_id: COMP_ID,
  comp_name: 'Test Company',
  comp_email: 'contact@testcompany.com',
  comp_industry: 'Technology',
  comp_contact: '0412345678',
  comp_website: 'https://testcompany.com',
  comp_description: 'A test company for e2e testing.',
  comp_logo: null,
  created_at: '2024-01-01T00:00:00Z',
}

// Seed localStorage before the page boots so AuthContext reads the user
// immediately (no /me round-trip needed to unblock RequireAuth).
async function seedAuthAndMockBase(page, user) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user }
  )
  // Catch-all registered first = lowest priority
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  // Specific mocks registered last = higher priority (Playwright: last-registered wins)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  )
}

async function setupAdminWithCompany(page) {
  await seedAuthAndMockBase(page, FAKE_ADMIN)
  await page.route('**/api/companies/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_COMPANY) })
  )
}

// Navigate to the Company Profile tab and wait for the form to populate.
async function goToCompanyTab(page) {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Company Profile' }).click()
  await expect(page.locator('input[name="comp_name"]')).toHaveValue(FAKE_COMPANY.comp_name)
}

// ── US3: Manage Company Profile ───────────────────────────────────────────────

test('US3 - admin sees Company Profile tab on profile page', async ({ page }) => {
  await setupAdminWithCompany(page)
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: 'Company Profile' })).toBeVisible()
})

test('US3 - non-admin user does not see Company Profile tab', async ({ page }) => {
  await seedAuthAndMockBase(page, FAKE_INTERVIEWER)
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: 'Company Profile' })).not.toBeVisible()
})

test('US3 - Company Profile tab loads and displays current company data', async ({ page }) => {
  await setupAdminWithCompany(page)
  await goToCompanyTab(page)
  await expect(page.locator('input[name="comp_name"]')).toHaveValue('Test Company')
  await expect(page.locator('input[name="comp_industry"]')).toHaveValue('Technology')
  await expect(page.locator('input[name="comp_email"]')).toHaveValue('contact@testcompany.com')
  await expect(page.locator('input[name="comp_contact"]')).toHaveValue('0412345678')
  await expect(page.locator('textarea[name="comp_description"]')).toHaveValue('A test company for e2e testing.')
})

test('US3 - clearing a required field shows validation error without hitting server', async ({ page }) => {
  let putCalled = false
  await setupAdminWithCompany(page)
  await page.route('**/api/companies/**', (route) => {
    if (route.request().method() === 'PUT') putCalled = true
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_COMPANY) })
  })
  await goToCompanyTab(page)
  await page.locator('input[name="comp_name"]').fill('')
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByText('Company name is required.')).toBeVisible()
  expect(putCalled).toBe(false)
})

test('US3 - successful save shows confirmation message', async ({ page }) => {
  await setupAdminWithCompany(page)
  await goToCompanyTab(page)
  await page.locator('input[name="comp_name"]').fill('Updated Company Name')
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByText('Changes saved successfully.')).toBeVisible()
})

test('US3 - logo upload sends PATCH request to update company logo', async ({ page }) => {
  await setupAdminWithCompany(page)
  await page.route('**/api/companies/**/logo', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...FAKE_COMPANY, comp_logo: 'company_logos/new-logo.png' }),
    })
  })
  await goToCompanyTab(page)
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/logo') && res.request().method() === 'PATCH'
    ),
    page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png-content'),
    }),
  ])
  expect(response.ok()).toBe(true)
})
