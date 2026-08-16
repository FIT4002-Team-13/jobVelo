import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CTASection() {
  return (
    <section id="start" className="py-section">
      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-neutral-100 bg-white px-8 py-16 lg:px-16 text-center shadow-lg"
        >
          {/* Floating decorative blobs */}
          <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-primary-100/70 blur-2xl animate-floaty" />
          <div className="absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-coral-100/70 blur-2xl animate-floaty"
               style={{ animationDelay: '-3s' }} />

          <h2 className="relative text-4xl lg:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight">
            Hire your next teammate <span className="text-primary-500">this week.</span>
          </h2>
          <p className="relative mt-4 text-lg text-neutral-600 max-w-xl mx-auto">
            Free 14-day trial. No credit card required. Cancel anytime.
          </p>
          <div className="relative mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="btn-primary group">
              Start free trial
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/login" className="btn-ghost">Sign in</Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
