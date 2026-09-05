import { useState } from 'react'
import { card, flex } from '../../styles/layout'
import ReportSections from '../interview/ReportSections.jsx'

function PanelEmptyState({ tone = 'neutral', children }) {
  const bg = tone === 'mint' ? 'bg-mint-50' : 'bg-neutral-50'
  return (
    <div className={`flex min-h-[190px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl px-6 py-8 text-center ${bg}`}>
      {children}
    </div>
  )
}

function BiasTabContent({ incidents, completed }) {
  const list = Array.isArray(incidents) ? incidents : []

  if (!completed) {
    return (
      <PanelEmptyState tone="neutral">
        <svg
          width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-neutral-400"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
        <p className="text-sm font-bold text-neutral-600">Interview not completed</p>
        <p className="max-w-md text-sm leading-7 text-neutral-500">
          Bias is checked live during the interview. Any flagged questions will appear here once
          it has been completed.
        </p>
      </PanelEmptyState>
    )
  }

  if (list.length === 0) {
    return (
      <PanelEmptyState tone="mint">
        <svg
          width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-mint-500"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <p className="text-sm font-bold text-mint-700">No bias detected</p>
        <p className="max-w-md text-sm leading-7 text-neutral-500">
          No potentially biased or legally-risky questions were detected during this interview.
        </p>
      </PanelEmptyState>
    )
  }

  return (
    <div className="flex max-h-[320px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
      {list.map((incident, index) => (
        <div
          key={index}
          className="rounded-xl border-l-[3px] border-amber-400 bg-amber-50/60 py-2.5 pl-4 pr-3"
        >
          <div className={`${flex.rowBetween} gap-2`}>
            {incident.category && (
              <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                {incident.category}
              </span>
            )}
            {incident.timestamp && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-400">
                {incident.timestamp}
              </span>
            )}
          </div>
          <p className="mt-1.5 break-words text-sm italic leading-relaxed text-neutral-800">
            &ldquo;{incident.quote}&rdquo;
          </p>
          {incident.reason && (
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{incident.reason}</p>
          )}
          {incident.suggestion && (
            <p className="mt-1.5 text-xs leading-relaxed text-mint-700">
              <span className="font-semibold">Try instead:</span> {incident.suggestion}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function FeedbackPanel({ interview, onDownloadCandidateReport, onDownloadInterviewerReport }) {
  const [activeTab, setActiveTab] = useState('candidate')

  const candidateReport   = interview?.intv_candidate_report
  const interviewerReport = interview?.intv_interviewer_report
  const biasIncidents     = Array.isArray(interview?.intv_bias_incidents) ? interview.intv_bias_incidents : []
  const biasCount         = biasIncidents.length
  const isBiasTab         = activeTab === 'bias'
  const activeReport      = activeTab === 'candidate' ? candidateReport
                          : activeTab === 'interviewer' ? interviewerReport
                          : null
  const hasActiveReport   = !!activeReport
  const hasAnyReport      = !!candidateReport || !!interviewerReport
  const interviewCompleted = interview?.intv_status === 'completed' || hasAnyReport

  const handleDownload = () => {
    if (!hasActiveReport) return
    if (activeTab === 'candidate') {
      onDownloadCandidateReport?.()
    } else {
      onDownloadInterviewerReport?.()
    }
  }

  const tabClass = (isActive) =>
    `rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${
      isActive
        ? 'bg-primary-500 text-white'
        : 'bg-primary-100 text-primary-500 hover:bg-primary-200'
    }`

  return (
    <section className={`${card.base} ${flex.col} w-full gap-4`}>
      <div className={flex.rowBetween}>
        <h2 className="text-lg font-bold text-neutral-800">Reports</h2>

        {!isBiasTab && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!hasActiveReport}
            title={hasActiveReport
              ? `Download the ${activeTab} report`
              : `No ${activeTab} report has been generated yet.`}
            className={`rounded-xl px-5 py-0.5 text-sm font-semibold text-white transition-colors ${
              hasActiveReport
                ? 'bg-primary-500 hover:bg-primary-600'
                : 'cursor-not-allowed bg-neutral-400'
            }`}
          >
            Download
          </button>
        )}
      </div>

      <div className={`${flex.row} gap-3`}>
        <button type="button" onClick={() => setActiveTab('candidate')} className={tabClass(activeTab === 'candidate')}>
          CANDIDATE
        </button>
        <button type="button" onClick={() => setActiveTab('interviewer')} className={tabClass(activeTab === 'interviewer')}>
          INTERVIEWER
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bias')}
          className={`rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${flex.row} items-center gap-1.5 ${
            isBiasTab
              ? 'bg-amber-500 text-white'
              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          }`}
        >
          BIAS
          {biasCount > 0 && (
            <span
              className={`rounded-pill px-1.5 text-[10px] font-bold leading-4 ${
                isBiasTab ? 'bg-white/30 text-white' : 'bg-amber-500 text-white'
              }`}
            >
              {biasCount}
            </span>
          )}
        </button>
      </div>

      {isBiasTab ? (
        <BiasTabContent incidents={biasIncidents} completed={interviewCompleted} />
      ) : hasActiveReport ? (
        <ReportSections
          report={activeReport}
          showRequirements={activeTab === 'candidate'}
          variant="grid"
        />
      ) : (
        <PanelEmptyState tone="neutral">
          <p className="text-md font-semibold text-neutral-500">
            No {activeTab} report generated yet.
          </p>
        </PanelEmptyState>
      )}
    </section>
  )
}
