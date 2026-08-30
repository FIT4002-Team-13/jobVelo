import { Link } from 'react-router-dom'
import Logo from '../common/Logo.jsx'
import { LEGAL } from '../../lib/legal.js'

// Real footer: every link goes somewhere that exists. Columns that used to
// advertise pages we don't have (Help center, API docs, Status, ...) are
// gone - a footer full of dead "#" links reads as a template, not a product.
//
//   to   -> internal route (react-router Link, no full reload)
//   href -> in-page anchor on the landing page, or mailto
const cols = [
  {
    title: 'Product',
    items: [
      { label: 'Features', href: '/#features' },
      { label: 'How it works', href: '/#how' },
      { label: 'Dashboard preview', href: '/#dashboard' },
    ],
  },
  {
    title: 'Get started',
    items: [
      { label: 'Log in', to: '/login' },
      { label: 'Join with an invitation', to: '/signup' },
      { label: 'Register your company', to: '/create-company' },
    ],
  },
  {
    title: 'Support',
    items: [{ label: 'Contact us', href: `mailto:${LEGAL.contactEmail}` }],
  },
]

const linkClass = 'text-sm text-neutral-700 hover:text-primary-600 no-underline'

export default function Footer() {
  return (
    <footer className="border-t border-neutral-100 bg-white">
      <div className="container-page py-16 grid gap-10 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-neutral-600 max-w-xs">
            Smart Recruit. Better hires. Instantly. Built with care for hiring
            teams everywhere.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
              {c.title}
            </div>
            <ul className="space-y-2">
              {c.items.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className={linkClass}>
                      {item.label}
                    </Link>
                  ) : (
                    <a href={item.href} className={linkClass}>
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100">
        <div className="container-page py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-neutral-500">
            © {new Date().getFullYear()} {LEGAL.legalEntity}. All rights reserved.
          </span>
          <span className="text-xs text-neutral-500">
            Designed and built with care for hiring teams
          </span>
        </div>
      </div>
    </footer>
  )
}
