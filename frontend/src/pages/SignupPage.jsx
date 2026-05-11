import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import { api, ApiError } from '../lib/api.js'
import { checkPassword, isPasswordStrong } from '../lib/password.js'

// Roles the invitee can pick. "admin" isn't here on purpose - that role is
// reserved for the user who created the company.
const ROLE_OPTIONS = [
  { value: 'interviewer',    label: 'Interviewer' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'recruiter',      label: 'Recruiter' },
]

// Two-step signup for invited teammates:
//   step 1 - enter invitation code, validate against backend
//   step 2 - fill the rest of the form; submit creates the user with
//            company_id taken from the validated invitation (not the form).
export default function SignupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [code, setCode] = useState('')
  const [companyName, setCompanyName] = useState('')

  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    role: 'interviewer',
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
    if (!code.trim()) return
    setSubmitting(true)
    try {
      const res = await api.checkCode(code.trim())
      if (!res?.valid) {
        setError('That invitation code is invalid or has already been used.')
        return
      }
      setCompanyName(res.comp_name || '')
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
        role:            form.role,
        password:        form.password,
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
          You're joining <span className="font-semibold">{companyName}</span>.{' '}
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

        <Select
          label="Role"
          name="role"
          value={form.role}
          onChange={update}
          options={ROLE_OPTIONS}
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

// Inline select component - matches AuthField's visual style. If we end up
// using it on more pages, lift to components/auth/AuthSelect.jsx.
function Select({ label, name, value, onChange, options, required }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-neutral-700 mb-1.5">{label}</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-ink
                   outline-none transition-all
                   focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
