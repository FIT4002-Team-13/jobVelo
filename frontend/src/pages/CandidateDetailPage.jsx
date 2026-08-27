import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import Sidebar from '../components/common/Sidebar'
import StartInterviewModal from '../components/job-candidate/StartInterviewModal'
import EditCandidateForm from '../components/candidate/EditCandidateForm'
import { card, flex, page } from '../styles/layout'
import { useAuth } from '../lib/AuthContext.jsx'
import { api, authedFetch } from '../lib/api.js'

const SECTION_COLORS = [
  { bg: 'bg-primary-50',  border: 'border-primary-200',  dot: 'bg-primary-400',  time: 'text-primary-500' },
  { bg: 'bg-sky-50',      border: 'border-sky-200',      dot: 'bg-sky-400',      time: 'text-sky-500'     },
  { bg: 'bg-mint-50',     border: 'border-mint-200',     dot: 'bg-mint-400',     time: 'text-mint-600'    },
  { bg: 'bg-coral-50',    border: 'border-coral-200',    dot: 'bg-coral-400',    time: 'text-coral-500'   },
]

function InterviewPlanCard({ jobId, candId, jobCand }) {
  const [state, setState] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [sections, setSections] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [totalMinutes, setTotalMinutes] = useState(60)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [addingNew, setAddingNew] = useState(false)
  const dragSrcIndex = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [newDraft, setNewDraft] = useState({ name: '', description: '', suggested_minutes: 10 })

  useEffect(() => {
    if (Array.isArray(jobCand?.plan_sections) && jobCand.plan_sections.length > 0) {
      setSections(jobCand.plan_sections)
      setState('done')
    } else {
      setSections([])
      setState('idle')
    }
  }, [jobCand?.jobcand_id])

  function persist(updated) {
    if (!jobCand?.jobcand_id) return
    authedFetch(`/api/job-candidates/${jobCand.jobcand_id}/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_sections: updated }),
    }).catch(() => {})
  }

  async function generate() {
    setState('loading')
    setErrorMsg('')
    setEditingIndex(null)
    setAddingNew(false)
    try {
      const res = await authedFetch('/api/interviews/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, cand_id: candId, total_minutes: totalMinutes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || `Request failed (${res.status})`)
      }
      const data = await res.json()
      const plan = Array.isArray(data) ? data : []
      if (plan.length === 0) {
        throw new Error('No sections were returned. Please try again.')
      }
      setSections(plan)
      setState('done')
      persist(plan)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.')
      setState('error')
    }
  }

  function startEdit(i) {
    setEditingIndex(i)
    setEditDraft({ ...sections[i] })
    setAddingNew(false)
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditDraft(null)
  }

  function commitEdit() {
    if (!editDraft?.name?.trim()) return
    const updated = sections.map((s, i) =>
      i === editingIndex
        ? { ...editDraft, suggested_minutes: Number(editDraft.suggested_minutes) || 5 }
        : s
    )
    setSections(updated)
    setEditingIndex(null)
    setEditDraft(null)
    persist(updated)
  }

  function deleteSection(i) {
    const updated = sections.filter((_, idx) => idx !== i)
    setSections(updated)
    if (editingIndex === i) { setEditingIndex(null); setEditDraft(null) }
    persist(updated)
    if (updated.length === 0) setState('idle')
  }

  function startAdd() {
    setAddingNew(true)
    setNewDraft({ name: '', description: '', suggested_minutes: 10 })
    setEditingIndex(null)
    setEditDraft(null)
  }

  function cancelAdd() { setAddingNew(false) }

  function reorderSection(from, to) {
    const updated = [...sections]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    setSections(updated)
    persist(updated)
  }

  function commitAdd() {
    if (!newDraft.name.trim()) return
    const updated = [
      ...sections,
      { name: newDraft.name.trim(), description: newDraft.description.trim(), suggested_minutes: Number(newDraft.suggested_minutes) || 10 },
    ]
    setSections(updated)
    setAddingNew(false)
    setState('done')
    persist(updated)
  }

  const plannedMinutes = sections.reduce((s, x) => s + (x.suggested_minutes || 0), 0)

  const fieldClass = 'w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-primary-400'

  return (
    <section className={`${card.base} ${flex.col} gap-4 mb-6`}>
      {/* Header */}
      <div className={flex.rowBetween}>
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Interview Plan</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            AI-suggested sections based on this role and candidate
          </p>
        </div>

        <div className={`${flex.row} items-center gap-3`}>
          {/* Total duration param */}
          <label className={`${flex.row} items-center gap-1.5`}>
            <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap">Total duration</span>
            <input
              type="number"
              min={10}
              max={240}
              value={totalMinutes}
              onChange={(e) => setTotalMinutes(Number(e.target.value) || 60)}
              className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
            <span className="text-xs text-neutral-400">min</span>
          </label>

          {state === 'done' ? (
            <>
              <span className="text-xs text-neutral-400">{plannedMinutes} min planned</span>
              <button
                type="button"
                onClick={generate}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
              >
                Regenerate
              </button>
            </>
          ) : state !== 'loading' ? (
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Generate Plan
            </button>
          ) : null}
        </div>
      </div>

      {/* Idle empty state */}
      {state === 'idle' && (
        <div className="flex items-center justify-center rounded-2xl bg-neutral-50 px-6 py-10">
          <div className={`${flex.col} items-center gap-2 text-center`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300">
              <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>
            </svg>
            <p className="text-sm font-semibold text-neutral-400">No plan generated yet</p>
            <p className="text-xs text-neutral-400 max-w-xs">
              Set a total duration above and click &ldquo;Generate Plan&rdquo; to get AI-suggested sections.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {state === 'loading' && (
        <div className="flex items-center justify-center rounded-2xl bg-neutral-50 px-6 py-10">
          <div className={`${flex.col} items-center gap-3`}>
            <svg className="animate-spin text-primary-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <p className="text-sm text-neutral-400">Generating interview plan…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="flex items-center justify-center rounded-2xl bg-coral-50 px-6 py-6">
          <p className="text-sm text-coral-600">{errorMsg}</p>
        </div>
      )}

      {/* Sections grid */}
      {state === 'done' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sections.map((section, i) => {
            const color = SECTION_COLORS[i % SECTION_COLORS.length]

            if (editingIndex === i) {
              return (
                <div key={i} className={`${flex.col} gap-2 rounded-2xl border-2 border-primary-300 bg-primary-50 p-3`}>
                  <input
                    className={fieldClass}
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Section name"
                    autoFocus
                  />
                  <textarea
                    className={`${fieldClass} resize-none`}
                    rows={3}
                    value={editDraft.description}
                    onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Description"
                  />
                  <div className={`${flex.row} items-center gap-1`}>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="w-14 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
                      value={editDraft.suggested_minutes}
                      onChange={(e) => setEditDraft((d) => ({ ...d, suggested_minutes: e.target.value }))}
                    />
                    <span className="text-xs text-neutral-400">min</span>
                  </div>
                  <div className={`${flex.row} gap-2 mt-1`}>
                    <button type="button" onClick={cancelEdit} className="flex-1 rounded-lg border border-neutral-200 bg-white py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-50">
                      Cancel
                    </button>
                    <button type="button" onClick={commitEdit} disabled={!editDraft?.name?.trim()} className="flex-1 rounded-lg bg-primary-500 py-1 text-xs font-semibold text-white hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed">
                      Save
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={i}
                draggable
                onDragStart={() => { dragSrcIndex.current = i }}
                onDragOver={(e) => { e.preventDefault(); if (dragSrcIndex.current !== i) setDragOverIndex(i) }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => { e.preventDefault(); if (dragSrcIndex.current !== null && dragSrcIndex.current !== i) reorderSection(dragSrcIndex.current, i); setDragOverIndex(null) }}
                onDragEnd={() => { dragSrcIndex.current = null; setDragOverIndex(null) }}
                className={`${flex.col} gap-2 rounded-2xl border p-4 ${color.bg} ${color.border} cursor-grab active:cursor-grabbing active:opacity-50 transition-opacity ${dragOverIndex === i ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}
              >
                <div className={`${flex.row} items-center gap-2`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-neutral-300 shrink-0">
                    <circle cx="2" cy="2" r="1"/><circle cx="8" cy="2" r="1"/>
                    <circle cx="2" cy="5" r="1"/><circle cx="8" cy="5" r="1"/>
                    <circle cx="2" cy="8" r="1"/><circle cx="8" cy="8" r="1"/>
                  </svg>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                  <span className="text-sm font-bold text-neutral-800 leading-tight flex-1">{section.name}</span>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed flex-1">{section.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs font-semibold ${color.time}`}>{section.suggested_minutes} min</span>
                  <div className={`${flex.row} gap-0.5`}>
                    <button
                      type="button"
                      onClick={() => startEdit(i)}
                      title="Edit section"
                      className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-black/5 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSection(i)}
                      title="Remove section"
                      className="p-1 rounded-lg text-neutral-400 hover:text-coral-500 hover:bg-coral-50 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add section */}
          {addingNew ? (
            <div className={`${flex.col} gap-2 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 p-3`}>
              <input
                className={fieldClass}
                value={newDraft.name}
                onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Section name"
                autoFocus
              />
              <textarea
                className={`${fieldClass} resize-none`}
                rows={3}
                value={newDraft.description}
                onChange={(e) => setNewDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Description"
              />
              <div className={`${flex.row} items-center gap-1`}>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="w-14 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
                  value={newDraft.suggested_minutes}
                  onChange={(e) => setNewDraft((d) => ({ ...d, suggested_minutes: e.target.value }))}
                />
                <span className="text-xs text-neutral-400">min</span>
              </div>
              <div className={`${flex.row} gap-2 mt-1`}>
                <button type="button" onClick={cancelAdd} className="flex-1 rounded-lg border border-neutral-200 bg-white py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-50">
                  Cancel
                </button>
                <button type="button" onClick={commitAdd} disabled={!newDraft.name.trim()} className="flex-1 rounded-lg bg-primary-500 py-1 text-xs font-semibold text-white hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed">
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startAdd}
              className={`${flex.col} items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-4 text-neutral-400 hover:border-primary-300 hover:text-primary-400 transition-colors min-h-[120px]`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span className="text-xs font-semibold">Add section</span>
            </button>
          )}
        </div>
      )}
    </section>
  )
}

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

        <p className={`mt-1 text-4xl font-extrabold leading-none ${hasScore ? 'text-primary-500' : 'text-neutral-500'}`}>
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
  const startLabel = status === 'IN PROGRESS' ? 'Resume Interview' : 'Start Interview'

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
              {startLabel}
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
            const resolvedInterviewerUserId = Array.isArray(interviewUsers)
              ? interviewUsers[0]?.user_id
              : null

            if (resolvedInterviewerUserId) {
              setInterviewerUserId(resolvedInterviewerUserId)
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

        <InterviewPlanCard jobId={jobId} candId={candId} jobCand={jobCand} />

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