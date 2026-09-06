import { useMemo, useState } from 'react'
import { makeSorter } from '../components/job-candidate/TableControls'

// Shared search -> filter -> sort -> (optional) paginate pipeline behind the
// Jobs/Applications/Dashboard/CandidatesTable list panels, which used to
// each hand-roll their own copy of this derivation. Filtering and sorting
// stay caller-specific via predicates; the hook only owns the state +
// plumbing. Filter state is always an array (matching FilterMenu's shape,
// including single-select mode which just wraps/unwraps a 1-item array).
export function useTableControls(items, {
  matchesSearch = () => true,   // (item, needle) => bool
  matchesFilter = () => true,   // (item, filters) => bool
  compare,                      // optional (a, b, sortKey, needle) => number, overrides sortFields/makeSorter
  sortFields,                   // { nameField, dateField } passed to makeSorter when `compare` isn't given
  defaultSortKey = 'latest',
  pageSize,                     // omit for no pagination - `paged` then equals `sorted`
} = {}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState(defaultSortKey)
  const [filters, setFilters] = useState([])
  const [page, setPage] = useState(0)

  const needle = search.trim().toLowerCase()

  const filtered = useMemo(
    () => items
      .filter((item) => !needle || matchesSearch(item, needle))
      .filter((item) => matchesFilter(item, filters)),
    [items, needle, filters, matchesSearch, matchesFilter]
  )

  const sorted = useMemo(() => {
    const sorter = compare ? (a, b) => compare(a, b, sortKey, needle) : makeSorter(sortKey, sortFields)
    return sorter ? [...filtered].sort(sorter) : filtered
  }, [filtered, compare, sortFields, sortKey, needle])

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const safePage = Math.min(page, totalPages - 1)
  const paged = pageSize ? sorted.slice(safePage * pageSize, (safePage + 1) * pageSize) : sorted

  return {
    search, setSearch, needle,
    sortKey, setSortKey,
    filters, setFilters,
    page, setPage,
    filtered, sorted, totalPages, safePage, paged,
  }
}
