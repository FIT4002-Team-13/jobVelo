import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Sidebar from '../components/common/Sidebar'
import StartInterviewModal from '../components/job-candidate/StartInterviewModal'
import EditCandidateForm from '../components/candidate/EditCandidateForm'
import { flex, page } from '../styles/layout'
import { useToast } from '../components/common/ToastContext.jsx'
import { api, downloadFileWithAuth } from '../lib/api.js'

import ScoreEvidencePopup from '../components/candidate/ScoreEvidencePopup'
import InterviewPlanCard from '../components/candidate/InterviewPlanCard.jsx'
import CandidateScorePanel from '../components/candidate/CandidateScorePanel.jsx'
import FeedbackPanel from '../components/candidate/FeedbackPanel.jsx'
import CandidateInfoCard from '../components/candidate/CandidateInfoCard.jsx'

export default function CandidateDetailPage() {
  const { candId, jobId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

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
  const [showScoreEvidence, setShowScoreEvidence] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [cvAnalysis, setCvAnalysis] = useState(null)
  const [analysingCv, setAnalysingCv] = useState(false)

  // Analyse the candidate's already-stored CV against THIS job - no
  // re-upload. The backend reuses the candidate's cand_cv_url file; we set
  // the returned "processing" doc so the existing poll picks up completion.
  async function handleAnalyseCv() {
    if (!jobCand?.jobcand_id || analysingCv) return
    setAnalysingCv(true)
    try {
      const fd = new FormData()
      fd.append('jobcand_id', jobCand.jobcand_id)
      const data = await api.analyseCv(fd)
      setCvAnalysis(data)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err?.message || 'Could not start the CV analysis.')
    } finally {
      setAnalysingCv(false)
    }
  }

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

        // One aggregate call replaces the old Promise.all of candidate +
        // job-candidates + interviews + job, plus the follow-up
        // interview-users -> users pair for the interviewer name.
        const detail = await api.getCandidateDetail(candId, jobId)

        if (!detail.job_candidate) {
          throw new Error('Candidate-job link not found for this job.')
        }

        setCandidate(detail.candidate)
        setJobCand(detail.job_candidate)
        setInterview(detail.interview ?? null)
        setJob(detail.job)
        setInterviewerUserId(detail.interviewer?.user_id || '')
        setInterviewerName(detail.interviewer?.full_name || '--')
      } catch (err) {
        setError(err.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [candId, jobId, refreshKey])

  // The company-wide job list only feeds the Edit modal's "Assign to Job"
  // <select> - fetch it lazily the first time that modal opens rather than
  // on every page load.
  useEffect(() => {
    if (!showEditModal || jobs.length) return
    api
      .listJobs()
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]))
  }, [showEditModal, jobs.length])

  async function onConfirmStart() {
    try {
      const existing = await api
        .listInterviews({ cand_id: candId, job_id: jobId })
        .catch(() => [])
      const resumable = (Array.isArray(existing) ? existing : []).find(
        (i) => i.intv_status === 'in_progress' || i.intv_status === 'scheduled'
      )
      if (resumable) {
        navigate(`/interview/${resumable.intv_id}`)
        return
      }

      const interviewRecord = await api.createInterview({
        cand_id: candId,
        job_id: jobId,
        intv_date_time: new Date().toISOString(),
        intv_status: 'in_progress',
      })
      navigate(`/interview/${interviewRecord.intv_id}`)
    } catch (err) {
      console.error('Failed to start interview', err)
      alert(err.message || 'Failed to start interview.')
      setStartTarget(null)
    }
  }

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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-6 shrink-0">
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
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-4">

        <div className="mb-3 grid grid-cols-11 gap-5 items-stretch">
          <div className="col-span-7">
            <CandidateInfoCard
              candidate={candidate}
              job={job}
              interview={interview}
              jobCand={jobCand}
              interviewer={interviewerName}
              onStartInterview={() => {
                if (interview?.intv_status === 'in_progress') {
                  navigate(`/interview/${interview.intv_id}`)
                  return
                }
                setStartTarget({
                  name: candidate?.cand_full_name,
                  scheduled_at: interview?.intv_date_time,
                })
              }}
              onEdit={() => setShowEditModal(true)}
              cvAnalysis={cvAnalysis}
              onViewCvAnalysis={() => {
                if (!jobCand?.jobcand_id) return
                navigate(`/cv-analysis/${jobCand.jobcand_id}`, {
                  state: { analysis: cvAnalysis },
                })
              }}
              onAnalyseCv={handleAnalyseCv}
              analysingCv={analysingCv}
            />
          </div>
          <div className="col-span-4">
            <CandidateScorePanel
              jobCand={jobCand}
              interview={interview}
              onViewEvidence={() => setShowScoreEvidence(true)}
              onViewTranscription={() => {
                if (!interview?.intv_id) return

                navigate(`/interview/${interview.intv_id}`)
              }}
            />
          </div>
        </div>

        <InterviewPlanCard jobId={jobId} candId={candId} jobCand={jobCand} />

        <FeedbackPanel
          interview={interview}
          onDownloadCandidateReport={() => {
            if (!interview?.intv_id) return
            // No filename arg: the server's Content-Disposition carries
            // "<kind>-report-<candidate>-<interview datetime>.pdf".
            downloadFileWithAuth(`/api/interviews/${interview.intv_id}/candidate-report`)
              .catch((err) => toast.error(err.message || 'Failed to download the report.'))
          }}
          onDownloadInterviewerReport={() => {
            if (!interview?.intv_id) return
            downloadFileWithAuth(`/api/interviews/${interview.intv_id}/interviewer-report`)
              .catch((err) => toast.error(err.message || 'Failed to download the report.'))
          }}
        />
        </main>
      </div>

      {startTarget && (
        <StartInterviewModal
          candidate={startTarget}
          jobTitle={job?.title}
          onClose={() => setStartTarget(null)}
          // Resume-or-create via onConfirmStart - the old inline handler
          // only navigated when an interview record already existed, so
          // confirming on a fresh candidate silently did nothing.
          onConfirm={() => {
            setStartTarget(null)
            onConfirmStart()
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
      )}{showScoreEvidence && (
        <ScoreEvidencePopup
          ratings={jobCand?.ratings}
          onClose={() => setShowScoreEvidence(false)}
        />
      )}
    </div>
  )
}