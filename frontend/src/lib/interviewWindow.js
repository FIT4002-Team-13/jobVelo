// An interview can be started from EARLY_START_MINUTES before its scheduled
// time onwards - no upper bound, so a late-running session is never locked out.
export const EARLY_START_MINUTES = 10

const EARLY_START_MS = EARLY_START_MINUTES * 60 * 1000

// Epoch ms when starting opens, or null when there's no usable schedule.
export function startOpensAt(scheduledAt) {
  if (!scheduledAt) return null
  const t = new Date(scheduledAt).getTime()
  return Number.isNaN(t) ? null : t - EARLY_START_MS
}

// Unscheduled interviews aren't gated - there's no time to gate against.
export function canStartInterview(scheduledAt, now = Date.now()) {
  const opensAt = startOpensAt(scheduledAt)
  return opensAt === null || now >= opensAt
}

// "Available from Tue 21 Oct, 1:50 pm" - shown while the button is locked.
export function startAvailableLabel(scheduledAt) {
  const opensAt = startOpensAt(scheduledAt)
  if (opensAt === null) return null
  const label = new Date(opensAt).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `Available from ${label}`
}
