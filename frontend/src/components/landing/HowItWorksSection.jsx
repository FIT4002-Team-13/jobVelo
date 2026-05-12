import { motion } from 'framer-motion'

const steps = [
  {
    n: '01',
    title: 'Describe the role',
    body: 'Tell Smart Recruit what you need. AI drafts the spec, screening questions and rubric.',
    color: 'bg-primary-500',
  },
  {
    n: '02',
    title: 'Review smart shortlist',
    body: 'Candidates are ranked with reasons you can read — not a black box.',
    color: 'bg-coral-500',
  },
  {
    n: '03',
    title: 'Interview & decide',
    body: 'Send one link. Collect structured feedback. Make the call together.',
    color: 'bg-mint-400',
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how" className="py-section scroll-mt-24 bg-gradient-to-b from-white to-primary-50/40">
      <div className="container-page">
        <div className="max-w-2xl mb-14">
          <span className="eyebrow mb-3">How it works</span>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
            From job posted to offer signed — <span className="text-mint-400">in days, not months.</span>
          </h2>
        </div>

        <div className="relative grid md:grid-cols-3 gap-8">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-8 left-[0%] right-[30%] h-0.5 bg-gradient-to-r from-primary-200 via-coral-200 to-mint-200" />

          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative"
            >
              <div className={`h-16 w-16 rounded-2xl ${s.color} text-white grid place-items-center text-xl font-extrabold shadow-glow mb-5`}>
                {s.n}
              </div>
              <h3 className="text-2xl font-bold mb-2">{s.title}</h3>
              <p className="text-base text-neutral-600">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
