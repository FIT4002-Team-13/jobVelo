import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'

const stats = [
  { value: 65,   suffix: '%',   label: 'Faster time-to-hire',  color: 'text-primary-500' },
  { value: 1200, suffix: '+',   label: 'Hiring teams onboard', color: 'text-coral-500' },
  { value: 4.9,  suffix: '/5',  label: 'Average team rating',  color: 'text-mint-500',   decimals: 1 },
  { value: 38,   suffix: '%',   label: 'Better offer accept',  color: 'text-primary-500' },
]

export default function StatsSection() {
  return (
    <section className="py-section">
      <div className="container-page">
        <div className="rounded-3xl bg-brand-gradient px-8 py-14 lg:px-16 lg:py-20 text-white shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-dotted" />
          <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {stats.map((s, i) => (
              <Stat key={i} {...s} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, suffix, label, decimals = 0 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const motionValue = useMotionValue(0)
  const display = useTransform(motionValue, (v) => v.toFixed(decimals))

  useEffect(() => {
    if (inView) {
      const controls = animate(motionValue, value, { duration: 1.4, ease: 'easeOut' })
      return controls.stop
    }
  }, [inView, value, motionValue])

  return (
    <div ref={ref}>
      <div className="text-5xl lg:text-6xl font-extrabold tracking-tight flex items-baseline gap-1">
        <motion.span>{display}</motion.span>
        <span className="text-3xl">{suffix}</span>
      </div>
      <div className="mt-2 text-sm font-medium text-white/80">{label}</div>
    </div>
  )
}
