import { test, expect } from '@playwright/test'

const VALID_IDENTIFIER = 'jane@testcompany.com'
const VALID_PASSWORD = 'Password1!'

const FAKE_USER = {
  userid: '507f1f77bcf86cd799439011',
  username: 'janedoe23',
  full_name: 'Jane Doe',
  email: VALID_IDENTIFIER,
  role: 'interviewer',
  comp_id: '507f1f77bcf86cd799439012',
  created_at: '2024-01-01T00:00:00Z',
}

// Mock login + a catch-all so dashboard API calls don't fail the test.
// Catch-all is registered first so the specific login mock takes priority
// (Playwright matches routes last-registered first).
async function mockLoginSuccess(page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'fake-token', user: FAKE_USER }),
    })
  )
}

// ── US2: Log In Securely ──────────────────────────────────────────────────────

test('US2 - login page loads with identifier and password fields', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Username / Email')).toBeVisible()
  await expect(page.locator('input[name="password"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
})

test('US2 - empty submission does not hit the server and stays on login page', async ({ page }) => {
  let serverCalled = false
  await page.route('**/api/auth/login', (route) => {
    serverCalled = true
    route.continue()
  })
  await page.goto('/login')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL('/login')
  expect(serverCalled).toBe(false)
})

test('US2 - wrong credentials from server shows error and stays on login page', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Incorrect username/email or password' }),
    })
  )
  await page.goto('/login')
  await page.getByLabel('Username / Email').fill(VALID_IDENTIFIER)
  await page.locator('input[name="password"]').fill(VALID_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page.getByText(/incorrect username\/email or password/i)).toBeVisible()
  await expect(page.getByLabel('Username / Email')).toBeVisible()
})

test('US2 - successful login navigates to dashboard', async ({ page }) => {
  await mockLoginSuccess(page)
  await page.goto('/login')
  await page.getByLabel('Username / Email').fill(VALID_IDENTIFIER)
  await page.locator('input[name="password"]').fill(VALID_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL('/dashboard')
})

test('US2 - landing page "Already have an account?" link navigates to login', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /already have an account/i }).click()
  await expect(page).toHaveURL('/login')
})

test('US2 - signup page "Have an account? Log In" link navigates to login', async ({ page }) => {
  await page.goto('/signup')
  await page.getByRole('link', { name: /log in/i }).click()
  await expect(page).toHaveURL('/login')
})
