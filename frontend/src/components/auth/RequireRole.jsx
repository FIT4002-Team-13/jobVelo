import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext.jsx'

/**
 * Route guard for role-restricted pages.
 *
 * Use *inside* a <RequireAuth> wrapper (or assume it) - this only handles the
 * role check, not the auth check. If the signed-in user's role isn't in the
 * allowed list, we redirect them to a sensible fallback instead of letting
 * them hit a page that will just show a 403 banner.
 *
 *   <RequireRole allow={['admin']} fallback="/dashboard">
 *     <AdminDashboardPage />
 *   </RequireRole>
 *
 * Why this exists: previously an interviewer who logged in after an admin
 * (with /admin/dashboard still cached in location.state.from) would land on
 * the admin page and see "Only admins can view this page". Cleaner to bounce
 * them to their normal dashboard before the page even mounts.
 */
export default function RequireRole({ allow, fallback = '/dashboard', children }) {
  const { user, bootstrapped } = useAuth()

  // Same boot guard as RequireAuth - don't flash a redirect while /me is
  // still resolving the cached token.
  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    )
  }

  if (!user || !allow.includes(user.role)) {
    return <Navigate to={fallback} replace />
  }
  return children
}
