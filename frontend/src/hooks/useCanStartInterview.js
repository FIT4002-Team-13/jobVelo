import { useEffect, useState } from 'react'
import { canStartInterview, startOpensAt } from '../lib/interviewWindow'

// Live version of canStartInterview: flips to true on its own once the start
// window opens, so a page left open before the interview unlocks without a
// refresh. Schedules a single timer for the opening moment rather than polling.
export function useCanStartInterview(scheduledAt) {
  const [, setTick] = useState(0)
  const canStart = canStartInterview(scheduledAt)

  useEffect(() => {
    if (canStart) return undefined
    // setTimeout caps at ~24.8 days; beyond that the tick just re-arms it.
    const delay = Math.min(startOpensAt(scheduledAt) - Date.now(), 2 ** 31 - 1)
    const id = setTimeout(() => setTick((t) => t + 1), delay)
    return () => clearTimeout(id)
  })

  return canStart
}
