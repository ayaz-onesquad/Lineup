import { useState, useMemo } from 'react'

export type StatusFilterValue = 'active' | 'closed' | 'all'

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'closed'])

/**
 * Client-side status filter hook for child entity grids.
 * Filters records based on their status field.
 *
 * Active = status NOT IN ('completed', 'cancelled', 'closed')
 * Closed = status IN ('completed', 'cancelled', 'closed')
 *
 * @param data - Array of records with optional status field
 * @returns filter state, setter, filtered data, and counts
 */
export function useStatusFilter<T extends { status?: string | null }>(
  data: T[] | undefined
) {
  const [filter, setFilter] = useState<StatusFilterValue>('active')

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data
    if (filter === 'active') {
      return data.filter((r) => !CLOSED_STATUSES.has(r.status ?? ''))
    }
    return data.filter((r) => CLOSED_STATUSES.has(r.status ?? ''))
  }, [data, filter])

  const counts = useMemo(() => {
    const items = data ?? []
    return {
      active: items.filter((r) => !CLOSED_STATUSES.has(r.status ?? '')).length,
      closed: items.filter((r) => CLOSED_STATUSES.has(r.status ?? '')).length,
    }
  }, [data])

  return { filter, setFilter, filtered, counts }
}
