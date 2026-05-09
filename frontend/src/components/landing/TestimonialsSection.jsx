import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

const quotes = [
  {
    body: 'We cut our time-to-offer in half. Smart Recruit finally made our hiring data feel useful instead of overwhelming.',
    name: 'Priya Shah',
    role: 'Head of Talent, Northwind',
    avatar: '#FFB4A2',
  },
  {
    body: "The AI shortlist is the part I didn't know I needed. It surfaces candidates we'd have missed in a stack of 400.",
    name: 'Marcus Lee',
    role: 'Engineering Manager, Lumen',
    avatar: '#A0C4FF',
  },
  {
    body: 'Onboarded in a day. Replaced three tools by Friday. Our recruiters actually look forward to Mondays now.',
    name: 'Elena Ortiz',
    role: 'COO, Sundial Studios',
    avatar: '#B8E0D2',
  },
]

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-section">
      <div className="container-page">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="eyebrow mb-3">Loved by hiring teams</span>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
            Built for the people who do the hiring.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map((q, i) => (
            <motion.figure
              key={q.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-neutral-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, k) => (
                  <Star key={k} size={16} className="fill-coral-400 stroke-coral-400" />
                ))}
              </div>
              <blockquote className="text-base text-neutral-700 leading-relaxed">"{q.body}"</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="h-10 w-10 rounded-pill" style={{ background: q.avatar }} />
                <div>
                  <div className="text-sm font-semibold text-ink">{q.name}</div>
                  <div className="text-xs text-neutral-500">{q.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
