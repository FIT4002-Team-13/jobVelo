import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext.jsx'
import RequireAuth from './components/auth/RequireAuth.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import CreateCompanyPage from './pages/CreateCompanyPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
                <AdminDashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
