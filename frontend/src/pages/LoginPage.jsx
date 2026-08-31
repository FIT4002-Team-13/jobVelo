import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import { ApiError } from '../lib/api.js'
import { useAuth } from '../lib/AuthContext.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const justSignedUp = location.state?.justSignedUp
  // Where to send the user post-login. If they were redirected here from
  // a protected route, send them back; otherwise everyone (admins
  // included) lands on the regular dashboard - admins reach their
  // invitation-key page via the sidebar's admin-only nav item.
  const fromPath = location.state?.from?.pathname

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    // Cheap client-side sanity check. We deliberately DON'T reveal whether
    // the identifier looks email-shaped or not - the server returns the same
    // 401 for both shapes, so leaking format hints here would be inconsistent.
    if (!form.identifier.trim() || !form.password) {
      setError('Please enter your username/email and password.')
      return
    }
    setSubmitting(true)
    try {
      const user = await login(form.identifier.trim(), form.password)
      // Everyone lands on the shared dashboard - admins use the same app
      // shell as every other role and reach the invitation-key page via
      // the admin-only sidebar item. The captured fromPath still wins so
      // deep links survive the login bounce, except admin-only paths for
      // non-admins (RequireRole would just bounce them back out).
      const isAdmin = user?.role === 'admin'
      const wantsAdmin = fromPath?.startsWith('/admin')
      const target =
        fromPath && (isAdmin || !wantsAdmin) ? fromPath : '/dashboard'
      navigate(target, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Incorrect username/email or password.' : err.message)
      } else {
        setError('Could not reach the server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Log in to Smart Recruit">
      {justSignedUp && (
        <div className="mb-5 rounded-lg bg-mint-50 border border-mint-200 px-4 py-3 text-sm text-mint-700">
          Account created — please log in.
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-5">
        <AuthField
          label="Username / Email"
          name="identifier"
          placeholder="alex@startup.io"
          autoComplete="username"
          value={form.identifier}
          onChange={update}
          required
        />
        <AuthField
          label="Password"
          type="password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={form.password}
          onChange={update}
          required
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-neutral-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-200"
            />
            Remember me
          </label>
          <Link to="/forgot" className="link-quiet">Forgot password?</Link>
        </div>

        {error && (
          <div className="rounded-lg bg-coral-50 border border-coral-200 px-4 py-3 text-sm text-coral-700">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
          {submitting ? 'Signing in…' : 'Log In'}
        </button>

        <p className="text-sm text-neutral-600 text-center">
          Create an account?{' '}
          <Link to="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
            Sign Up
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
