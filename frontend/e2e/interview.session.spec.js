import { test, expect } from '@playwright/test'

const COMP_ID  = '507f1f77bcf86cd799439012'
const JOB_ID   = '507f1f77bcf86cd799439020'
const CAND_ID  = '507f1f77bcf86cd799439031'
const INTV_ID  = '507f1f77bcf86cd799439051'

const FAKE_INTERVIEWER = {
  userid:    '507f1f77bcf86cd799439011',
  username:  'intervieweruser',
  full_name: 'Interviewer User',
  email:     'interviewer@testcompany.com',
  role:      'interviewer',
  comp_id:   COMP_ID,
  created_at: '2024-01-01T00:00:00Z',
}

const FAKE_SECTIONS = [
  { name: 'Introduction', description: 'Opening remarks and rapport building.', suggested_minutes: 10, start_at: null },
  { name: 'Technical Assessment', description: 'Core technical questions.', suggested_minutes: 30, start_at: null },
  { name: 'Behavioural', description: 'Situation and outcome questions.', suggested_minutes: 15, start_at: null },
]

// Server-side transcript entries - loaded when the interview is already in_progress
const FAKE_TRANSCRIPT = [
  { id: '1', speaker: 'Interviewer User', timestamp: '00:10', text: 'Can you walk me through your background?' },
  { id: '2', speaker: 'Candidate', timestamp: '00:30', text: 'Sure, I have 5 years of experience in full-stack development.' },
]

// The interview is already in_progress so the live workspace shows immediately.
const FAKE_INTERVIEW = {
  intv_id:              INTV_ID,
  intv_status:          'in_progress',
  cand_id:              CAND_ID,
  job_id:               JOB_ID,
  intv_date_time:       '2027-09-20T14:00:00Z',
  intv_duration_seconds: 120,
  intv_sections:        FAKE_SECTIONS,
  intv_transcript:      FAKE_TRANSCRIPT,
}

const FAKE_QUESTIONS = {
  questions: [
    { category: 'technical',   question: 'How do you handle race conditions in distributed systems?', reason: 'Tests systems knowledge.' },
    { category: 'behavioural', question: 'Describe a time you resolved a conflict on your team.',   reason: 'Assesses interpersonal skills.' },
  ],
}

async function seedAuth(page) {
  await page.addInitScript(
    (auth) => localStorage.setItem('smartrecruit.auth', JSON.stringify(auth)),
    { token: 'fake-token', user: FAKE_INTERVIEWER }
  )
  // Block real media device access so the page doesn't hang waiting for mic
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia:    () => Promise.reject(new Error('no mic in test')),
        getDisplayMedia: () => Promise.reject(new Error('no screen in test')),
      },
      writable: true,
    })
    // Prevent real WebSocket connections to the transcription endpoint
    const RealWS = window.WebSocket
    window.WebSocket = class FakeWebSocket {
      constructor(url) { if (url.includes('transcribe')) { this.binaryType = 'arraybuffer' } else { return new RealWS(url) } }
      send() {}
      close() {}
      set onopen(fn)    {}
      set onmessage(fn) {}
      set onerror(fn)   {}
      set onclose(fn)   {}
    }
  })
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INTERVIEWER) })
  )
}

async function mockInterviewSession(page, interviewOverride = {}) {
  const interview = { ...FAKE_INTERVIEW, ...interviewOverride }
  await page.route(`**/api/interviews/${INTV_ID}`, (route) => {
    if (route.request().method() === 'GET' || route.request().method() === 'PATCH')
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(interview) })
    else
      route.continue()
  })
  await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: JOB_ID, title: 'Senior Software Engineer', description: '' }) })
  )
  await page.route(`**/api/candidates/${CAND_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cand_id: CAND_ID, cand_full_name: 'Alice Smith' }) })
  )
  await page.route(`**/api/job-candidates/by-candidate/${CAND_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/interviews/generate-plan', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SECTIONS) })
  )
  await page.route(`**/api/interview-questions/${JOB_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_QUESTIONS) })
  )
}

async function goToLiveSession(page) {
  await page.goto(`/interview/${INTV_ID}`)
  // Wait for the candidate name to appear (confirms the interview data loaded)
  await expect(page.getByText('Alice Smith')).toBeVisible()
}

// ── US16: Real-Time Transcription ─────────────────────────────────────────────

test('US16 - interview page loads in live mode with transcript panel visible', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // The transcript panel renders in the live workspace
  await expect(page.getByText(/transcript/i).first()).toBeVisible()
})

test('US16 - server-seeded transcript entries are displayed on load', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // FAKE_TRANSCRIPT entries loaded from the server are shown in the panel
  await expect(page.getByText('Can you walk me through your background?')).toBeVisible()
  await expect(page.getByText('Sure, I have 5 years of experience in full-stack development.')).toBeVisible()
})

test('US16 - speaker labels distinguish interviewer from candidate', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('Interviewer User')).toBeVisible()
  await expect(page.getByText('Candidate')).toBeVisible()
})

test('US16 - timestamps are shown alongside each transcript entry', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('00:10')).toBeVisible()
  await expect(page.getByText('00:30')).toBeVisible()
})

// ── US22: Time Tracker for Each Interview Section ─────────────────────────────

test('US22 - Interview Sections panel is visible in the live workspace', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('Interview Sections')).toBeVisible()
})

test('US22 - section cards render for each section in the interview plan', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('Introduction')).toBeVisible()
  await expect(page.getByText('Technical Assessment')).toBeVisible()
  await expect(page.getByText('Behavioural')).toBeVisible()
})

test('US22 - section timer display (MM:SS format) is shown on the active section card', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // First section auto-starts on load; timer shows in MM:SS format
  // The budget for Introduction is 10m = "/ 10:00"
  await expect(page.getByText('/ 10:00')).toBeVisible()
})

test('US22 - section budget labels are shown for each section', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // suggested_minutes shown as e.g. "10m", "30m", "15m"
  await expect(page.getByText('10m')).toBeVisible()
  await expect(page.getByText('30m')).toBeVisible()
  await expect(page.getByText('15m')).toBeVisible()
})

// ── US20: Suggested Technical and Behavioural Questions ──────────────────────

test('US20 - suggested questions panel is visible in the live workspace', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // Questions panel heading
  await expect(page.getByText(/suggested questions/i)).toBeVisible()
})

test('US20 - question cards render after the API returns questions', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('How do you handle race conditions in distributed systems?')).toBeVisible()
  await expect(page.getByText('Describe a time you resolved a conflict on your team.')).toBeVisible()
})

test('US20 - question cards are labelled with their category (Technical / Behavioural)', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByText('Technical')).toBeVisible()
  await expect(page.getByText('Behavioural')).toBeVisible()
})

test('US20 - Ignore button is visible on question cards', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByRole('button', { name: 'Ignore' }).first()).toBeVisible()
})

test('US20 - More like this button is visible on question cards', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await expect(page.getByRole('button', { name: 'More like this' }).first()).toBeVisible()
})

// ── US26: Note Attachment to Transcription ────────────────────────────────────

test('US26 - each transcript entry has a note toggle button', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  // The note button (title="Add note") is next to each transcript line
  const noteButton = page.getByTitle('Add note').first()
  await expect(noteButton).toBeVisible()
})

test('US26 - clicking the note button reveals an inline note editor', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await page.getByTitle('Add note').first().click()
  await expect(page.getByPlaceholder('Add a note…')).toBeVisible()
})

test('US26 - typing a note and saving sends a PATCH to the interviews endpoint', async ({ page }) => {
  let patchCalled = false
  await seedAuth(page)
  await mockInterviewSession(page)
  await page.route(`**/api/interviews/${INTV_ID}`, (route) => {
    if (route.request().method() === 'PATCH') patchCalled = true
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_INTERVIEW) })
  })
  await goToLiveSession(page)
  await page.getByTitle('Add note').first().click()
  await page.getByPlaceholder('Add a note…').fill('Good answer on concurrency.')
  await page.getByRole('button', { name: 'Save note' }).click()
  expect(patchCalled).toBe(true)
})

test('US26 - after saving, the button title updates to "Edit note"', async ({ page }) => {
  await seedAuth(page)
  await mockInterviewSession(page)
  await goToLiveSession(page)
  await page.getByTitle('Add note').first().click()
  await page.getByPlaceholder('Add a note…').fill('Note content.')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByTitle('Edit note').first()).toBeVisible()
})
