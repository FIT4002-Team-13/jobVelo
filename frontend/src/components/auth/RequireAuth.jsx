import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext.jsx'

/**
 * Wrap any private route so unauthenticated users are bounced to /login,
 * remembering where they were trying to go so login can redirect them back.
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, bootstrapped } = useAuth()
  const location = useLocation()

  // Wait for the on-boot /me call to finish so we don't flash a redirect
  // while we're still validating a cached token.
  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
