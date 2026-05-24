import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Sidebar from '../components/common/Sidebar'
import StartInterviewModal from '../components/job-candidate/StartInterviewModal'
import { card, flex, page } from '../styles/layout'
import { useAuth } from '../lib/AuthContext.jsx'

function formatDate(iso) {
  if (!iso) return '--'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(iso) {
  if (!iso) return '--'

  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()

  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return isToday ? `Today, ${time}` : `${formatDate(iso.slice(0, 10))}, ${time}`
}

function formatScore(value) {
  if (value == null) return '--'
  return Number(value).toFixed(1)
}

function getInitials(name = '') {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return initials || '--'
}

function ScoreBarRow({ label, value, colorClass }) {
  const isMissing = value == null
  const displayValue = isMissing ? '--' : formatScore(value)
  const width = isMissing
    ? '100%'
    : `${Math.min((Number(value) / 10) * 100, 100)}%`

  return (
    <div className="grid grid-cols-[1.55fr_2fr_0.35fr] items-center gap-x-4 ">
      <p className="text-xs font-medium leading-[1.1] text-neutral-800 ">
        {label}
      </p>

      <div className="h-1 w-full rounded-pill bg-neutral-200 ">
        <div
          className={`h-1 rounded-pill ${isMissing ? 'bg-neutral-300' : colorClass}`}
          style={{ width }}
        />
      </div>

      <p className="text-right text-xs font-medium leading-none text-neutral-800">
        {displayValue}
      </p>
    </div>
  )
}

function CandidateScorePanel({ jobCand, interview, onViewTranscription }) {
  const computedFinalScore =
    jobCand?.communication_score == null ||
    jobCand?.skill_score == null ||
    jobCand?.problem_solving_score == null
      ? null
      : (
          (jobCand.communication_score +
            jobCand.skill_score +
            jobCand.problem_solving_score) / 3
        )

  const finalScore =
    jobCand?.final_score != null
      ? formatScore(jobCand.final_score)
      : computedFinalScore != null
      ? formatScore(computedFinalScore)
      : '--'

  const rank = jobCand?.rank == null ? 'NA' : `#${jobCand.rank}`
  const hasScore = finalScore !== '--'

  const scoreRows = [
    {
      label: 'COMMUNICATION',
      value: jobCand?.communication_score,
      colorClass: 'bg-sky-500',
    },
    {
      label: 'SKILL',
      value: jobCand?.skill_score,
      colorClass: 'bg-coral-500',
    },
    {
      label: 'PROBLEM SOLVING',
      value: jobCand?.problem_solving_score,
      colorClass: 'bg-mint-400',
    },
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

        <p className={`mt-1 text-xl font-extrabold leading-none ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
          {finalScore}
        </p>
      </div>

      <div className={`${flex.col} gap-3 mt-3 px-1`}>
        {scoreRows.map((item) => (
          <ScoreBarRow
            key={item.label}
            label={item.label}
            value={item.value}
            colorClass={item.colorClass}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-800">RANK</p>
        <p className="text-sm font-semibold text-neutral-800">{rank}</p>
      </div>

      <button
        type="button"
        onClick={onViewTranscription}
        disabled={!interview?.intv_transcript}
        className={`mt-4 w-full rounded-[18px] px-4 py-1.5 text-sm font-semibold text-white transition-colors ${
          interview?.intv_transcript
            ? 'bg-primary-500 hover:bg-primary-600'
            : 'bg-neutral-400 cursor-not-allowed'
        }`}
      >
        View Transcription
      </button>
    </div>
  )
}

function ReportCard({
  title,
  titleColorClass = 'text-neutral-500',
  bgClass = 'bg-neutral-50',
  children,
}) {
  return (
    <div className={`h-full rounded-2xl p-6 ${bgClass}`}>
      <h3 className={`mb-4 text-[18px] font-bold uppercase ${titleColorClass}`}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function BulletList({ items = [] }) {
  if (!items.length) return null

  return (
    <ul className="mb-6 list-disc space-y-1 pl-5 text-[16px] leading-7 text-neutral-900">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function FeedbackPanel({
  interview,
  jobCand,
  candidateTableHeight = 230,
  onDownloadCandidateReport,
  onDownloadInterviewerReport,
}) {
  const [activeTab, setActiveTab] = useState('candidate')

  const interviewDone = jobCand?.status && jobCand.status !== 'SCHEDULED'

  const panelHeight = interviewDone
    ? candidateTableHeight
    : candidateTableHeight / 2

  const activeReport =
    activeTab === 'candidate'
      ? interview?.intv_candidate_report
      : interview?.intv_interviewer_report

  const summary = activeReport?.summary ?? ''
  const strengthsItems = activeReport?.strengths?.items ?? []
  const strengthsJustification = activeReport?.strengths?.justification ?? ''
  const improvementsItems = activeReport?.improvements?.items ?? []
  const improvementsJustification = activeReport?.improvements?.justification ?? ''

  const handleDownload = () => {
    if (!interviewDone) return

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
    <section
      className={`${card.base} ${flex.col} w-full gap-3`}
      style={{ minHeight: `${panelHeight}px` }}
    >
      <div className={flex.rowBetween}>
        <h2 className="text-lg font-bold text-neutral-800">Reports</h2>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!interviewDone}
          className={`rounded-xl px-5 py-0.5 text-sm font-semibold text-white transition-colors ${
            interviewDone
              ? 'bg-primary-500 hover:bg-primary-600'
              : 'cursor-not-allowed bg-neutral-400'
          }`}
        >
          Download
        </button>
      </div>

      <div className={`${flex.row} gap-3`}>
        <button
          type="button"
          onClick={() => setActiveTab('candidate')}
          className={tabClass(activeTab === 'candidate')}
        >
          CANDIDATE
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('interviewer')}
          className={tabClass(activeTab === 'interviewer')}
        >
          INTERVIEWER
        </button>
      </div>

      {interviewDone ? (
        <div className="grid flex-1 grid-cols-3 gap-6">
          <ReportCard title="SUMMARY" bgClass="bg-neutral-50">
            <p className="text-[16px] leading-7 text-neutral-900">{summary}</p>
          </ReportCard>

          <ReportCard
            title="STRENGTHS"
            titleColorClass="text-mint-700"
            bgClass="bg-mint-50"
          >
            <BulletList items={strengthsItems} />

            <h4 className="mb-3 text-[18px] font-bold uppercase text-mint-700">
              JUSTIFICATION
            </h4>
            <p className="text-[16px] leading-7 text-neutral-900">
              {strengthsJustification}
            </p>
          </ReportCard>

          <ReportCard
            title="IMPROVEMENTS"
            titleColorClass="text-coral-500"
            bgClass="bg-coral-50"
          >
            <BulletList items={improvementsItems} />

            <h4 className="mb-3 text-[18px] font-bold uppercase text-coral-500">
              JUSTIFICATION
            </h4>
            <p className="text-[16px] leading-7 text-neutral-900">
              {improvementsJustification}
            </p>
          </ReportCard>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl bg-neutral-50 px-6 py-10">
          <p className="text-center text-[16px] font-semibold text-neutral-500">
            Interview is incomplete. No feedback generated yet.
          </p>
        </div>
      )}
    </section>
  )
}

function CandidateInfoCard({ candidate, job, interview, onStartInterview, interviewer, jobCand }) {
  const status = jobCand?.status ?? 'NOT SCHEDULED'
  const canStartInterview = status === 'SCHEDULED'

  
  const statusClass =
    status === 'EVALUATED'
      ? 'bg-primary-100 text-primary-500'
      : status === 'SCHEDULED'
      ? 'bg-neutral-200 text-neutral-600'
      : status === 'HIRED'
      ? 'bg-mint-50 text-mint-700'
      : status === 'REJECTED'
      ? 'bg-coral-50 text-coral-500'
      : 'bg-neutral-100 text-neutral-500'

  return (
    <section className={`${card.base} ${flex.col} h-full`}>
      <div className={flex.rowBetween}>
        <div className='mb-3'>
          <h2 className="text-2xl font-bold text-neutral-800">
            {candidate?.cand_full_name || '--'}
          </h2>
          <p className={`text-sm text-neutral-400 mt-0.5 ${flex.row} gap-1`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            Last Update {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-pill bg-neutral-100 px-4 py-0.5 text-[14px] font-semibold text-neutral-500"
          >
            Edit
          </button>

          <span className={`rounded-pill px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-16 gap-y-5">
        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">
            ROLE
          </p>
          <p className="inline-flex rounded-pill bg-primary-100 px-4 py-0.5 text-sm font-semibold text-primary-500">
            {job?.title || '--'}
          </p>
        </div>

        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">
            DATE
          </p>

          <div className="grid grid-cols-[1fr_272px] items-center gap-4">
            <p className="min-w-0 text-sm font-medium text-neutral-400">
              {formatDateTime(interview?.intv_date_time)}
            </p>

            <div className="flex justify-end">
              {canStartInterview && (
                <button
                  type="button"
                  onClick={onStartInterview}
                  className="inline-flex w-[150px] items-center justify-center gap-2 rounded-xl bg-primary-100 px-4 py-0.5 text-sm font-semibold text-primary-500 transition-colors hover:bg-primary-200"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Start Interview
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">
            EMAIL
          </p>
          <p className="text-[16px] font-medium text-neutral-400">
            {candidate?.cand_email || '--'}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-800">
            PHONE
          </p>
          <p className="text-[16px] font-medium text-neutral-400">
            {candidate?.cand_phone || '--'}
          </p>
        </div>
      </div>

      <div className="mt-6 h-px w-[48%] bg-neutral-200" />

      <div className="mt-6 grid grid-cols-3 gap-x-10">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-800">
            INTERVIEWER
          </p>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-primary-500 text-xs font-bold text-white">
              {getInitials(interviewer)}
            </div>
            <span className="text-sm font-medium text-neutral-800">
              {interviewer}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">
            CV / RESUME
          </p>
          <a
            href={candidate?.cand_cv_url || '#'}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-w-[98px] justify-center rounded-xl px-4 py-0.5 text-[14px] font-semibold transition-colors ${
              candidate?.cand_cv_url
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
            }`}
            onClick={(e) => {
              if (!candidate?.cand_cv_url) e.preventDefault()
            }}
          >
            View
          </a>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">
            COVER LETTER
          </p>
          <a
            href={candidate?.cand_cover_letter_url || '#'}
            target="_blank"
            rel="noreferrer"
            className={`text-[16px] font-medium underline-offset-2 ${
              candidate?.cand_cover_letter_url
                ? 'text-primary-500 hover:underline'
                : 'pointer-events-none text-neutral-400'
            }`}
            onClick={(e) => {
              if (!candidate?.cand_cover_letter_url) e.preventDefault()
            }}
          >
            johndoe_cl.pdf
          </a>
        </div>
      </div>
    </section>
  )
}

export default function CandidateDetailPage() {
  const { candId, jobId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [candidate, setCandidate] = useState(null)
  const [jobCand, setJobCand] = useState(null)
  const [job, setJob] = useState(null)
  const [interview, setInterview] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startTarget, setStartTarget] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')

        const [candRes, jobCandRes, intvRes, jobRes] = await Promise.all([
          fetch(`/api/candidates/${candId}`),
          fetch(`/api/job-candidates/by-candidate/${candId}`),
          fetch(`/api/interviews?cand_id=${candId}&job_id=${jobId}`),
          fetch(`/api/jobs/${jobId}`),
        ])

        if (!candRes.ok) throw new Error('Candidate not found.')
        if (!jobCandRes.ok) throw new Error('Failed to load candidate-job link.')
        if (!intvRes.ok) throw new Error('Failed to load interview.')
        if (!jobRes.ok) throw new Error('Job not found.')

        const candData = await candRes.json()
        const allJobCandidates = await jobCandRes.json()
        const allInterviews = await intvRes.json()
        const jobData = await jobRes.json()

        if (!Array.isArray(allJobCandidates)) {
          throw new Error('Candidate-job response is invalid.')
        }

        if (!Array.isArray(allInterviews)) {
          throw new Error('Interview response is invalid.')
        }

        const selectedJobCand = allJobCandidates.find(
          (item) => item.job_id === jobId
        )

        if (!selectedJobCand) {
          throw new Error('Candidate-job link not found for this job.')
        }

        const selectedInterview = allInterviews[0] ?? null

        setCandidate(candData)
        setJobCand(selectedJobCand)
        setInterview(selectedInterview)
        setJob(jobData)
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [candId, jobId])

  if (loading) {
    return (
      <div className={page.loading}>
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={page.loading}>
        <p className="text-sm text-coral-500">{error}</p>
      </div>
    )
  }

  return (
    <div className={page.shell}>
      <Sidebar />

      <main className={page.main}>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/jobs')}
              className={`${flex.row} mb-3 gap-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-sm font-semibold text-neutral-600 transition-colors hover:border-primary-200 hover:bg-primary-500/10 hover:text-primary-600`}
            >
              Back
            </button>

            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              Candidate
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Manage all candidates across jobs
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-11 gap-5 items-stretch">
          <div className="col-span-7">
            <CandidateInfoCard
              candidate={candidate}
              job={job}
              interview={interview}
              jobCand={jobCand}
              interviewer={user?.full_name || '--'}
              onStartInterview={() => setStartTarget(candidate)}
            />
          </div>
          <div className="col-span-4">
          <CandidateScorePanel
            jobCand={jobCand}
            interview={interview}
            onViewTranscription={() => {
              if (!interview?.intv_transcript) return
              console.log('Open transcript view')
            }}
          />
          </div>
        </div>

        <FeedbackPanel
          interview={interview}
          jobCand={jobCand}
          candidateTableHeight={230}
          onDownloadCandidateReport={() => {
            if (!interview?.intv_id) return
            window.open(`/api/interviews/${interview.intv_id}/candidate-report`, '_blank')
          }}
          onDownloadInterviewerReport={() => {
            if (!interview?.intv_id) return
            window.open(`/api/interviews/${interview.intv_id}/interviewer-report`, '_blank')
          }}
        />
      </main>

      {startTarget && (
        <StartInterviewModal
          candidate={startTarget}
          jobTitle={job?.title}
          onClose={() => setStartTarget(null)}
          onConfirm={() => setStartTarget(null)}
        />
      )}
    </div>
  )
}