import { useState } from 'react'

// Shared post-interview report body, used by BOTH the completion pop-up
// (InterviewPage, narrow) and the Reports panel on the candidate detail
// page (wide), so the two read identically.
//
// Design goals (US28 + the "noisy / all over the place" feedback):
//   - every section is a contained card of equal weight, so a wide panel
//     shows tidy aligned columns instead of a full-width / half-width /
//     full-width zig-zag;
//   - one scannable point per line, not a wall of prose;
//   - each point carries 1-2 timestamped transcript quotes as EVIDENCE,
//     hidden by default and revealed by a chevron - claim is the headline,
//     proof is one click away;
//   - job requirements shown as met/gap rows with the same disclosure.
//
// `variant`: "grid" (wide panel - columns) | "stack" (modal - single column).
// The distinction is a prop, not a CSS breakpoint, because both render on
// the same desktop viewport so responsive classes can't separate them.
//
// Item shape is tolerant: pre-US28 reports stored plain strings, new ones
// store { point, evidence: [{ timestamp, quote }] }.

function normalisePoint(item) {
  if (typeof item === 'string') return { point: item, evidence: [] }
  return {
    point: item?.point ?? '',
    evidence: Array.isArray(item?.evidence) ? item.evidence : [],
  }
}

function hasQuotes(evidence) {
  return (Array.isArray(evidence) ? evidence : []).some((e) => (e?.quote ?? '').trim())
}

function Chevron({ open }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Timestamped quotes under a point: a timestamp chip + the quote in a quiet
// left-bordered block so it reads as support, not body copy.
function EvidenceList({ evidence }) {
  const shown = (Array.isArray(evidence) ? evidence : []).filter((e) => (e?.quote ?? '').trim())
  if (shown.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 pl-4">
      {shown.map((ev, i) => (
        <div key={i} className="flex items-start gap-2">
          {ev.timestamp ? (
            // White chip so the timestamp reads on any tinted card.
            <span className="mt-px shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-neutral-500">
              {ev.timestamp}
            </span>
          ) : null}
          <p className="border-l-2 border-neutral-300/50 pl-2 text-xs italic leading-relaxed text-neutral-600">
            &ldquo;{ev.quote}&rdquo;
          </p>
        </div>
      ))}
    </div>
  )
}

// One strength / improvement point. Whole row toggles when there's evidence.
function PointRow({ point, evidence, dotClass }) {
  const [open, setOpen] = useState(false)
  const canOpen = hasQuotes(evidence)
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        disabled={!canOpen}
        className={`flex w-full items-start gap-2 text-left ${canOpen ? 'group' : 'cursor-default'}`}
      >
        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill ${dotClass}`} aria-hidden />
        <span className="flex-1 text-sm leading-snug text-neutral-700">{point}</span>
        {canOpen ? (
          <span className="mt-0.5 text-neutral-300 transition-colors group-hover:text-neutral-500">
            <Chevron open={open} />
          </span>
        ) : null}
      </button>
      {open ? <EvidenceList evidence={evidence} /> : null}
    </li>
  )
}

// One job-requirement row: met/gap pill + requirement, evidence (or the
// legacy justification) behind the same chevron disclosure.
function RequirementRow({ requirement, addressed, justification, evidence }) {
  const [open, setOpen] = useState(false)
  const quotes = hasQuotes(evidence)
  const canOpen = quotes || !!justification
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        disabled={!canOpen}
        className={`flex w-full items-start gap-2 text-left ${canOpen ? 'group' : 'cursor-default'}`}
      >
        <span
          className={`mt-px shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            addressed ? 'bg-mint-100 text-mint-700' : 'bg-coral-100 text-coral-600'
          }`}
        >
          {addressed ? 'Met' : 'Gap'}
        </span>
        <span className="flex-1 text-sm leading-snug text-neutral-700">{requirement}</span>
        {canOpen ? (
          <span className="mt-0.5 text-neutral-300 transition-colors group-hover:text-neutral-500">
            <Chevron open={open} />
          </span>
        ) : null}
      </button>
      {open ? (
        quotes ? (
          <EvidenceList evidence={evidence} />
        ) : (
          <p className="mt-1.5 pl-4 text-xs leading-relaxed text-neutral-500">{justification}</p>
        )
      ) : null}
    </li>
  )
}

// A tinted section card: soft coloured fill + matching dot/heading, a
// small dot+label+count header, then the list. Equal weight to every other
// card so columns align.
//   strengths    -> mint      improvements -> coral
//   requirements -> primary
const TINTS = {
  mint:    { bg: 'bg-mint-50',    dot: 'bg-mint-500',    heading: 'text-mint-700'    },
  coral:   { bg: 'bg-coral-50',   dot: 'bg-coral-500',   heading: 'text-coral-600'   },
  primary: { bg: 'bg-primary-50', dot: 'bg-primary-500', heading: 'text-primary-600' },
}

function SectionCard({ title, tint, children, count }) {
  const t = TINTS[tint] ?? TINTS.primary
  return (
    <div className={`flex h-full flex-col gap-3 rounded-2xl p-4 ${t.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-pill ${t.dot}`} aria-hidden />
        <h4 className={`text-xs font-bold uppercase tracking-wider ${t.heading}`}>{title}</h4>
        {count > 0 ? <span className="text-xs font-semibold text-neutral-400">{count}</span> : null}
      </div>
      {children}
    </div>
  )
}

function PointSection({ title, tint, items }) {
  const dotClass = (TINTS[tint] ?? TINTS.primary).dot
  const points = (items ?? []).map(normalisePoint).filter((p) => p.point.trim())
  return (
    <SectionCard title={title} tint={tint} count={points.length}>
      {points.length === 0 ? (
        <p className="pl-4 text-sm italic text-neutral-400">None noted.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {points.map((p, i) => (
            <PointRow key={`${p.point}-${i}`} point={p.point} evidence={p.evidence} dotClass={dotClass} />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function RequirementSection({ requirements }) {
  return (
    <SectionCard title="Job Requirements" tint="primary" count={requirements.length}>
      <ul className="flex flex-col gap-2">
        {requirements.map((r, i) => (
          <RequirementRow
            key={`${r.requirement}-${i}`}
            requirement={r.requirement}
            addressed={r.addressed}
            justification={r.justification}
            evidence={r.evidence}
          />
        ))}
      </ul>
    </SectionCard>
  )
}

/**
 * Props:
 *   report - InterviewFeedback { summary, strengths, improvements,
 *            requirements_mapping }
 *   showRequirements - render the job-requirements card (candidate tab only)
 *   variant - "grid" (wide panel, aligned columns) | "stack" (modal)
 */
export default function ReportSections({ report, showRequirements = false, variant = 'grid' }) {
  const summary = report?.summary?.trim()
  const requirements = showRequirements ? report?.requirements_mapping ?? [] : []
  const showReq = requirements.length > 0

  const summaryBox = summary ? (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">Summary</h4>
      <p className="text-sm leading-relaxed text-neutral-700">{summary}</p>
    </div>
  ) : null

  const strengths = <PointSection title="Strengths" tint="mint" items={report?.strengths?.items} />
  const improvements = (
    <PointSection title="Improvements" tint="coral" items={report?.improvements?.items} />
  )
  const reqSection = showReq ? <RequirementSection requirements={requirements} /> : null

  if (variant === 'stack') {
    // Modal - single readable column.
    return (
      <div className="flex flex-col gap-4">
        {summaryBox}
        {strengths}
        {improvements}
        {reqSection}
      </div>
    )
  }

  // Wide panel - summary full width, then equal aligned columns.
  return (
    <div className="flex flex-col gap-4">
      {summaryBox}
      <div className={`grid gap-4 ${showReq ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {strengths}
        {improvements}
        {reqSection}
      </div>
    </div>
  )
}
