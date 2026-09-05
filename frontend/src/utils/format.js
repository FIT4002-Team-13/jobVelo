export function formatScore(value) {
  if (value == null) return '--'
  return Number(value).toFixed(1)
}

export function formatDate(iso) {
  if (!iso || typeof iso !== 'string' || !iso.includes('-')) return '--'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return isToday ? `Today, ${time}` : `${formatDate(iso.slice(0, 10))} ${time}`
}

export function formatShortDate(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}
