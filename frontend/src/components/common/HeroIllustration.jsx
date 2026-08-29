import { motion } from 'framer-motion'
import { Mic, Sparkles } from 'lucide-react'

// One anchor object, one accessory, one chip - not a collage. The anchor
// is the product's wow moment (the AI interview report, real palette and
// anatomy); a small live-interview card peeks out behind it to hint at
// where the report comes from; the original soft "cloud" backdrop unifies
// the whole composition.

const SCORE_BARS = [
  { label: 'Communication',   pct: 84, bar: 'bg-primary-500' },
  { label: 'Skill',           pct: 76, bar: 'bg-coral-400' },
  { label: 'Problem Solving', pct: 90, bar: 'bg-mint-500' },
]

// Fixed pseudo-random heights so the waveform looks organic but renders
// identically on every visit.
const WAVE = [12, 20, 9, 24, 15, 27, 12, 21, 10]

export default function HeroIllustration({ className = '' }) {
  return (
    <div className={`relative mx-auto max-w-[560px] aspect-[5/4] ${className}`}>
      {/* Cloud backdrop - one soft shape holding the scene together. */}
      <div className="absolute inset-4 rounded-[40%] bg-gradient-to-br from-primary-50 via-white to-mint-50 shadow-lg" />

      {/* Accessory: live interview, tucked behind the report's top-right. */}
      <motion.div
        className="absolute right-[6%] top-[8%] w-[38%] rotate-3 rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-lg"
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-700">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-sky-100">
              <Mic size={11} className="text-sky-500" />
            </span>
            Live interview
          </div>
          <span className="flex items-center gap-1 text-[9px] font-bold text-coral-500">
            <motion.span
              className="h-1.5 w-1.5 rounded-pill bg-coral-500"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            REC
          </span>
        </div>
        <div className="flex h-7 items-center justify-center gap-[3px]">
          {WAVE.map((h, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-pill bg-sky-400"
              style={{ height: h }}
              animate={{ scaleY: [1, 0.4, 1] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
            />
          ))}
        </div>
      </motion.div>

      {/* Anchor: the AI interview report. */}
      <motion.div
        className="absolute left-[6%] top-[22%] z-10 w-[64%] rounded-2xl border border-neutral-100 bg-white p-5 shadow-xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Card header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary-100">
              <Sparkles size={12} className="text-primary-500" />
            </span>
            Interview Report
          </div>
          <span className="rounded-pill bg-mint-100 px-2.5 py-0.5 text-[10px] font-bold text-mint-700">
            ✓ Ready
          </span>
        </div>

        {/* Candidate row */}
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-primary-500 text-xs font-bold text-white">
            SD
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-1/2 rounded-pill bg-neutral-200" />
            <div className="h-1.5 w-1/3 rounded-pill bg-neutral-100" />
          </div>
          {/* Overall score donut - draws itself in on load. */}
          <div className="relative h-14 w-14 shrink-0">
            <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
              <circle cx="28" cy="28" r="22" fill="none" strokeWidth="6" className="stroke-neutral-100" />
              <motion.circle
                cx="28" cy="28" r="22" fill="none" strokeWidth="6" strokeLinecap="round"
                className="stroke-primary-500"
                strokeDasharray={2 * Math.PI * 22}
                initial={{ strokeDashoffset: 2 * Math.PI * 22 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 22 * (1 - 0.84) }}
                transition={{ duration: 1.4, delay: 0.8, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-sm font-extrabold text-neutral-800">8.4</span>
            </div>
          </div>
        </div>

        {/* Score bars - the report's real three metrics. */}
        <div className="space-y-2.5">
          {SCORE_BARS.map((b, i) => (
            <div key={b.label}>
              <div className="mb-1 flex justify-between text-[10px] font-semibold">
                <span className="text-neutral-500">{b.label}</span>
                <span className="tabular-nums text-neutral-600">{(b.pct / 10).toFixed(1)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-pill bg-neutral-100">
                <motion.div
                  className={`h-full rounded-pill ${b.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${b.pct}%` }}
                  transition={{ duration: 1, delay: 0.5 + i * 0.15, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Single chip - kept clear of both cards. */}
      <motion.div
        className="absolute bottom-[10%] right-[12%] z-10 rounded-pill bg-mint-400 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md"
        animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        ✓ AI shortlisted
      </motion.div>
    </div>
  )
}
