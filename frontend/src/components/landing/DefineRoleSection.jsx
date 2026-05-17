import { motion } from 'framer-motion'

export default function DefineRoleSection() {
  return (
    <section className="py-section bg-neutral-50/60">
      <div className="container-page grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
        >
          <span className="eyebrow mb-4">Job creation</span>
          <h2 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
            Define the role. <span className="text-coral-500">Find the person.</span>
          </h2>
          <p className="mt-5 text-lg text-neutral-600 max-w-md">
            Spin up a polished role spec in seconds. Smart Recruit writes the description,
            tags requirements and starts sourcing the moment you hit publish.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {['Front-end Dev', 'Project Manager', 'Senior Full Stack', 'Intern Front-end'].map((t, i) => (
              <span key={t}
                    className={`rounded-pill px-3.5 py-1.5 text-xs font-semibold ${
                      i === 1 ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700'
                    }`}>
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="relative mx-auto max-w-[560px]"
        >
          {/* Background card */}
          <div className="absolute inset-0 translate-x-6 translate-y-6 rounded-2xl bg-primary-100/60" />

          {/* Form card */}
          <div className="relative rounded-2xl bg-white border border-neutral-100 shadow-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-pill bg-coral-300" />
                <span className="h-2.5 w-2.5 rounded-pill bg-mint-300" />
                <span className="h-2.5 w-2.5 rounded-pill bg-primary-300" />
              </div>
              <div className="text-sm font-bold">Create Job</div>
              <span className="text-xs text-neutral-400">×</span>
            </div>

            <form className="space-y-4">
              <Field label="Job Title" placeholder="e.g. Senior Frontend Engineer" />
              <Field label="Job Description" placeholder="Write or let AI draft for you..." textarea />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employment Type" placeholder="Full-time" />
                <Field label="No. of Candidates" placeholder="3" />
              </div>
              <Field label="Expected Salary" placeholder="$80,000 — $100,000" />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost !py-2 !px-4 !text-xs">Cancel</button>
                <button type="button" className="btn-primary !py-2 !px-4 !text-xs">Publish</button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Field({ label, placeholder, textarea }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-neutral-500 mb-1">{label}</span>
      {textarea ? (
        <div className="h-20 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-400">
          {placeholder}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-400">
          {placeholder}
        </div>
      )}
    </label>
  )
}
