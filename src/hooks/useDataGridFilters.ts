import { useState, useCallback, useMemo } from 'react'

export interface FilterConfig {
  /** Enable text search. Default: true */
  search?: boolean
  /** Allowed status values for multi-select filter */
  status?: string[]
  /** Parent relationship filters (e.g., filter by client, project) */
  parentFilters?: {
    /** Field name on the row object, e.g. 'project_id' */
    key: string
    /** Display label, e.g. 'Project' */
    label: string
    /** Dropdown options */
    options: { value: string; label: string }[]
  }[]
  /** Field to use for date range filtering, e.g. 'expected_end_date' */
  dateRangeField?: string
}

export interface ActiveFilters {
  /** Text search query */
  search: string
  /** Selected status values */
  statuses: string[]
  /** Parent filter selections - key -> selected values array */
  parents: Record<string, string[]>
  /** Date range start */
  dateFrom: string
  /** Date range end */
  dateTo: string
}

const INITIAL_FILTERS: ActiveFilters = {
  search: '',
  statuses: [],
  parents: {},
  dateFrom: '',
  dateTo: '',
}

export function useDataGridFilters(config: FilterConfig) {
  const [filters, setFilters] = useState<ActiveFilters>(INITIAL_FILTERS)

  const setSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }))
  }, [])

  const setStatuses = useCallback((values: string[]) => {
    setFilters((prev) => ({ ...prev, statuses: values }))
  }, [])

  const setParent = useCallback((key: string, values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      parents: { ...prev.parents, [key]: values },
    }))
  }, [])

  const setDateFrom = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, dateFrom: value }))
  }, [])

  const setDateTo = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, dateTo: value }))
  }, [])

  const clearAll = useCallback(() => {
    setFilters(INITIAL_FILTERS)
  }, [])

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.statuses.length > 0 ||
      Object.values(filters.parents).some((values) => values.length > 0) ||
      filters.dateFrom !== '' ||
      filters.dateTo !== ''
    )
  }, [filters])

  /** Count of individual active filter selections (for badge display) */
  const activeFilterCount = useMemo(() => {
    return (
      (filters.search ? 1 : 0) +
      filters.statuses.length +
      Object.values(filters.parents).reduce((sum, arr) => sum + arr.length, 0) +
      (filters.dateFrom ? 1 : 0) +
      (filters.dateTo ? 1 : 0)
    )
  }, [filters])

  /**
   * Apply all active filters to data array
   * @param data - Array of records to filter
   * @param searchFields - Which fields to search text against
   * @param getComputedStatus - Optional function to compute status for a row (for derived status fields)
   */
  function applyFilters<T extends { id: string }>(
    data: T[],
    searchFields: (keyof T)[],
    getComputedStatus?: (row: T) => string
  ): T[] {
    return data.filter((row) => {
      // Text search filter
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matches = searchFields.some((field) => {
          const value = row[field]
          if (value == null) return false
          return String(value).toLowerCase().includes(query)
        })
        if (!matches) return false
      }

      // Status multi-select filter
      if (filters.statuses.length > 0) {
        const rowStatus = getComputedStatus
          ? getComputedStatus(row)
          : ((row as Record<string, unknown>).status as string)
        if (!rowStatus || !filters.statuses.includes(rowStatus)) {
          return false
        }
      }

      // Parent relationship filters
      for (const [key, values] of Object.entries(filters.parents)) {
        if (values.length > 0) {
          const rowValue = (row as Record<string, unknown>)[key]
          if (!rowValue || !values.includes(String(rowValue))) {
            return false
          }
        }
      }

      // Date range filter
      if (config.dateRangeField) {
        const rowDate = (row as Record<string, unknown>)[config.dateRangeField] as string | undefined
        if (rowDate) {
          if (filters.dateFrom && rowDate < filters.dateFrom) {
            return false
          }
          if (filters.dateTo && rowDate > filters.dateTo + 'T23:59:59') {
            return false
          }
        }
      }

      return true
    })
  }

  return {
    filters,
    setSearch,
    setStatuses,
    setParent,
    setDateFrom,
    setDateTo,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
    applyFilters,
  }
}

export type UseDataGridFiltersReturn = ReturnType<typeof useDataGridFilters>
