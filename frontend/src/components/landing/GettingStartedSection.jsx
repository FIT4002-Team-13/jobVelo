import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Two ways in: a company admin creates the company, or an invited teammate
// joins with a one-time code. Steps follow the real signup flow.
const paths = [
  {
    id: 'create',
    eyebrow: 'New company',
    title: 'Create your company',
    intro: 'For the admin who sets up the account. You will be the first user.',
    cta: { label: 'Create your company', to: '/create-company' },
    steps: [
      {
        n: '01',
        title: 'Enter company details',
        body: 'Company name, company email, industry and contact number. Website and description are optional.',
        color: 'bg-primary-500',
      },
      {
        n: '02',
        title: 'Set up your admin account',
        body: 'Enter your full name, username, email and password. You will become the company\'s admin.',
        color: 'bg-coral-500',
      },
      {
        n: '03',
        title: 'Invite your team',
        body: 'You land on the dashboard. Generate and share invitation codes for recruiters, interviewers and hiring managers.',
        color: 'bg-mint-400',
      },
    ],
  },
  {
    id: 'join',
    eyebrow: 'Invited teammate',
    title: 'Join with an invitation code',
    intro: 'For anyone admin invited. Each code works once and sets your role.',
    cta: { label: 'I have a code', to: '/signup' },
    steps: [
      {
        n: '01',
        title: 'Enter your code',
        body: 'Paste the invitation code your admin sent you. The code decides which role you get.',
        color: 'bg-sky-500',
      },
      {
        n: '02',
        title: 'Confirm the company',
        body: 'The page shows the company you are joining before you continue.',
        color: 'bg-primary-500',
      },
      {
        n: '03',
        title: 'Create your account',
        body: 'Enter your full name, username, email and password. Then log in to start working.',
        color: 'bg-mint-400',
      },
    ],
  },
]

export default function GettingStartedSection() {
  return (
    <section id="start" className="py-section scroll-mt-24 bg-gradient-to-b from-primary-50/40 to-white">
      <div className="container-page">
        <div className="max-w-2xl mb-14">
          <span className="eyebrow mb-3">Getting started</span>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
            Set up in minutes — <span className="text-coral-400">create a company or join your team.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {paths.map((p, pi) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: pi * 0.12 }}
              className="relative rounded-2xl bg-white border border-neutral-100 shadow-xl p-8"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-primary-600">{p.eyebrow}</span>
              <h3 className="mt-2 text-2xl font-bold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{p.intro}</p>

              <ol className="mt-8 flex flex-col gap-6">
                {p.steps.map((s) => (
                  <li key={s.n} className="flex items-start gap-4">
                    <div className={`h-12 w-12 shrink-0 rounded-xl ${s.color} text-white grid place-items-center text-sm font-extrabold shadow-glow`}>
                      {s.n}
                    </div>
                    <div>
                      <h4 className="text-base font-bold">{s.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-600">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <Link
                to={p.cta.to}
                className="btn-primary mt-8 inline-flex items-center gap-2 !py-2.5 !px-5 !text-sm"
              >
                {p.cta.label}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
