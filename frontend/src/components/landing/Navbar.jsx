import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../common/Logo.jsx'
import { useAuth } from '../../lib/AuthContext.jsx'

// Each link's href must match a section id rendered by LandingPage.
// scroll-mt-24 on each section keeps the heading clear of the sticky navbar.
const links = [
  { label: 'Dashboard',    href: '/#dashboard' },
  { label: 'Features',     href: '/#features' },
  { label: 'How it works', href: '/#how' },
]

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-neutral-100"
    >
      <div className="container-page flex items-center justify-between py-4">
        <Link to="/" aria-label="Smart Recruit home"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-pill bg-primary-100 text-primary-700 text-sm font-bold">
                {(user?.full_name || user?.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-ink">{user?.full_name || user?.username}</div>
                <div className="text-xs text-neutral-500">{formatRole(user?.role)}</div>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="btn-primary !py-2.5 !px-5 !text-sm"
            >
              Dashboard
            </Link>
            <button onClick={onLogout} className="btn-ghost !py-2 !px-4 !text-sm gap-1.5" type="button">
              <LogOut size={14} /> Log out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:inline text-sm font-semibold text-neutral-700 hover:text-primary-600"
            >
              Sign in
            </Link>
            <Link to="/signup" className="btn-primary !py-2.5 !px-5 !text-sm">Get Started</Link>
          </div>
        )}
      </div>
    </motion.header>
  )
}

// "hiring_manager" → "Hiring Manager" etc. Kept inline because it's only
// used here; lift if other pages start needing it.
function formatRole(role) {
  if (!role) return ''
  return role.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
