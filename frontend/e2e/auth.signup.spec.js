import { test, expect } from '@playwright/test'

const VALID_CODE = 'INV-TEST-0001'
const VALID_FORM = {
  full_name: 'Jane Doe',
  username: 'janedoe23',
  email: 'jane@testcompany.com',
  password: 'Password1!',
}

// Mock the two backend calls signup needs so tests run without a live DB.
async function mockSignupApis(page) {
  await page.route('**/api/auth/check-code/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, comp_name: 'Test Co', role: 'interviewer' }),
    })
  )
  await page.route('**/api/auth/signup', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
  )
}

async function fillStep2(page, overrides = {}) {
  const values = { ...VALID_FORM, ...overrides }
  await page.getByLabel('Full name').fill(values.full_name)
  await page.getByLabel('Username').fill(values.username)
  await page.getByLabel('Email').fill(values.email)
  await page.locator('input[name="password"]').fill(values.password)
  await page.locator('input[name="confirm"]').fill(overrides.confirm ?? values.password)
}

// ── US1: Create Account ───────────────────────────────────────────────────────

test('US1 - signup page loads with invitation code field', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByLabel('Invitation code')).toBeVisible()
  await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()
})

test('US1 - badly formatted code shows client-side error without hitting server', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill('NOTACODE')
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByText(/INV-XXXX-XXXX/)).toBeVisible()
})

test('US1 - invalid code from server shows error and stays on step 1', async ({ page }) => {
  await page.route('**/api/auth/check-code/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: false }),
    })
  )
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill(VALID_CODE)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByText(/invalid or has already been used/i)).toBeVisible()
  await expect(page.getByLabel('Invitation code')).toBeVisible()
})

test('US1 - valid code advances to step 2 and shows company name', async ({ page }) => {
  await mockSignupApis(page)
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill(VALID_CODE)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByText('Test Co')).toBeVisible()
  await expect(page.getByLabel('Full name')).toBeVisible()
})

test('US1 - role field is read-only on step 2', async ({ page }) => {
  await mockSignupApis(page)
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill(VALID_CODE)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByText('Interviewer')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /role/i })).not.toBeVisible()
})

test('US1 - mismatched passwords shows error', async ({ page }) => {
  await mockSignupApis(page)
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill(VALID_CODE)
  await page.getByRole('button', { name: /continue/i }).click()
  await fillStep2(page, { confirm: 'DifferentPass1!' })
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page.getByText(/passwords do not match/i)).toBeVisible()
})

test('US1 - successful signup navigates to login page', async ({ page }) => {
  await mockSignupApis(page)
  await page.goto('/signup')
  await page.getByLabel('Invitation code').fill(VALID_CODE)
  await page.getByRole('button', { name: /continue/i }).click()
  await fillStep2(page)
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page).toHaveURL('/login')
})
