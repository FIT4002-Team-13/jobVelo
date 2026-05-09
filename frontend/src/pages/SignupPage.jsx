import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import { api, ApiError } from '../lib/api.js'
import { checkPassword, isPasswordStrong } from '../lib/password.js'

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '',
    email: '',
    position: '',
    password: '',
    confirm: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const checks = useMemo(() => checkPassword(form.password), [form.password])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!isPasswordStrong(form.password)) {
      setError('Password does not meet the requirements below.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await api.signup({
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        position: form.position.trim(),
        password: form.password,
      })
      // Account created - send them to login.
      navigate('/login', { replace: true, state: { justSignedUp: true } })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Could not reach the server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create your Smart Recruit account">
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField
          label="Username"
          name="username"
          placeholder="eg. johndoe23"
          autoComplete="username"
          value={form.username}
          onChange={update}
          required
        />
        <AuthField
          label="Email"
          type="email"
          name="email"
          placeholder="eg. abcdef1234@xxx.com"
          autoComplete="email"
          value={form.email}
          onChange={update}
          required
        />
        <AuthField
          label="Position"
          name="position"
          placeholder="eg. Recruiter, Hiring Manager, Engineer"
          autoComplete="organization-title"
          value={form.position}
          onChange={update}
          required
        />
        <AuthField
          label="Password"
          type="password"
          name="password"
          placeholder="Enter a strong password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          required
        />

        {/* Live password requirements */}
        <ul className="grid grid-cols-2 gap-1.5 text-xs">
          {checks.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-1.5 ${c.ok ? 'text-mint-600' : 'text-neutral-500'}`}
            >
              {c.ok ? <Check size={14} /> : <X size={14} className="opacity-60" />}
              {c.label}
            </li>
          ))}
        </ul>

        <AuthField
          label="Confirm Password"
          type="password"
          name="confirm"
          placeholder="Re-enter your password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update}
          required
        />

        {error && (
          <div className="rounded-lg bg-coral-50 border border-coral-200 px-4 py-3 text-sm text-coral-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-60 mt-2"
        >
          {submitting ? 'Creating account…' : 'Sign Up'}
        </button>

        <p className="text-sm text-neutral-600 text-center">
          Have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Log In
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
