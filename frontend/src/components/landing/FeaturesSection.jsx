import { motion } from 'framer-motion'
import { BarChart3, Bot, FileText, MessageSquare, Mic, ShieldCheck } from 'lucide-react'

// Six cards, six REAL features - each one maps to something a visitor will
// actually find after logging in. No invented capabilities, no compliance
// badges we can't back up.
const features = [
  {
    icon: Bot,
    title: 'AI CV screening',
    body: 'Every CV is analysed against the role: fit scores, strengths, gaps and inconsistencies — with reasons you can read.',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: Mic,
    title: 'Live transcription',
    body: 'Interviews are transcribed in real time as you talk — every word captured, nothing to write up afterwards.',
    color: 'bg-coral-50 text-coral-600',
  },
  {
    icon: MessageSquare,
    title: 'Suggested questions',
    body: 'An AI question deck tailored to the role and CV, ready before the call and swappable during it.',
    color: 'bg-mint-50 text-mint-600',
  },
  {
    icon: FileText,
    title: 'Instant reports',
    body: 'Scored candidate and interviewer reports, written minutes after the interview — downloadable as PDFs.',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: BarChart3,
    title: 'Rankings & pipeline',
    body: 'Candidates ranked by their interview scores per role, with live status across dashboard, jobs and schedules.',
    color: 'bg-coral-50 text-coral-600',
  },
  {
    icon: ShieldCheck,
    title: 'Private team workspace',
    body: 'Invitation-only accounts, role-based permissions, and every record isolated to your company.',
    color: 'bg-mint-50 text-mint-600',
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-section scroll-mt-24">
      <div className="absolute inset-0 -z-10 bg-dotted opacity-50" />
      <div className="container-page">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="eyebrow mb-3">Why Smart Recruit</span>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
            Everything your team needs, <span className="text-primary-500">none of the chaos.</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Built for hiring teams that want to move fast without dropping the human touch.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              whileHover={{ y: -6 }}
              className="group rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className={`h-12 w-12 rounded-xl grid place-items-center mb-4 ${f.color}`}>
                <f.icon size={22} />
              </div>
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-base text-neutral-600">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
