import { createContext, useCallback, useContext, useRef, useState } from 'react'

// App-wide toast notifications. Replaces window.alert() (which blocks the
// thread and looks like a browser error) with small self-dismissing cards
// in the bottom-right corner, matching the app's card/pill styling.
//
// Usage:
//   const toast = useToast()
//   toast.success('Candidate removed.')
//   toast.error('Failed to start interview.')
//   toast.info('Report is generating…')
//
// Each call returns the toast id; pass {duration} to override the 4s
// auto-dismiss (0 = sticky until clicked).

const ToastContext = createContext(null)

// Each tone carries a tinted border + ring and a soft coloured drop-shadow
// (the "glow") so a toast reads instantly against any page and its severity
// is legible at a glance.
const TONES = {
  success: {
    bar: 'bg-mint-500',
    border: 'border-mint-200',
    ring: 'ring-mint-100',
    glow: 'shadow-[0_12px_30px_-8px_rgba(63,212,147,0.5)]',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint-500">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  error: {
    bar: 'bg-coral-500',
    border: 'border-coral-200',
    ring: 'ring-coral-100',
    glow: 'shadow-[0_12px_30px_-8px_rgba(255,115,118,0.5)]',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-coral-500">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    ),
  },
  info: {
    bar: 'bg-primary-500',
    border: 'border-primary-200',
    ring: 'ring-primary-100',
    glow: 'shadow-[0_12px_30px_-8px_rgba(93,137,233,0.5)]',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (tone, message, { duration = 4000 } = {}) => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, tone, message }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  const value = {
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    dismiss,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Viewport - fixed bottom-right, newest at the bottom, above modals. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.info
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-neutral-0 py-3 pl-0 pr-4 text-left ring-2 transition-opacity hover:opacity-90 ${tone.border} ${tone.ring} ${tone.glow}`}
            >
              <span className={`h-full w-1 self-stretch ${tone.bar}`} aria-hidden />
              {tone.icon}
              <span className="flex-1 text-sm leading-snug text-neutral-700">
                {t.message}
              </span>
            </button>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Provider missing (e.g. a page rendered outside <App/> in a test) -
    // fall back to console so callers never crash on toast.error(...).
    return {
      success: (m) => console.log('[toast]', m),
      error: (m) => console.error('[toast]', m),
      info: (m) => console.log('[toast]', m),
      dismiss: () => {},
    }
  }
  return ctx
}
