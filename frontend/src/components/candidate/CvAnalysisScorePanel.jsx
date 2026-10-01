import { card, flex } from '../../styles/layout'
import ScoreBar from '../common/ScoreBar.jsx'
import FitVerdict, { FIT_METRICS } from './FitVerdict.jsx'

export default function CvAnalysisScorePanel({ cvAnalysis }) {
  const positionFit = cvAnalysis?.position_fit
  const hasScore = Boolean(positionFit)

  return (
    <div className={`${card.base} ${flex.col} h-full`}>
      <div className={`${flex.rowBetween} items-center`}>
        <h2 className="text-lg font-bold text-neutral-800">CV Analysis</h2>
        {hasScore && <FitVerdict positionFit={positionFit} />}
      </div>

      {hasScore ? (
        <div className={`${flex.col} gap-3 mt-5 px-1`}>
          {FIT_METRICS.map((m) => (
            <ScoreBar
              key={m.key}
              label={m.label.toUpperCase()}
              value={positionFit?.[m.key]}
              barClass={m.bar}
            />
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-neutral-400 italic text-center">No CV analysis available.</p>
      )}
    </div>
  )
}
