import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/common/Sidebar', () => ({
  default: () => <div>Sidebar</div>,
}))

vi.mock('../components/job-candidate/JobFormModal', () => ({
  default: () => null,
}))

vi.mock('../components/job-candidate/StartInterviewModal', () => ({
  default: () => null,
}))

vi.mock('../components/job-candidate/DeleteCandidateModal', () => ({
  default: () => null,
}))

vi.mock('../components/job-candidate/TableControls', () => ({
  SortMenu: () => null,
  FilterMenu: () => null,
  makeSorter: () => null,
}))

vi.mock('../lib/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { comp_id: 'company-123' } }),
}))

import JobDetailPage from '../pages/JobDetailPage.jsx'

describe('JobDetailPage', () => {
  beforeEach(() => {
    localStorage.setItem('smartrecruit.auth', JSON.stringify({ token: 'token-123', user: { comp_id: 'company-123' } }))
    global.fetch = vi.fn((url, options = {}) => {
      if (url === '/api/jobs/123') {
        options;
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: '123', title: 'Senior Engineer', candidates_total: 3 }),
        })
      }
      if (url === '/api/jobs/123/candidates') {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sends auth headers when loading the job and its candidates', async () => {
    render(
      <MemoryRouter initialEntries={['/jobs/123']}>
        <Routes>
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/jobs/123',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      })
    )

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/jobs/123/candidates',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      })
    )
  })
})
