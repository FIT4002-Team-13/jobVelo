import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext.jsx'
import { ToastProvider } from './components/common/ToastContext.jsx'
import RequireAuth from './components/auth/RequireAuth.jsx'
import RequireRole from './components/auth/RequireRole.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import CreateCompanyPage from './pages/CreateCompanyPage.jsx'
import ErrorPage, { AppErrorBoundary } from './pages/ErrorPage.jsx'


// Pages load on demand so the first visit only downloads the shell, the
// landing/login pages and the page being opened (not every page up front).
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const SchedulesPage = lazy(() => import('./pages/SchedulesPage.jsx'))
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.jsx'))
const CompanyProfilePage = lazy(() => import('./pages/CompanyProfilePage.jsx'))
const JobsPage = lazy(() => import('./pages/JobsPage'))
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'))
const Profile = lazy(() => import('./pages/ProfilePage.jsx'))
const CvAnalysisPage = lazy(() => import('./pages/CvAnalysisPage'))
const InterviewPage = lazy(() => import('./pages/InterviewPage'))
const CandidatePage = lazy(() => import('./pages/CandidatePage.jsx'))
const CandidateDetailPage = lazy(() => import('./pages/CandidateDetailPage.jsx'))
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage.jsx'))
const InterviewConsistencyPage = lazy(() => import('./pages/InterviewConsistencyPage.jsx'))
const UserGuidePage = lazy(() => import('./pages/UserGuidePage.jsx'))

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      {/* Opt in to React Router v7 behaviour early to silence the deprecation
          warnings printed on every page load. These flags only affect timing
          (startTransition) + splat-route resolution; nothing in our routes
          uses splats today so the behaviour is identical. */}
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {/* Any component that throws during render shows the friendly 500
            screen instead of React's blank white page. */}
        <AppErrorBoundary>
        <Suspense fallback={<PageFallback />}>
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
                <RequireRole allow={['admin']}>
                  <AdminDashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/company"
            element={
              <RequireAuth>
                <RequireRole allow={['admin']}>
                  <CompanyProfilePage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/schedules"
            element={
              <RequireAuth>
                <SchedulesPage />
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
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
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
                <CandidatePage />
              </RequireAuth>
            }
          />
          <Route
            path="/interview/:id/live"
            element={
              <RequireAuth>
                <InterviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/candidates/:candId/:jobId"
            element={
              <RequireAuth>
                <CandidateDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/candidates"
            element={
              <RequireAuth>
                <ApplicationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/interview-consistency"
            element={
              <RequireAuth>
                <RequireRole allow={['hiring_manager']}>
                  <InterviewConsistencyPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/user-guide"
            element={
              <RequireAuth>
                <UserGuidePage />
              </RequireAuth>
            }
          />
          {/* Catch-all: any route not declared above lands on the 404. */}
          <Route path="*" element={<ErrorPage code={404} />} />
        </Routes>
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
