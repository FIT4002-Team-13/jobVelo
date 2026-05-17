import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

export default function HeroIllustration({ className = '' }) {
  return (
    <div className={`relative mx-auto max-w-[560px] aspect-[5/4] ${className}`}>
      {/* Cloud background */}
      <div className="absolute inset-4 rounded-[40%] bg-gradient-to-br from-primary-50 via-white to-mint-50 shadow-lg" />

      {/* Main browser card */}
      <motion.div
        className="absolute left-[8%] top-[18%] w-[62%] rounded-2xl bg-white shadow-xl border border-neutral-100"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-neutral-100">
          <span className="h-2.5 w-2.5 rounded-pill bg-coral-300" />
          <span className="h-2.5 w-2.5 rounded-pill bg-mint-300" />
          <span className="h-2.5 w-2.5 rounded-pill bg-primary-300" />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-pill bg-primary-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-2/3 rounded-pill bg-neutral-200" />
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={10} className="fill-coral-400 stroke-coral-400" />
                ))}
              </div>
            </div>
          </div>
          {[
            { bg: 'bg-mint-100',    dot: 'bg-mint-500',    label: 'AI suggests: candidate' },
            { bg: 'bg-primary-100', dot: 'bg-primary-500', label: 'Set the interview' },
            { bg: 'bg-coral-100',   dot: 'bg-coral-500',   label: 'Great match for role' },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <span className={`h-4 w-4 rounded-pill ${row.bg} flex items-center justify-center`}>
                <span className={`h-1.5 w-1.5 rounded-pill ${row.dot}`} />
              </span>
              <div className="h-2 flex-1 rounded-pill bg-neutral-100" />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Feedback card */}
      <motion.div
        className="absolute right-[4%] top-[12%] w-[40%] rounded-2xl bg-white shadow-xl border border-neutral-100 p-3"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <div className="text-xs font-bold text-neutral-700 mb-2">Feedback</div>
        {['bg-mint-200', 'bg-coral-200', 'bg-primary-200'].map((bg, n) => (
          <div key={n} className="flex items-center gap-2 mb-2 last:mb-0">
            <div className={`h-7 w-7 rounded-pill ${bg}`} />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-3/4 rounded-pill bg-neutral-200" />
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={7} className="fill-coral-400 stroke-coral-400" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Floating chips */}
      <motion.div
        className="absolute left-[2%] top-[8%] rounded-pill bg-mint-400 text-white text-xs font-semibold px-3 py-1.5 shadow-md"
        animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        ✓ AI shortlisted
      </motion.div>
      <motion.div
        className="absolute right-[10%] bottom-[12%] rounded-pill bg-primary-500 text-white text-xs font-semibold px-3 py-1.5 shadow-md"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      >
        +12 new candidates
      </motion.div>
    </div>
  )
}
