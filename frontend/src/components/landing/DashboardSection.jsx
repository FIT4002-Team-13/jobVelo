import { motion } from 'framer-motion'

const jobs = [
  { title: 'Front-End Developer', tag: 'Open',     tagClass: 'bg-mint-100 text-mint-600' },
  { title: 'Back-End Dev',        tag: 'Open',     tagClass: 'bg-mint-100 text-mint-600' },
  { title: 'Marketing QA',        tag: 'Closed',   tagClass: 'bg-coral-100 text-coral-600' },
  { title: 'Front-End Developer', tag: 'Open',     tagClass: 'bg-mint-100 text-mint-600' },
]

const candidates = [
  { name: 'Bain Khoso',    badge: 'New',   badgeClass: 'bg-primary-100 text-primary-600' },
  { name: 'Sara Doe',      badge: 'Hired', badgeClass: 'bg-mint-100 text-mint-600' },
  { name: 'John Smith',    badge: 'New',   badgeClass: 'bg-primary-100 text-primary-600' },
  { name: 'Spongebob',     badge: 'Done',  badgeClass: 'bg-coral-100 text-coral-600' },
]

export default function DashboardSection() {
  return (
    <section id="features" className="py-section">
      <div className="container-page grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="order-2 lg:order-1"
        >
          <DashboardMock />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="order-1 lg:order-2"
        >
          <span className="eyebrow mb-4">Dashboard</span>
          <h2 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
            Your entire hiring process. <span className="text-primary-500">One beautiful view.</span>
          </h2>
          <p className="mt-5 text-lg text-neutral-600 max-w-md">
            Smart Recruit gives your team a single dashboard to manage interviews, monitor
            progress and move the best candidates forward — powered by AI, guided by instinct.
          </p>
          <ul className="mt-7 space-y-3 text-neutral-700">
            {[
              'Live status across every role',
              'Smart shortlist powered by AI',
              'One-click interview scheduling',
            ].map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-pill bg-mint-100 grid place-items-center text-mint-500">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}

function DashboardMock() {
  return (
    <div className="relative mx-auto max-w-[560px] rounded-2xl bg-white shadow-xl border border-neutral-100 overflow-hidden">
      <div className="grid grid-cols-[180px_1fr]">
        {/* Sidebar */}
        <aside className="bg-neutral-50 p-4 space-y-2 border-r border-neutral-100">
          <div className="text-[11px] font-extrabold text-ink mb-3">smart recruit</div>
          {['Dashboard', 'Candidates', 'Jobs', 'Settings'].map((item, i) => (
            <div
              key={item}
              className={`text-xs px-2.5 py-2 rounded-md ${
                i === 0 ? 'bg-primary-500 text-white font-semibold' : 'text-neutral-500'
              }`}
            >
              {item}
            </div>
          ))}
          <div className="pt-8 flex items-center gap-2 text-xs text-neutral-600">
            <div className="h-6 w-6 rounded-pill bg-primary-200" />
            John Doe
          </div>
        </aside>

        {/* Main */}
        <div className="p-5">
          <div className="text-sm font-bold mb-1">Hello, John Doe</div>
          <div className="text-[10px] text-neutral-500 mb-3">Summary</div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { n: 1, label: 'Interviews',  bg: 'bg-mint-100',   ink: 'text-mint-600' },
              { n: 4, label: 'Completed',   bg: 'bg-primary-100', ink: 'text-primary-600' },
              { n: 3, label: 'Up coming',   bg: 'bg-coral-100',  ink: 'text-coral-600' },
            ].map((s) => (
              <div key={s.label} className={`rounded-md ${s.bg} p-2.5`}>
                <div className={`text-lg font-extrabold ${s.ink}`}>{s.n}</div>
                <div className="text-[9px] text-neutral-500">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-neutral-700 mb-1.5">Jobs</div>
              <div className="space-y-1.5">
                {jobs.map((j, i) => (
                  <div key={i} className="flex items-center justify-between bg-neutral-50 rounded-md px-2 py-1.5">
                    <span className="text-[10px] text-neutral-700 truncate">{j.title}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-pill ${j.tagClass}`}>{j.tag}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-neutral-700 mb-1.5">Candidates</div>
              <div className="space-y-1.5">
                {candidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-neutral-50 rounded-md px-2 py-1.5">
                    <span className="text-[10px] text-neutral-700 truncate">{c.name}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-pill ${c.badgeClass}`}>{c.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
