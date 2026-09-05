import Avatar from '../common/Avatar'
import { card, flex } from '../../styles/layout'
import { formatScore } from '../../utils/format.js'

const INTERVIEW_STATUS_ROWS = [
  { key: 'NOT SCHEDULED', label: 'Not Scheduled', dot: 'bg-neutral-400' },
  { key: 'SCHEDULED',     label: 'Scheduled',     dot: 'bg-primary-500' },
  { key: 'COMPLETED',     label: 'Completed',     dot: 'bg-mint-500'    },
]

export default function InterviewStatusPanel({ candidates }) {
  const counts = INTERVIEW_STATUS_ROWS.reduce((acc, { key }) => ({ ...acc, [key]: 0 }), {})
  let scoreSum = 0, scoreCount = 0

  for (const c of candidates) {
    if (counts[c.status] !== undefined) counts[c.status]++
    if (c.score != null) { scoreSum += c.score; scoreCount++ }
  }

  const total = candidates.length
  const avgScore = scoreCount > 0 ? formatScore(scoreSum / scoreCount) : '--'
  const uniqueInterviewers = [...new Set(candidates.map((c) => c.interviewer).filter(Boolean))]

  return (
    <div className={`${card.base} ${flex.col} gap-4`}>
      <h2 className="text-base font-bold text-neutral-800">Interview Status</h2>

      <div className="text-center">
        <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Total Candidates</p>
        <p className="text-5xl font-extrabold text-primary-500">{total}</p>
      </div>

      <div className={`${flex.col} gap-1.5`}>
        {INTERVIEW_STATUS_ROWS.map(({ key, label, dot }) => (
          <div key={key} className={`${flex.rowBetween} text-sm`}>
            <span className={`${flex.row} gap-2`}>
              <span className={`w-2 h-2 rounded-pill ${dot}`} aria-hidden />
              <span className="text-neutral-500 font-medium">{label}</span>
            </span>
            <span className="font-bold text-neutral-700">{counts[key]}</span>
          </div>
        ))}
      </div>

      <hr className="border-neutral-100" />

      <div className={flex.rowBetween}>
        <div>
          <p className="text-xs text-neutral-400 mb-2">Interviewer</p>
          <div className={flex.row}>
            {uniqueInterviewers.slice(0, 5).map((name, i) => (
              <Avatar key={i} name={name} size="sm" className="border-2 border-neutral-0 -ml-2 first:ml-0" />
            ))}
            {uniqueInterviewers.length > 5 && (
              <div className={`w-7 h-7 rounded-pill bg-neutral-200 ${flex.rowCenter} text-xs font-bold text-neutral-500 border-2 border-neutral-0 -ml-2`}>
                +{uniqueInterviewers.length - 5}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400 mb-1">Average Score</p>
          <p className="text-xl font-extrabold text-neutral-700">{avgScore}</p>
        </div>
      </div>
    </div>
  )
}
