import { useCallback, useEffect, useRef, useState } from 'react'

// Runs an async loader on mount (and whenever `deps` changes), tracking the
// load/error/loading boilerplate that used to be hand-rolled per page.
// `fn` should resolve to whatever shape the page needs (a single value or a
// composite object) - the hook doesn't care, it just stores what comes back.
// `setData` is exposed too, for the common case of an optimistic update
// after a create/edit/delete that shouldn't wait on a full reload.
//
// Pass `null` for `fn` when a precondition isn't ready yet (e.g. waiting on
// `user?.userid` from an auth context) - the hook skips running and leaves
// `loading` as-is, so the page keeps showing its loading state rather than
// flashing an empty result. Once `fn` becomes non-null (deps changed), it
// runs normally.
export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const aliveRef = useRef(true)

  const reload = useCallback(() => {
    if (!fnRef.current) return Promise.resolve()
    setLoading(true)
    setError(null)
    return fnRef.current()
      .then((result) => { if (aliveRef.current) setData(result) })
      .catch((err) => { if (aliveRef.current) setError(err?.message || 'Something went wrong.') })
      .finally(() => { if (aliveRef.current) setLoading(false) })
  }, [])

  useEffect(() => {
    aliveRef.current = true
    reload()
    return () => { aliveRef.current = false }
    // `deps` is caller-provided and intentionally drives when this re-runs,
    // same contract as a manual useEffect(fn, deps) - not `reload` itself.
  }, deps)

  return { data, setData, loading, error, setError, reload }
}
