import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, Copy, Minus, Plus } from 'lucide-react'
import { api } from '../../lib/api.js'
import { button, modal } from '../../styles/layout'
import { ROLE_OPTIONS } from '../../utils/constants.js'

const MAX_CODES = 10

// Two-step flow for creating invitation codes: pick the role and how many
// (nothing is preselected, so a code can't go out for the wrong role by
// default), then a "done" view with the new codes ready to copy.
export default function GenerateCodesModal({ onClose, onCreated }) {
  const [role, setRole] = useState('')
  const [count, setCount] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null) // null while configuring
  const [failed, setFailed] = useState(0)
  const [copied, setCopied] = useState(null) // a code, or 'all'
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape' && !creating) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [creating, onClose])

  const roleLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label
  const plural = (n) => (n === 1 ? 'code' : 'codes')

  async function generate() {
    setCreating(true)
    setError('')
    // One request per code: the API issues a single code at a time.
    const results = await Promise.allSettled(Array.from({ length: count }, () => api.createInvitation(role)))
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    setCreating(false)
    if (ok.length === 0) {
      setError(results[0]?.reason?.message || 'Could not generate codes. Try again.')
      return
    }
    onCreated(ok)
    setFailed(count - ok.length)
    setCreated(ok)
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500)
    } catch {
      /* clipboard blocked - the code is still visible to copy by hand */
    }
  }

  return (
    <div className={modal.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !creating) onClose() }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-codes-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-neutral-0 p-6 shadow-xl outline-none"
      >
        {created ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint-100 text-mint-700">
                <CheckCircle2 size={22} aria-hidden="true" />
              </div>
              <div>
                <h2 id="gen-codes-title" className="text-base font-bold text-neutral-800">
                  {created.length} {roleLabel} {plural(created.length)} created
                </h2>
                <p className="text-xs text-neutral-400">Each code works once. Send one to each teammate.</p>
              </div>
            </div>

            {failed > 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {failed} of {created.length + failed} {plural(created.length + failed)} could not be created. Generate again to make up the difference.
              </p>
            )}

            <ul className="mb-5 flex max-h-64 flex-col gap-2 overflow-y-auto">
              {created.map((inv) => (
                <li key={inv.inv_id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5">
                  <span className="font-mono text-sm text-neutral-800">{inv.code}</span>
                  <button
                    type="button"
                    onClick={() => copy(inv.code, inv.code)}
                    aria-label={`Copy ${inv.code}`}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary-600"
                  >
                    {copied === inv.code ? <><Check size={14} aria-hidden="true" />Copied</> : <><Copy size={14} aria-hidden="true" />Copy</>}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex gap-3">
              {created.length > 1 && (
                <button
                  type="button"
                  onClick={() => copy(created.map((c) => c.code).join('\n'), 'all')}
                  className={`flex-1 py-2 ${button.cancel}`}
                >
                  {copied === 'all' ? 'Copied all' : 'Copy all'}
                </button>
              )}
              <button type="button" onClick={onClose} className={`flex-1 ${button.primary}`}>Done</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="gen-codes-title" className="mb-1 text-base font-bold text-neutral-800">Generate invitation codes</h2>
            <p className="mb-5 text-xs text-neutral-400">
              The role is fixed when the code is created. Teammates cannot change it when they sign up.
            </p>

            <p id="gen-role-label" className="mb-2 text-sm font-semibold text-neutral-700">Role</p>
            <div role="radiogroup" aria-labelledby="gen-role-label" className="mb-5 flex flex-col gap-2">
              {ROLE_OPTIONS.map((o) => {
                const selected = role === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={creating}
                    onClick={() => setRole(o.value)}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                      selected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-neutral-200 hover:border-primary-200 hover:bg-neutral-50'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-primary-500' : 'border-neutral-300'}`}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-primary-500" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-neutral-800">{o.label}</span>
                      <span className="block text-xs text-neutral-500">{o.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mb-5 flex items-center justify-between gap-4">
              <label id="gen-count-label" className="text-sm font-semibold text-neutral-700">Number of codes</label>
              <div role="group" aria-labelledby="gen-count-label" className="flex items-center overflow-hidden rounded-xl border border-neutral-200">
                <button
                  type="button"
                  aria-label="Fewer codes"
                  disabled={creating || count <= 1}
                  onClick={() => setCount((c) => c - 1)}
                  className="flex h-9 w-9 items-center justify-center text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <output aria-live="polite" className="w-10 text-center text-sm font-bold tabular-nums text-neutral-800">{count}</output>
                <button
                  type="button"
                  aria-label="More codes"
                  disabled={creating || count >= MAX_CODES}
                  onClick={() => setCount((c) => c + 1)}
                  className="flex h-9 w-9 items-center justify-center text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-lg border border-coral-200 bg-coral-50 px-3 py-2 text-sm text-coral-700">{error}</p>
            )}

            <p className="mb-4 min-h-[1.25rem] text-sm text-neutral-500">
              {role
                ? <>Creates {count} single-use {plural(count)} for <span className="font-semibold text-neutral-700">{roleLabel}</span>.</>
                : 'Choose a role to continue.'}
            </p>

            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={creating} className={`flex-1 py-2 ${button.cancel} disabled:opacity-60`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={!role || creating}
                className={`flex-1 ${button.primary} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {creating ? 'Generating…' : `Generate ${count} ${plural(count)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
