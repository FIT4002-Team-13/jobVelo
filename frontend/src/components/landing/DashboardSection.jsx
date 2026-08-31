import { motion } from 'framer-motion'
import { CalendarCheck2, CalendarClock, CalendarDays } from 'lucide-react'

// Miniature of the REAL dashboard: the sidebar's MAIN/GROUP nav, the white
// stat cards with tinted icon squares, and the Jobs / Candidates panels
// with the app's actual status vocabulary (Pending / In Progress /
// Completed for jobs, Scheduled / Completed / Not Scheduled for
// candidates) - so what the landing page promises is what the product
// shows after login.
const jobs = [
  { title: 'Front-End Developer', count: '2/3', tag: 'In Progress', tagClass: 'bg-primary-500 text-white' },
  { title: 'Data Analyst',        count: '1/2', tag: 'Pending',     tagClass: 'bg-coral-500 text-white' },
  { title: 'Marketing Lead',      count: '3/3', tag: 'Completed',   tagClass: 'bg-mint-500 text-white' },
]

const candidates = [
  { name: 'Sara Doe',    badge: 'SCHEDULED',     badgeClass: 'bg-primary-100 text-primary-600' },
  { name: 'John Smith',  badge: 'COMPLETED',     badgeClass: 'bg-mint-100 text-mint-700' },
  { name: 'Dave Miller', badge: 'IN PROGRESS',   badgeClass: 'bg-amber-100 text-amber-700' },
  { name: 'Amy Chen',    badge: 'NOT SCHEDULED', badgeClass: 'bg-neutral-100 text-neutral-500' },
]

const stats = [
  { n: 2, label: 'Today',     icon: <CalendarDays size={11} className="text-mint-600" />,  tint: 'bg-mint-100' },
  { n: 4, label: 'Completed', icon: <CalendarCheck2 size={11} className="text-sky-500" />, tint: 'bg-sky-100' },
  { n: 3, label: 'Up-coming', icon: <CalendarClock size={11} className="text-coral-500" />, tint: 'bg-coral-100' },
]

export default function DashboardSection() {
  return (
    <section id="dashboard" className="py-section scroll-mt-24">
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
              'AI scores and rankings after every interview',
              'Schedules, candidates and jobs in one place',
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
      <div className="grid grid-cols-[150px_1fr]">
        {/* Sidebar - mirrors the real MAIN / GROUP nav split. */}
        <aside className="bg-neutral-50 p-4 border-r border-neutral-100 flex flex-col">
          <div className="text-[11px] font-extrabold text-ink mb-3">jobVelo</div>
          <div className="text-[8px] font-bold tracking-wider text-neutral-400 mb-1">MAIN</div>
          {['Dashboard', 'Schedules'].map((item, i) => (
            <div
              key={item}
              className={`text-[10px] px-2 py-1.5 rounded-md ${
                i === 0 ? 'bg-primary-500 text-white font-semibold' : 'text-neutral-500'
              }`}
            >
              {item}
            </div>
          ))}
          <div className="text-[8px] font-bold tracking-wider text-neutral-400 mt-2.5 mb-1">GROUP</div>
          {['Jobs', 'Candidates'].map((item) => (
            <div key={item} className="text-[10px] px-2 py-1.5 rounded-md text-neutral-500">
              {item}
            </div>
          ))}
          <div className="mt-auto pt-6 flex items-center gap-1.5 text-[10px] text-neutral-600">
            <div className="h-5 w-5 rounded-pill bg-primary-500 grid place-items-center text-[7px] font-bold text-white">JD</div>
            John Doe
          </div>
        </aside>

        {/* Main */}
        <div className="p-5">
          <div className="text-sm font-bold mb-1">Hello, John Doe</div>
          <div className="text-[10px] text-neutral-500 mb-3">Summary</div>
          {/* White stat cards with tinted icon squares - the real card anatomy. */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white p-2 shadow-sm">
                <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${s.tint}`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold leading-none text-neutral-800">{s.n}</div>
                  <div className="text-[8px] text-neutral-400">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-neutral-700 mb-1.5">Jobs</div>
              <div className="space-y-1.5">
                {jobs.map((j) => (
                  <div key={j.title} className="rounded-md border border-neutral-100 bg-white px-2 py-1.5 shadow-sm">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-neutral-700 truncate">{j.title}</span>
                      <span className={`shrink-0 text-[7px] font-bold px-1.5 py-0.5 rounded-pill ${j.tagClass}`}>{j.tag}</span>
                    </div>
                    <div className="text-[8px] text-neutral-400">Candidates: {j.count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-neutral-700 mb-1.5">Candidates</div>
              <div className="space-y-1.5">
                {candidates.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-1 rounded-md border border-neutral-100 bg-white px-2 py-1.5 shadow-sm">
                    <span className="text-[10px] text-neutral-700 truncate">{c.name}</span>
                    <span className={`shrink-0 text-[7px] font-bold px-1.5 py-0.5 rounded-pill ${c.badgeClass}`}>{c.badge}</span>
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
