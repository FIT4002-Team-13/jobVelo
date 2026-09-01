import { motion } from 'framer-motion'

// The product's ACTUAL pipeline, in order: create the role -> add
// candidates (AI screens each CV) -> run the live interview (transcription
// + suggested questions) -> read the AI report and compare rankings.
// Step colours follow the app's own status progression.
const steps = [
  {
    n: '01',
    title: 'Create the role',
    body: 'Set the title, description, employment type and interview slots — your pipeline starts here.',
    color: 'bg-primary-500',
  },
  {
    n: '02',
    title: 'Add candidates',
    body: 'Upload each CV and the AI screens it against the role: fit scores, strengths, gaps, and tailored questions to ask.',
    color: 'bg-coral-500',
  },
  {
    n: '03',
    title: 'Run the interview',
    body: 'Live transcription while you talk, with AI question suggestions on hand when you need the next one.',
    color: 'bg-sky-500',
  },
  {
    n: '04',
    title: 'Read the report',
    body: 'Scores, strengths and a summary written minutes after you finish — ranked across every candidate on the role.',
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

        <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Connecting line */}
          <div className="hidden lg:block absolute top-8 left-[0%] right-[22%] h-0.5 bg-gradient-to-r from-primary-200 via-coral-200 to-mint-200" />

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
              <h3 className="text-xl font-bold mb-2">{s.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-600">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
