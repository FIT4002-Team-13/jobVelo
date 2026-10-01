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

const FAKE_INVITATIONS = [
  {
    inv_id: '507f1f77bcf86cd799439021',
    comp_id: COMP_ID,
    code: 'INV-A1B2-C3D4',
    role: 'interviewer',
    status: 'active',
    user_id: null,
    created_at: '2024-06-01T10:00:00Z',
    used_at: null,
  },
  {
    inv_id: '507f1f77bcf86cd799439022',
    comp_id: COMP_ID,
    code: 'INV-E5F6-G7H8',
    role: 'hiring_manager',
    status: 'used',
    user_id: '507f1f77bcf86cd799439099',
    created_at: '2024-05-01T10:00:00Z',
    used_at: '2024-05-02T09:30:00Z',
  },
]

async function seedAuth(page, user) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user }
  )
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  )
}

async function setupAdminWithInvitations(page) {
  await seedAuth(page, FAKE_ADMIN)
  await page.route('**/api/invitations', (route) => {
    if (route.request().method() === 'GET')
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INVITATIONS) })
    else
      route.continue()
  })
}

// Navigate and wait for the invitation data to render before asserting.
async function goToAdminDashboard(page) {
  await page.goto('/admin/dashboard')
  await expect(page.getByText('INV-A1B2-C3D4')).toBeVisible()
}

// ── Admin Dashboard: Invitation list ─────────────────────────────────────────

test('admin dashboard loads and shows the invitation table', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  await expect(page.getByRole('columnheader', { name: /code/i })).toBeVisible()
})

test('admin dashboard renders both invitation rows', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  await expect(page.getByText('INV-A1B2-C3D4')).toBeVisible()
  await expect(page.getByText('INV-E5F6-G7H8')).toBeVisible()
})

test('admin dashboard shows active and used status badges', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  // Status badges are <span> elements inside table cells — find within the table
  // body to avoid any ambiguity with header or button text.
  const tbody = page.locator('table tbody')
  await expect(tbody.getByText('active')).toBeVisible()
  await expect(tbody.getByText('used')).toBeVisible()
})

test('admin dashboard shows role labels for each invitation', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  // Role labels appear in table cells. Scope to tbody to avoid the hidden
  // <option> elements in the role selector dropdown.
  const tbody = page.locator('table tbody')
  await expect(tbody.getByText('Interviewer')).toBeVisible()
  await expect(tbody.getByText('Hiring Manager')).toBeVisible()
})

// ── Generate invitation ───────────────────────────────────────────────────────

test('Generate Code button is visible on the admin dashboard', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('button', { name: /generate code/i })).toBeVisible()
})

test('clicking Generate Code sends POST to /api/invitations', async ({ page }) => {
  let postCalled = false
  await setupAdminWithInvitations(page)

  const NEW_INV = {
    inv_id: '507f1f77bcf86cd799439099',
    comp_id: COMP_ID,
    code: 'INV-NEW1-CODE',
    role: 'interviewer',
    status: 'active',
    user_id: null,
    created_at: new Date().toISOString(),
    used_at: null,
  }
  await page.route('**/api/invitations', (route) => {
    if (route.request().method() === 'POST') {
      postCalled = true
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(NEW_INV) })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INVITATIONS) })
    }
  })

  await goToAdminDashboard(page)
  await page.getByRole('button', { name: /generate code/i }).click()
  expect(postCalled).toBe(true)
})

test('newly generated code appears in the list after creation', async ({ page }) => {
  await setupAdminWithInvitations(page)

  const NEW_INV = {
    inv_id: '507f1f77bcf86cd799439099',
    comp_id: COMP_ID,
    code: 'INV-NEW1-CODE',
    role: 'interviewer',
    status: 'active',
    user_id: null,
    created_at: new Date().toISOString(),
    used_at: null,
  }
  await page.route('**/api/invitations', (route) => {
    if (route.request().method() === 'POST')
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(NEW_INV) })
    else
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INVITATIONS) })
  })

  await goToAdminDashboard(page)
  await page.getByRole('button', { name: /generate code/i }).click()
  await expect(page.getByText('INV-NEW1-CODE')).toBeVisible()
})

// ── Delete invitation ─────────────────────────────────────────────────────────

test('each invitation row has a Delete button', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
})

test('clicking Delete opens a confirmation modal', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await expect(page.getByRole('heading', { name: 'Delete Invitation' })).toBeVisible()
})

test('confirmation modal shows Cancel and Delete buttons', async ({ page }) => {
  await setupAdminWithInvitations(page)
  await goToAdminDashboard(page)
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' }).last()).toBeVisible()
})

test('Cancel button closes the modal without making a DELETE request', async ({ page }) => {
  let deleteCalled = false
  await setupAdminWithInvitations(page)
  await page.route('**/api/invitations/**', (route) => {
    if (route.request().method() === 'DELETE') deleteCalled = true
    route.fulfill({ status: 204 })
  })

  await goToAdminDashboard(page)
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Delete Invitation' })).not.toBeVisible()
  expect(deleteCalled).toBe(false)
})

test('confirming delete sends DELETE to /api/invitations/:id', async ({ page }) => {
  let deleteCalled = false
  await setupAdminWithInvitations(page)
  await page.route('**/api/invitations/**', (route) => {
    if (route.request().method() === 'DELETE') {
      deleteCalled = true
      route.fulfill({ status: 204 })
    } else {
      route.continue()
    }
  })

  await goToAdminDashboard(page)
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  expect(deleteCalled).toBe(true)
})

// ── Access control ────────────────────────────────────────────────────────────

test('non-admin user sees the access-restricted page', async ({ page }) => {
  // RequireRole renders ErrorPage(403) before AdminDashboardPage mounts,
  // so no API mock is needed - the role check is pure client-side.
  await seedAuth(page, FAKE_INTERVIEWER)
  await page.goto('/admin/dashboard')
  await expect(page.getByText('Access restricted')).toBeVisible()
})
