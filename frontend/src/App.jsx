import { BrowserRouter, Route, Routes } from 'react-router-dom'
// import LoginPage from './pages/LoginPage'
// import CreateAccountPage from './pages/CreateAccountPage'
// import LoginInlineErrorPage from './pages/LoginInlineErrorPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'

// Add page imports here as they're built, then declare them inside <Routes>.
// Wrap private routes with a RequireAuth component once auth lands.

function Welcome() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight bg-brand-gradient bg-clip-text text-transparent">
          Smart Recruit
        </h1>
        <p className="mt-4 text-lg text-muted">
          Real-Time Interview Intelligence System
        </p>
        <p className="mt-2 text-sm text-muted">
          Project scaffold ready. Start building under{' '}
          <code className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-ink text-sm">src/pages</code>.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
         <Route path="/dashboard" element={<DashboardPage />} />
         <Route path="/jobs" element={<JobsPage />} />
         <Route path="/jobs/:id" element={<JobDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
