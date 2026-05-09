import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import HeroIllustration from '../common/HeroIllustration.jsx'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: 'easeOut' },
  }),
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft glow background */}
      <div className="absolute inset-0 -z-10 bg-hero-glow" />
      {/* Animated blobs */}
      <div className="absolute -top-24 -left-20 -z-10 h-96 w-96 bg-primary-100/60 animate-blob blur-3xl" />
      <div className="absolute top-40 -right-16 -z-10 h-80 w-80 bg-coral-100/60 animate-blob blur-3xl"
           style={{ animationDelay: '-4s' }} />

      <div className="container-page pt-16 pb-24 lg:pt-24 lg:pb-32 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left column */}
        <div>
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="eyebrow mb-6"
          >
            <Sparkles size={14} /> AI-guided hiring
          </motion.div>

          <h1 className="font-display text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
            <motion.span variants={fadeUp} initial="hidden" animate="show" custom={1}
              className="block text-primary-500">Smart Recruit.</motion.span>
            <motion.span variants={fadeUp} initial="hidden" animate="show" custom={2}
              className="block text-coral-500">Better hires.</motion.span>
            <motion.span variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="block text-mint-400">Instantly.</motion.span>
          </h1>

          <motion.p
            variants={fadeUp} initial="hidden" animate="show" custom={4}
            className="mt-6 max-w-lg text-lg text-neutral-600"
          >
            Smart Recruit gives your team a single dashboard to manage interviews, monitor
            progress and move the best candidates forward, powered by AI, guided by instinct.
          </motion.p>

          <motion.div
            variants={fadeUp} initial="hidden" animate="show" custom={5}
            className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4"
          >
            <Link to="/signup" className="btn-primary group">
              Get Started
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/login" className="link-quiet">Already have an account?</Link>
          </motion.div>
        </div>

        {/* Right column - illustrated mock */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
          className="relative"
        >
          <HeroIllustration />
        </motion.div>
      </div>
    </section>
  )
}
