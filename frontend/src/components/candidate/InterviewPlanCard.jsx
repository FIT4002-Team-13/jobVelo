import { useState, useRef, useEffect } from 'react'
import { authedFetch } from '../../lib/api.js'
import { card, flex } from '../../styles/layout'

const SECTION_COLORS = [
  { bg: 'bg-primary-50',  border: 'border-primary-200',  dot: 'bg-primary-400',  time: 'text-primary-500' },
  { bg: 'bg-sky-50',      border: 'border-sky-200',      dot: 'bg-sky-400',      time: 'text-sky-500'     },
  { bg: 'bg-mint-50',     border: 'border-mint-200',     dot: 'bg-mint-400',     time: 'text-mint-600'    },
  { bg: 'bg-coral-50',    border: 'border-coral-200',    dot: 'bg-coral-400',    time: 'text-coral-500'   },
]

export default function InterviewPlanCard({ jobId, candId, jobCand }) {
  const [state, setState] = useState('idle')
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
      if (plan.length === 0) throw new Error('No sections were returned. Please try again.')
      setSections(plan)
      setState('done')
      persist(plan)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.')
      setState('error')
    }
  }

  function startEdit(i) { setEditingIndex(i); setEditDraft({ ...sections[i] }); setAddingNew(false) }
  function cancelEdit() { setEditingIndex(null); setEditDraft(null) }

  function commitEdit() {
    if (!editDraft?.name?.trim()) return
    const updated = sections.map((s, i) =>
      i === editingIndex ? { ...editDraft, suggested_minutes: Number(editDraft.suggested_minutes) || 5 } : s
    )
    setSections(updated); setEditingIndex(null); setEditDraft(null); persist(updated)
  }

  function deleteSection(i) {
    const updated = sections.filter((_, idx) => idx !== i)
    setSections(updated)
    if (editingIndex === i) { setEditingIndex(null); setEditDraft(null) }
    persist(updated)
    if (updated.length === 0) setState('idle')
  }

  function startAdd() { setAddingNew(true); setNewDraft({ name: '', description: '', suggested_minutes: 10 }); setEditingIndex(null); setEditDraft(null) }
  function cancelAdd() { setAddingNew(false) }

  function reorderSection(from, to) {
    const updated = [...sections]; const [moved] = updated.splice(from, 1); updated.splice(to, 0, moved)
    setSections(updated); persist(updated)
  }

  function commitAdd() {
    if (!newDraft.name.trim()) return
    const updated = [...sections, { name: newDraft.name.trim(), description: newDraft.description.trim(), suggested_minutes: Number(newDraft.suggested_minutes) || 10 }]
    setSections(updated); setAddingNew(false); setState('done'); persist(updated)
  }

  const plannedMinutes = sections.reduce((s, x) => s + (x.suggested_minutes || 0), 0)
  const fieldClass = 'w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-primary-400'

  return (
    <section className={`${card.base} ${flex.col} gap-4 mb-6`}>
      <div className={flex.rowBetween}>
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Interview Plan</h2>
          <p className="text-xs text-neutral-400 mt-0.5">AI-suggested sections based on this role and candidate</p>
        </div>
        <div className={`${flex.row} items-center gap-3`}>
          <label className={`${flex.row} items-center gap-1.5`}>
            <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap">Total duration</span>
            <input type="number" min={10} max={240} value={totalMinutes} onChange={(e) => setTotalMinutes(Number(e.target.value) || 60)}
              className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400" />
            <span className="text-xs text-neutral-400">min</span>
          </label>
          {state === 'done' ? (
            <>
              <span className="text-xs text-neutral-400">{plannedMinutes} min planned</span>
              <button type="button" onClick={generate} className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-50">Regenerate</button>
            </>
          ) : state !== 'loading' ? (
            <button type="button" onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Generate Plan
            </button>
          ) : null}
        </div>
      </div>

      {state === 'idle' && (
        <div className="flex items-center justify-center rounded-2xl bg-neutral-50 px-6 py-10">
          <div className={`${flex.col} items-center gap-2 text-center`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300">
              <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>
            </svg>
            <p className="text-sm font-semibold text-neutral-400">No plan generated yet</p>
            <p className="text-xs text-neutral-400 max-w-xs">Set a total duration above and click &ldquo;Generate Plan&rdquo; to get AI-suggested sections.</p>
          </div>
        </div>
      )}

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

      {state === 'error' && (
        <div className="flex items-center justify-center rounded-2xl bg-coral-50 px-6 py-6">
          <p className="text-sm text-coral-600">{errorMsg}</p>
        </div>
      )}

      {state === 'done' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sections.map((section, i) => {
            const color = SECTION_COLORS[i % SECTION_COLORS.length]
            if (editingIndex === i) {
              return (
                <div key={i} className={`${flex.col} gap-2 rounded-2xl border-2 border-primary-300 bg-primary-50 p-3`}>
                  <input className={fieldClass} value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Section name" autoFocus />
                  <textarea className={`${fieldClass} resize-none`} rows={3} value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" />
                  <div className={`${flex.row} items-center gap-1`}>
                    <input type="number" min={1} max={120} className="w-14 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
                      value={editDraft.suggested_minutes} onChange={(e) => setEditDraft((d) => ({ ...d, suggested_minutes: e.target.value }))} />
                    <span className="text-xs text-neutral-400">min</span>
                  </div>
                  <div className={`${flex.row} gap-2 mt-1`}>
                    <button type="button" onClick={cancelEdit} className="flex-1 rounded-lg border border-neutral-200 bg-white py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-50">Cancel</button>
                    <button type="button" onClick={commitEdit} disabled={!editDraft?.name?.trim()} className="flex-1 rounded-lg bg-primary-500 py-1 text-xs font-semibold text-white hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed">Save</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={i} draggable
                onDragStart={() => { dragSrcIndex.current = i }}
                onDragOver={(e) => { e.preventDefault(); if (dragSrcIndex.current !== i) setDragOverIndex(i) }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => { e.preventDefault(); if (dragSrcIndex.current !== null && dragSrcIndex.current !== i) reorderSection(dragSrcIndex.current, i); setDragOverIndex(null) }}
                onDragEnd={() => { dragSrcIndex.current = null; setDragOverIndex(null) }}
                className={`${flex.col} gap-2 rounded-2xl border p-4 ${color.bg} ${color.border} cursor-grab active:cursor-grabbing active:opacity-50 transition-opacity ${dragOverIndex === i ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}
              >
                <div className={`${flex.row} items-center gap-2`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-neutral-300 shrink-0">
                    <circle cx="2" cy="2" r="1"/><circle cx="8" cy="2" r="1"/><circle cx="2" cy="5" r="1"/><circle cx="8" cy="5" r="1"/><circle cx="2" cy="8" r="1"/><circle cx="8" cy="8" r="1"/>
                  </svg>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                  <span className="text-sm font-bold text-neutral-800 leading-tight flex-1">{section.name}</span>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed flex-1">{section.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs font-semibold ${color.time}`}>{section.suggested_minutes} min</span>
                  <div className={`${flex.row} gap-0.5`}>
                    <button type="button" onClick={() => startEdit(i)} title="Edit section" className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-black/5 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button type="button" onClick={() => deleteSection(i)} title="Remove section" className="p-1 rounded-lg text-neutral-400 hover:text-coral-500 hover:bg-coral-50 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {addingNew ? (
            <div className={`${flex.col} gap-2 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 p-3`}>
              <input className={fieldClass} value={newDraft.name} onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Section name" autoFocus />
              <textarea className={`${fieldClass} resize-none`} rows={3} value={newDraft.description} onChange={(e) => setNewDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" />
              <div className={`${flex.row} items-center gap-1`}>
                <input type="number" min={1} max={120} className="w-14 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
                  value={newDraft.suggested_minutes} onChange={(e) => setNewDraft((d) => ({ ...d, suggested_minutes: e.target.value }))} />
                <span className="text-xs text-neutral-400">min</span>
              </div>
              <div className={`${flex.row} gap-2 mt-1`}>
                <button type="button" onClick={cancelAdd} className="flex-1 rounded-lg border border-neutral-200 bg-white py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-50">Cancel</button>
                <button type="button" onClick={commitAdd} disabled={!newDraft.name.trim()} className="flex-1 rounded-lg bg-primary-500 py-1 text-xs font-semibold text-white hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed">Add</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={startAdd}
              className={`${flex.col} items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-4 text-neutral-400 hover:border-primary-300 hover:text-primary-400 transition-colors min-h-[120px]`}>
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
