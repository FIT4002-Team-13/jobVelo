import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import { api, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { checkPassword, isPasswordStrong } from '../lib/password.js'
import {
  isEmail, isHttpUrl, isPhone, isUsername, isFullName,
  checkLogoFile,
} from '../lib/validators.js'

// Company + admin signup. Multipart (because of the logo). On success the
// backend returns an access_token, so we auto-log them in and drop them on
// the admin dashboard.
export default function CreateCompanyPage() {
  const navigate = useNavigate()
  const { applySession } = useAuth()
  const [form, setForm] = useState({
    comp_name: '',
    comp_email: '',
    comp_industry: '',
    comp_contact: '',
    comp_website: '',
    comp_description: '',
    username: '',
    full_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  const checks = useMemo(() => checkPassword(form.password), [form.password])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // ── Company-side checks ──────────────────────────────────────────
    if (!form.comp_name.trim())     return setError('Company name is required.')
    if (!isEmail(form.comp_email))  return setError('Please enter a valid company email.')
    if (!form.comp_industry.trim()) return setError('Industry is required.')
    if (!isPhone(form.comp_contact))
      return setError('Contact number looks malformed (digits, +, spaces, dashes only).')
    if (form.comp_website.trim() && !isHttpUrl(form.comp_website))
      return setError('Website URL must start with http:// or https://')

    // Logo: presence + mime + size (file-size cap lives in validators).
    const logoErr = checkLogoFile(logoFile)
    if (logoErr) return setError(logoErr)

    // ── Admin-side checks ────────────────────────────────────────────
    if (!isFullName(form.full_name))
      return setError('Please enter a real full name (2-100 characters, includes letters).')
    if (!isUsername(form.username))
      return setError('Username must be 3-40 characters: letters, digits, dot, underscore or dash.')
    if (!isEmail(form.email))
      return setError('Please enter a valid email address.')
    if (!isPasswordStrong(form.password)) {
      setError('Password does not meet the requirements below.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    const fd = new FormData()
    fd.append('comp_name',     form.comp_name.trim())
    fd.append('comp_email',    form.comp_email.trim().toLowerCase())
    fd.append('comp_industry', form.comp_industry.trim())
    fd.append('comp_contact',  form.comp_contact.trim())
    if (form.comp_website)     fd.append('comp_website', form.comp_website.trim())
    if (form.comp_description) fd.append('comp_description', form.comp_description.trim())
    fd.append('comp_logo',     logoFile)
    fd.append('username',      form.username.trim())
    fd.append('full_name',     form.full_name.trim())
    fd.append('email',         form.email.trim().toLowerCase())
    fd.append('password',      form.password)

    setSubmitting(true)
    try {
      const res = await api.signupCompany(fd)
      applySession({ token: res.access_token, user: res.user })
      // The fresh admin lands on the same dashboard as everyone else -
      // the invitation-key page is one click away in the sidebar.
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create your company on Smart Recruit">
      <form onSubmit={onSubmit} className="space-y-4">
        <SectionLabel>Company</SectionLabel>
        <AuthField
          label="Company name"
          name="comp_name"
          placeholder="eg. Acme Recruiting"
          autoComplete="organization"
          value={form.comp_name}
          onChange={update}
          required
        />
        <AuthField
          label="Company email"
          type="email"
          name="comp_email"
          placeholder="eg. hello@acme.com"
          autoComplete="email"
          value={form.comp_email}
          onChange={update}
          required
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <AuthField
            label="Industry"
            name="comp_industry"
            placeholder="eg. Talent Acquisition"
            value={form.comp_industry}
            onChange={update}
            required
          />
          <AuthField
            label="Contact number"
            name="comp_contact"
            placeholder="+61 3 9000 0000"
            autoComplete="tel"
            value={form.comp_contact}
            onChange={update}
            required
          />
        </div>
        <AuthField
          label="Website (optional)"
          name="comp_website"
          placeholder="https://acme.com"
          autoComplete="url"
          value={form.comp_website}
          onChange={update}
        />
        <label className="block">
          <span className="block text-sm font-semibold text-neutral-700 mb-1.5">
            Description (optional)
          </span>
          <textarea
            name="comp_description"
            value={form.comp_description}
            onChange={update}
            rows={3}
            placeholder="What does your company do?"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-ink
                       placeholder:text-neutral-400 outline-none transition-all
                       focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-neutral-700 mb-1.5">Company logo</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            required
            className="block w-full text-sm text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md
                       file:border-0 file:bg-primary-500 file:text-white file:text-sm file:font-semibold
                       hover:file:bg-primary-600"
          />
          {logoFile && (
            <span className="mt-1 inline-block text-xs text-neutral-500">{logoFile.name}</span>
          )}
        </label>

        <SectionLabel>Your admin account</SectionLabel>
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
          placeholder="eg. you@acme.com"
          autoComplete="email"
          value={form.email}
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
          {submitting ? 'Creating…' : 'Create company'}
        </button>

        <p className="text-sm text-neutral-600 text-center">
          Joining an existing team?{' '}
          <Link to="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
            Enter your invitation code
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function SectionLabel({ children }) {
  return (
    <div className="pt-2 text-xs font-bold uppercase tracking-wider text-primary-600">
      {children}
    </div>
  )
}
