import { motion } from 'framer-motion'
import { Bot, Calendar, MessageSquare, ShieldCheck, Sparkles, Workflow } from 'lucide-react'

const features = [
  {
    icon: Bot,
    title: 'AI shortlist',
    body: 'Rank applicants on signal — not noise — with explainable AI scoring.',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: Calendar,
    title: 'Smart scheduling',
    body: 'One link, every timezone. Auto-reschedule when calendars shift.',
    color: 'bg-coral-50 text-coral-600',
  },
  {
    icon: MessageSquare,
    title: 'Structured feedback',
    body: 'Capture interviewer notes in a shared rubric — no more silent biases.',
    color: 'bg-mint-50 text-mint-600',
  },
  {
    icon: Workflow,
    title: 'Pipeline automation',
    body: 'Move candidates between stages on triggers — with full audit trail.',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: Sparkles,
    title: 'AI-assisted JD',
    body: 'Generate inclusive, on-brand job descriptions in seconds.',
    color: 'bg-coral-50 text-coral-600',
  },
  {
    icon: ShieldCheck,
    title: 'Compliant by default',
    body: 'GDPR, SOC2 and EEOC-ready, with role-based access controls.',
    color: 'bg-mint-50 text-mint-600',
  },
]

export default function FeaturesSection() {
  return (
    <section className="relative py-section">
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
