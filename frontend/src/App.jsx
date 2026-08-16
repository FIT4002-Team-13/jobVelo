import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext.jsx'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import CreateCompanyPage from './pages/CreateCompanyPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'
import CvAnalysisPage from './pages/CvAnalysisPage'
import InterviewPage from './pages/InterviewPage'
import CandidateDetailPage from './pages/CandidateDetailPage.jsx'
import ApplicationsPage from './pages/ApplicationsPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      {/* Opt in to React Router v7 behaviour early to silence the deprecation
          warnings printed on every page load. These flags only affect timing
          (startTransition) + splat-route resolution; nothing in our routes
          uses splats today so the behaviour is identical. */}
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/create-company" element={<CreateCompanyPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <RequireAuth>
                <RequireRole allow={['admin']} fallback="/dashboard">
                  <AdminDashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/jobs"
            element={
              <RequireAuth>
                <JobsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <RequireAuth>
                <JobDetailPage />
              </RequireAuth>
            }
          />
          {/* CV analysis report, keyed by the job-candidate link. Deep-
              linkable: the page fetches the analysis by :jobcandId, so the
              candidate page's "View" button can navigate straight here. */}
          <Route
            path="/cv-analysis/:jobcandId"
            element={
              <RequireAuth>
                <CvAnalysisPage />
              </RequireAuth>
            }
          />
          <Route
            path="/interview/:id"
            element={
              <RequireAuth>
                <InterviewPage />
              </RequireAuth>
            }
          />
          <Route path="/candidates/:candId/:jobId" element={<CandidateDetailPage />} />
          <Route path="/candidates" element={<ApplicationsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
