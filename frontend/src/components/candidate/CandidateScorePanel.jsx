import { card, flex } from '../../styles/layout'
import ScoreBar from '../common/ScoreBar.jsx'
import { formatScore } from '../../utils/format.js'

export default function CandidateScorePanel({ jobCand, interview, onViewEvidence, onViewTranscription }) {
  const ratings = jobCand?.ratings
  const hasInterviewRatings = Boolean(ratings)
  const interviewScores = hasInterviewRatings
    ? [ratings.communication?.score, ratings.technical_skills?.score, ratings.problem_solving?.score].filter(
        (score) => typeof score === 'number' && Number.isFinite(score),
      )
    : []
  const interviewOverallScore =
    interviewScores.length > 0
      ? interviewScores.reduce((total, score) => total + score, 0) / interviewScores.length
      : null
  const hasTranscript = Array.isArray(interview?.intv_transcript) && interview.intv_transcript.length > 0
  const overallScore = interviewOverallScore != null ? formatScore(interviewOverallScore) : '--'
  const rank = jobCand?.rank == null ? 'NA' : `#${jobCand.rank}`
  const hasScore = overallScore !== '--'
  const scoreRows = [
    { label: 'COMMUNICATION',   value: ratings?.communication?.score,    colorClass: 'bg-sky-500'   },
    { label: 'TECHNICAL SKILLS', value: ratings?.technical_skills?.score, colorClass: 'bg-coral-500' },
    { label: 'PROBLEM SOLVING',  value: ratings?.problem_solving?.score,  colorClass: 'bg-mint-400'  },
  ]

  return (
    <div className={`${card.base} ${flex.col} h-full justify-between`}>
      <h2 className="text-lg font-bold text-neutral-800">Scores</h2>

      <div
        className={`mx-auto mt-1 flex h-[90px] w-[170px] flex-col items-center justify-center rounded-xl ${
          hasScore ? 'bg-primary-100' : 'bg-neutral-100'
        }`}
      >
        <p className={`text-xs uppercase tracking-wide ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
          FINAL SCORE
        </p>
        <p className={`mt-1 text-4xl font-extrabold leading-none ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
          {overallScore}
        </p>
      </div>

      <div className={`${flex.col} gap-3 mt-3 px-1`}>
        {scoreRows.map((item) => (
          <ScoreBar
            key={item.label}
            label={item.label}
            value={item.value}
            barClass={item.colorClass}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-800">RANK</p>
        <p className="text-sm font-semibold text-neutral-800">{rank}</p>
      </div>
      <button
        type="button"
        onClick={onViewEvidence}
        disabled={!hasInterviewRatings}
        className={`mt-4 w-full rounded-[18px] px-4 py-1.5 text-sm font-semibold transition-colors ${
          hasInterviewRatings
            ? 'bg-primary-500 text-white hover:bg-primary-600'
            : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
        }`}
      >
        View Score and Evidence
      </button>
      <button
        type="button"
        onClick={onViewTranscription}
        disabled={!hasTranscript}
        className={`mt-4 w-full rounded-[18px] px-4 py-1.5 text-sm font-semibold text-white transition-colors ${
          hasTranscript
            ? 'bg-primary-500 hover:bg-primary-600'
            : 'cursor-not-allowed bg-neutral-400'
        }`}
      >
        View Transcription
      </button>
    </div>
  )
}
