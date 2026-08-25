import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Sidebar from '../components/common/Sidebar'
import StartInterviewModal from '../components/job-candidate/StartInterviewModal'
import EditCandidateForm from '../components/candidate/EditCandidateForm'
import { card, flex, page } from '../styles/layout'
import { useAuth } from '../lib/AuthContext.jsx'
import { api, authedFetch } from '../lib/api.js'

function formatDate(iso) {
  if (!iso) return '--'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(iso) {
  if (!iso) return '--'

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'

  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()

  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return isToday ? `Today, ${time}` : `${formatDate(iso.slice(0, 10))} ${time}`
}

function formatScore(value) {
  if (value == null) return '--'
  return Number(value).toFixed(1)
}

function getInitials(name = '') {
  const safeName = typeof name === 'string' ? name.trim() : ''

  const initials = safeName
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
    <div className='grid grid-cols-[1.55fr_2fr_0.35fr] items-center gap-x-4 '>
      <p className='text-xs font-medium leading-[1.1] text-neutral-800 '>
        {label}
      </p>

      <div className='h-1 w-full rounded-pill bg-neutral-200 '>
        <div
          className={`h-1 rounded-pill ${isMissing ? 'bg-neutral-300' : colorClass}`}
          style={{ width }}
        />
      </div>

      <p className='text-right text-xs font-medium leading-none text-neutral-800'>
        {displayValue}
      </p>
    </div>
  )
}

function CandidateScorePanel({ jobCand, interview, onViewTranscription, cvAnalysis}) {
  
  const ratings = jobCand?.ratings;
  const hasInterviewRatings = Boolean(ratings);
  const interviewScores = hasInterviewRatings? [ratings.communication?.score, ratings.technical_skills?.score, ratings.problem_solving?.score].filter((score) => typeof score === "number" && Number.isFinite(score)) : [];
  const interviewOverallScore = interviewScores.length > 0? interviewScores.reduce((total, score) => total + score, 0) / interviewScores.length : null;
  const hasCvAnalysis = cvAnalysis?.status === "completed";
  const hasTranscript = Array.isArray(interview?.intv_transcript) && interview.intv_transcript.length > 0;
  const cvScores = hasCvAnalysis? [cvAnalysis.position_fit?.relevant_experience, cvAnalysis.position_fit?.technical_fit, cvAnalysis.position_fit?.soft_skills].filter((score) => typeof score === "number" && Number.isFinite(score)) : [];
  const cvOverallScore = cvScores.length > 0 ? cvScores.reduce((total, score) => total + score, 0) / cvScores.length : null;
  const finalScoreValue = hasInterviewRatings ? interviewOverallScore : cvOverallScore;
  const overallScore = finalScoreValue != null ? formatScore(finalScoreValue) : "--";
  const scoreLabel = hasInterviewRatings ? "FINAL SCORE" : "CV SCORE";
  const rank = jobCand?.rank == null ? "NA" : `#${jobCand.rank}`;
  const hasScore = overallScore !== "--";
  const scoreRows = hasInterviewRatings ? [
      {
        label: "COMMUNICATION",
        value: ratings.communication?.score,
        colorClass: "bg-sky-500",
      },
      {
        label: "TECHNICAL SKILLS",
        value: ratings.technical_skills?.score,
        colorClass: "bg-coral-500",
      },
      {
        label: "PROBLEM SOLVING",
        value: ratings.problem_solving?.score,
        colorClass: "bg-mint-400",
      },
    ]
  : [
      {
        label: "RELEVANT EXPERIENCE",
        value:
          cvAnalysis?.position_fit
            ?.relevant_experience,
        colorClass: "bg-coral-500",
      },
      {
        label: "TECHNICAL FIT",
        value:
          cvAnalysis?.position_fit
            ?.technical_fit,
        colorClass: "bg-primary-500",
      },
      {
        label: "SOFT SKILLS",
        value:
          cvAnalysis?.position_fit
            ?.soft_skills,
        colorClass: "bg-mint-400",
      },

  ];

  return (
    <div className={`${card.base} ${flex.col} h-full justify-between`}>
      <h2 className="text-lg font-bold text-neutral-800">Scores</h2>

      <div
        className={`mx-auto mt-1 flex h-[90px] w-[170px] flex-col items-center justify-center rounded-xl ${
          hasScore ? 'bg-primary-100' : 'bg-neutral-100'
        }`}
      >
        <p className={`text-xs uppercase tracking-wide ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
          {scoreLabel}
        </p>

        <p className={`mt-1 text-4xl font-extrabold leading-none ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
          {overallScore}
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
        disabled={!hasTranscript}
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

function ReportCard({ title, children, bgClass, titleColor}) {
  return (
    <div className={`h-full rounded-2xl p-6 ${bgClass}`}>
      <h3 className={`mb-1 text-md font-bold uppercase ${titleColor}`}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function BulletList({ items = [] }) {
  if (!items.length) return null

  return (
    <ul className="mb-6 list-disc space-y-1 pl-5 text-sm leading-7 text-neutral-900">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function FeedbackPanel({
  interview,
  candidateTableHeight = 230,
  onDownloadCandidateReport,
  onDownloadInterviewerReport,
}) {
  const [activeTab, setActiveTab] = useState('candidate')

  // Check the actual report fields rather than the interview's status flag.
  // intv_status can disagree with the truth in either direction (marked
  // "completed" before reports land, or marked "scheduled" while the LLM
  // pipeline has already filled in one of the two reports). The fields
  // themselves are the source of truth for what we can render.
  const candidateReport   = interview?.intv_candidate_report
  const interviewerReport = interview?.intv_interviewer_report
  const activeReport      = activeTab === 'candidate' ? candidateReport : interviewerReport
  const hasActiveReport   = !!activeReport
  // Panel grows to full height when either tab has something to show, so
  // switching between tabs doesn't make the card jump in size if only one
  // report has been generated so far.
  const hasAnyReport      = !!candidateReport || !!interviewerReport
  const panelHeight       = hasAnyReport ? candidateTableHeight : candidateTableHeight / 2

  const summary = activeReport?.summary ?? ''
  const strengthsItems = activeReport?.strengths?.items ?? []
  const strengthsJustification = activeReport?.strengths?.justification ?? ''
  const improvementsItems = activeReport?.improvements?.items ?? []
  const improvementsJustification = activeReport?.improvements?.justification ?? ''

  const handleDownload = () => {
    // Only fire the download when the report actually exists on the doc -
    // otherwise the backend would just hand back an empty file.
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
    <section
      className={`${card.base} ${flex.col} w-full gap-3`}
      style={{ minHeight: `${panelHeight}px` }}
    >
      <div className={flex.rowBetween}>
        <h2 className="text-lg font-bold text-neutral-800">Reports</h2>

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

      {hasActiveReport ? (
        <div className="grid flex-1 grid-cols-3 gap-6">
          <ReportCard title="SUMMARY" bgClass="bg-neutral-50">
            <p className="text-sm leading-7 text-neutral-900">{summary}</p>
          </ReportCard>

          <ReportCard
            title="STRENGTHS"
            titleColor="text-mint-700"
            bgClass="bg-mint-50"
          >
            <BulletList items={strengthsItems} />

            <h4 className="mb-2 text-md font-bold uppercase text-mint-700">
              JUSTIFICATION
            </h4>
            <p className="text-sm leading-7 text-neutral-900">
              {strengthsJustification}
            </p>
          </ReportCard>

          <ReportCard
            title="IMPROVEMENTS"
            titleColor="text-coral-500"
            bgClass="bg-coral-50"
          >
            <BulletList items={improvementsItems} />

            <h4 className="mb-2 text-md font-bold uppercase text-coral-500">
              JUSTIFICATION
            </h4>
            <p className="text-sm leading-7 text-neutral-900">
              {improvementsJustification}
            </p>
          </ReportCard>
        </div>
      ) : (
        // Per-tab empty state - shows on whichever tab is active when that
        // specific report hasn't been generated yet. Switching tabs still
        // works, so a user can see the other tab's report if only one has
        // landed.
        <div className="flex flex-1 items-center justify-center rounded-2xl bg-neutral-50 px-6 py-10">
          <p className="text-center text-md font-semibold text-neutral-500">
            No {activeTab} report generated yet.
          </p>
        </div>
      )}
    </section>
  )
}

// CV "View" button, driven by the analysis lifecycle for this application:
//   - analysis completed  → solid primary button, opens the analysis report
//   - analysis processing → disabled button with a spinner ("Analysing…")
//   - analysis failed     → disabled coral button, error in the tooltip
//   - no analysis yet     → legacy behaviour: link to cand_cv_url if one
//                           exists, otherwise the greyed-out disabled state
function CvViewButton({ cvAnalysis, cvUrl, onViewAnalysis }) {
  const base =
    'inline-flex min-w-[98px] items-center justify-center gap-1.5 rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors'

  if (cvAnalysis?.status === 'processing') {
    return (
      <button
        type="button"
        disabled
        title="The CV is being analysed - this button unlocks when it's done."
        className={`${base} cursor-wait bg-primary-100 text-primary-500`}
      >
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.2-8.56" />
        </svg>
        Analysing…
      </button>
    )
  }

  if (cvAnalysis?.status === 'failed') {
    return (
      <button
        type="button"
        disabled
        title={cvAnalysis.error || 'Analysis failed. Re-upload the CV via Edit to retry.'}
        className={`${base} cursor-not-allowed bg-coral-100 text-coral-700`}
      >
        Failed
      </button>
    )
  }

  if (cvAnalysis?.status === 'completed') {
    return (
      <button
        type="button"
        onClick={onViewAnalysis}
        className={`${base} bg-primary-500 text-white hover:bg-primary-600`}
      >
        View
      </button>
    )
  }

  return (
    <a
      href={cvUrl || '#'}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${
        cvUrl
          ? 'bg-primary-500 text-white hover:bg-primary-600'
          : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
      }`}
      onClick={(e) => {
        if (!cvUrl) e.preventDefault()
      }}
    >
      View
    </a>
  )
}

function CandidateInfoCard({ candidate, job, interview, onStartInterview, interviewer, onEdit, cvAnalysis, onViewCvAnalysis }) {
  const { user } = useAuth()
  const status = (interview?.intv_status ?? 'not_scheduled').replace(/_/g, ' ').toUpperCase()
  // Starting an interview is interviewer-only - mirrors the backend's
  // Depends(require_role("interviewer")) on POST /api/interviews. Other
  // roles simply never see the button rather than hitting a 403.
  const canStartInterview = status === 'SCHEDULED' && user?.role === 'interviewer'

  // Unified palette - mirrors JobDetailPage / DashboardPage / ApplicationsPage
  // so the same status reads identically wherever it appears. Key change:
  // SCHEDULED now uses primary blue (was grey) so it's visually distinct
  // from NOT SCHEDULED, which keeps the muted grey.
  const statusClass =
    status === 'SCHEDULED'
      ? 'bg-primary-100 text-primary-600'
      : status === 'EVALUATED'
      ? 'bg-mint-100 text-mint-700'
      : status === 'HIRED'
      ? 'bg-mint-500 text-white'
      : status === 'REJECTED'
      ? 'bg-coral-100 text-coral-700'
      // NOT SCHEDULED + anything unknown
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
          {/* Start Interview is the primary action on this page, so it lives
              here in the header as a solid CTA (only when the interview is
              actually scheduled) instead of being tucked into the DATE row. */}
          {canStartInterview && (
            <button
              type="button"
              onClick={onStartInterview}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start Interview
            </button>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="rounded-pill border border-neutral-200 hover:bg-neutral-50 bg-white px-4 py-0.5 text-sm font-semibold text-neutral-500"
          >
            Edit
          </button>

          <span className={`rounded-pill px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[3fr_4fr] gap-x-16 gap-y-5">
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
          <p className="text-sm font-medium text-neutral-400">
            {formatDateTime(interview?.intv_date_time)}
          </p>
        </div>

        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-800">
            EMAIL
          </p>
          <p className="text-md font-medium text-neutral-400">
            {candidate?.cand_email || '--'}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-800">
            PHONE
          </p>
          <p className="text-md font-medium text-neutral-400">
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
              {interviewer || '--'}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">
            CV / RESUME
          </p>
          <CvViewButton
            cvAnalysis={cvAnalysis}
            cvUrl={candidate?.cand_cv_url}
            onViewAnalysis={onViewCvAnalysis}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-800">
            COVER LETTER
          </p>
          {/* Mirror the CV "View" button exactly so both documents present
              identically - a greyed-out disabled button when no file exists. */}
          <a
            href={candidate?.cand_cover_letter_url || '#'}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-w-[98px] justify-center rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${
              candidate?.cand_cover_letter_url
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
            }`}
            onClick={(e) => {
              if (!candidate?.cand_cover_letter_url) e.preventDefault()
            }}
          >
            View
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
  const [interviewerName, setInterviewerName] = useState('--')
  const [interviewerUserId, setInterviewerUserId] = useState('')
  const [jobs, setJobs] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startTarget, setStartTarget] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [cvAnalysis, setCvAnalysis] = useState(null)

  // Load the CV analysis for this application and poll while it's still
  // processing, so the "View" button flips from spinner to available the
  // moment the background analysis lands. A 404 just means no CV has been
  // uploaded yet.
  useEffect(() => {
    const jobcandId = jobCand?.jobcand_id
    if (!jobcandId) {
      setCvAnalysis(null)
      return undefined
    }

    let cancelled = false
    let timer = null

    async function fetchAnalysis() {
      try {
        const data = await api.getCvAnalysisByJobcand(jobcandId)
        if (cancelled) return
        setCvAnalysis(data)
        if (data?.status === 'processing') {
          timer = setTimeout(fetchAnalysis, 4000)
        }
      } catch {
        if (!cancelled) setCvAnalysis(null)
      }
    }

    fetchAnalysis()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobCand?.jobcand_id, refreshKey])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        setInterviewerName('--')
        setInterviewerUserId('')

        const [candRes, jobCandRes, intvRes, jobRes, allJobsRes] = await Promise.all([
          authedFetch(`/api/candidates/${candId}`),
          authedFetch(`/api/job-candidates/by-candidate/${candId}`),
          authedFetch(`/api/interviews?cand_id=${candId}&job_id=${jobId}`),
          authedFetch(`/api/jobs/${jobId}`),
          authedFetch('/api/jobs'),
        ])

        if (!candRes.ok) throw new Error('Candidate not found.')
        if (!jobCandRes.ok) throw new Error('Failed to load candidate-job link.')
        if (!intvRes.ok) throw new Error('Failed to load interview.')
        if (!jobRes.ok) throw new Error('Job not found.')

        const candData = await candRes.json()
        const allJobCandidates = await jobCandRes.json()
        const allInterviews = await intvRes.json()
        const jobData = await jobRes.json()
        const allJobsData = allJobsRes.ok ? await allJobsRes.json() : []

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
        setJobs(Array.isArray(allJobsData) ? allJobsData : [])

        if (selectedInterview?.intv_id && user?.comp_id) {
          const intvUserRes = await authedFetch(
            `/api/interview-users/by-interview/${selectedInterview.intv_id}`
          )

          if (intvUserRes.ok) {
            const interviewUsers = await intvUserRes.json()
            const interviewerUserId = Array.isArray(interviewUsers)
              ? interviewUsers[0]?.user_id
              : null

            if (interviewerUserId) {
              setInterviewerUserId(interviewerUserId)
              const usersRes = await authedFetch(`/api/users`)

              if (usersRes.ok) {
                const usersData = await usersRes.json()
                const matchedUser = Array.isArray(usersData)
                  ? usersData.find((u) => u.userid === interviewerUserId)
                  : null

                setInterviewerName(
                  matchedUser?.full_name ||
                  matchedUser?.username ||
                  matchedUser?.email ||
                  '--'
                )
              }
            }
          }
        }
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [candId, jobId, user?.comp_id, refreshKey])

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
              onClick={() => navigate(-1)}
              className={`${flex.row} mb-3 gap-2 rounded-lg border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-sm font-semibold text-neutral-600 transition-colors hover:border-primary-200 hover:bg-primary-500/10 hover:text-primary-600`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
              </svg>
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
              interviewer={interviewerName}
              onStartInterview={() =>
                setStartTarget({
                  name: candidate?.cand_full_name,
                  scheduled_at: interview?.intv_date_time,
                })
              }
              onEdit={() => setShowEditModal(true)}
              cvAnalysis={cvAnalysis}
              onViewCvAnalysis={() => {
                if (!jobCand?.jobcand_id) return
                navigate(`/cv-analysis/${jobCand.jobcand_id}`, {
                  state: { analysis: cvAnalysis },
                })
              }}
            />
          </div>
          <div className="col-span-4">
            <CandidateScorePanel
              jobCand={jobCand}
              cvAnalysis={cvAnalysis}
              interview={interview}
              onViewTranscription={() => {
                if (!interview?.intv_transcript?.length) return;

                console.log("Open transcript view");
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
          onConfirm={() => {
            setStartTarget(null)
            if (interview?.intv_id) {
              navigate(`/interview/${interview.intv_id}`)
            }
          }}
        />
      )}

      {showEditModal && (
        <EditCandidateForm
          jobs={jobs}
          initialData={{
            cand_id: candidate?.cand_id,
            application_id: jobCand?.jobcand_id,
            candidate_name: candidate?.cand_full_name,
            email: candidate?.cand_email,
            phone: candidate?.cand_phone,
            job_id: jobCand?.job_id,
            interviewer: interviewerName === '--' ? '' : interviewerName,
            interviewer_user_id: interviewerUserId,
            interview_datetime: interview?.intv_date_time ?? null,
            cv_url: candidate?.cand_cv_url,
            cover_letter_url: candidate?.cand_cover_letter_url,
          }}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}