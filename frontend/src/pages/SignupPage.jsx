import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import { api, ApiError } from '../lib/api.js'
import { checkPassword, isPasswordStrong } from '../lib/password.js'
import { isEmail, isUsername, isFullName } from '../lib/validators.js'

// Invitation codes are generated server-side as INV-XXXX-XXXX (alphanumeric).
// Catching obvious typos here saves a server round-trip on step 1.
const CODE_RE = /^INV-[A-Z0-9]{4}-[A-Z0-9]{4}$/

// Roles an invitation can carry, used purely to display a friendly label
// for the role the admin picked when generating the code. The invitee no
// longer chooses one themselves - the field is read-only on this form.
const ROLE_LABELS = {
  interviewer:    'Interviewer',
  hiring_manager: 'Hiring Manager',
  recruiter:      'Recruiter',
}

// Two-step signup for invited teammates:
//   step 1 - enter invitation code, validate against backend
//   step 2 - fill the rest of the form; submit creates the user with
//            company_id taken from the validated invitation (not the form).
export default function SignupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [code, setCode] = useState('')
  const [companyName, setCompanyName] = useState('')
  // Role the admin attached to this invitation. Read-only on the form.
  const [invitationRole, setInvitationRole] = useState('')

  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  const checks = useMemo(() => checkPassword(form.password), [form.password])

  // --- step 1: validate the code -------------------------------------
  const onCheckCode = async (e) => {
    e.preventDefault()
    setError(null)
    const trimmed = code.trim()
    if (!trimmed) return
    // Catch obviously-wrong codes (e.g. someone pasted a URL) before
    // hitting the server. Real validity check still happens server-side.
    if (!CODE_RE.test(trimmed)) {
      setError('Invitation codes look like "INV-XXXX-XXXX".')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.checkCode(trimmed)
      if (!res?.valid) {
        setError('That invitation code is invalid or has already been used.')
        return
      }
      setCompanyName(res.comp_name || '')
      // Role is now sourced from the invitation. We store it so the form
      // can display it read-only AND so we can submit nothing for role.
      setInvitationRole(res.role || 'interviewer')
      setStep(2)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
    } finally {
      setSubmitting(false)
    }
  }

  // --- step 2: submit the form -------------------------------------
  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!isFullName(form.full_name)) {
      setError('Please enter a real full name (2-100 characters, includes letters).')
      return
    }
    if (!isUsername(form.username)) {
      setError('Username must be 3-40 characters: letters, digits, dot, underscore or dash.')
      return
    }
    if (!isEmail(form.email)) {
      setError('Please enter a valid email address.')
      return
    }
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
        invitation_code: code.trim(),
        username:        form.username.trim(),
        full_name:       form.full_name.trim(),
        email:           form.email.trim().toLowerCase(),
        password:        form.password,
        // No `role` field - the backend sources it from the invitation
        // (UserCreate dropped the field entirely in the role-on-invite refactor).
      })
      navigate('/login', { replace: true, state: { justSignedUp: true } })
    } catch (err) {
      if (err instanceof ApiError) {
        // If the code became invalid between step 1 and 2 (e.g. someone else
        // used it), kick the user back to step 1.
        if (err.status === 400) {
          setStep(1)
          setCode('')
        }
        setError(err.message)
      } else {
        setError('Could not reach the server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // --- render --------------------------------------------------------
  if (step === 1) {
    return (
      <AuthLayout title="Join your team on Smart Recruit">
        <form onSubmit={onCheckCode} className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-ink mb-1">Got an invitation code?</h2>
            <p className="text-sm text-neutral-500">
              Ask your admin for one. The code links you to your company.
            </p>
          </div>

          <AuthField
            label="Invitation code"
            name="code"
            placeholder="INV-XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />

          {error && (
            <div className="rounded-lg bg-coral-50 border border-coral-200 px-4 py-3 text-sm text-coral-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="btn-primary w-full disabled:opacity-60"
          >
            {submitting ? 'Checking…' : (<>Continue <ArrowRight size={18} /></>)}
          </button>

          <p className="text-sm text-neutral-600 text-center">
            Have an account?{' '}
            <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
              Log In
            </Link>
          </p>
          <p className="text-sm text-neutral-600 text-center">
            Setting up a new company?{' '}
            <Link to="/create-company" className="font-semibold text-primary-600 hover:text-primary-700">
              Create one
            </Link>
          </p>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your Smart Recruit account">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-lg bg-mint-50 border border-mint-200 px-4 py-3 text-sm text-mint-700">
          You&apos;re joining <span className="font-semibold">{companyName}</span>.{' '}
          <button
            type="button"
            onClick={() => { setStep(1); setError(null) }}
            className="underline underline-offset-2 text-mint-700 hover:text-mint-800"
          >
            wrong company?
          </button>
        </div>

        <AuthField
          label="Full name"
          name="full_name"
          placeholder="eg. Jane Doe"
          autoComplete="name"
          value={form.full_name}
          onChange={update}
          required
        />
        <AuthField
          label="Username"
          name="username"
          placeholder="eg. janedoe23"
          autoComplete="username"
          value={form.username}
          onChange={update}
          required
        />
        <AuthField
          label="Email"
          type="email"
          name="email"
          placeholder="eg. you@company.com"
          autoComplete="email"
          value={form.email}
          onChange={update}
          required
        />

        {/* Role is read-only - the admin who generated this code picked it. */}
        <div className="block">
          <span className="block text-sm font-semibold text-neutral-700 mb-1.5">Role</span>
          <div className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base text-neutral-700">
            {ROLE_LABELS[invitationRole] || invitationRole || '—'}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Assigned by your admin when this invitation was generated.
          </p>
        </div>

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

