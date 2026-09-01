import { useAuth } from '../../lib/AuthContext.jsx'
import ErrorPage from '../../pages/ErrorPage.jsx'

/**
 * Route guard for role-restricted pages.
 *
 * Use *inside* a <RequireAuth> wrapper (or assume it) - this only handles the
 * role check, not the auth check. If the signed-in user's role isn't in the
 * allowed list they see the styled 403 "Access restricted" screen (with a
 * clear way back to the dashboard) instead of being silently redirected -
 * a silent bounce read as a bug, while the locked screen explains itself.
 *
 *   <RequireRole allow={['admin']}>
 *     <AdminDashboardPage />
 *   </RequireRole>
 */
export default function RequireRole({ allow, children }) {
  const { user, bootstrapped } = useAuth()

  // Same boot guard as RequireAuth - don't flash the locked screen while
  // /me is still resolving the cached token.
  if (!bootstrapped) {
    return (
      <div className="min-h-screen grid place-items-center text-neutral-500">
        Loading…
      </div>
    )
  }

  if (!user || !allow.includes(user.role)) {
    return <ErrorPage code={403} />
  }
  return children
}
