import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, X, ChevronDown } from 'lucide-react'
import type { FilterConfig, ActiveFilters } from '@/hooks/useDataGridFilters'

interface MultiSelectFilterProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps) {
  const [search, setSearch] = useState('')
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-xs">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {/* Search input */}
        <div className="px-2 py-1.5">
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenuSeparator />

        {/* Select all / Clear all */}
        <div className="flex items-center justify-between px-2 py-1">
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => onChange(options.map((o) => o.value))}
          >
            Select all
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          )}
        </div>
        <DropdownMenuSeparator />

        {/* Options */}
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No options found
            </div>
          ) : (
            filtered.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked
                      ? [...selected, option.value]
                      : selected.filter((v) => v !== option.value)
                  )
                }}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface FilterBarProps {
  config: FilterConfig
  filters: ActiveFilters
  onSearch: (value: string) => void
  onStatuses: (values: string[]) => void
  onParent: (key: string, values: string[]) => void
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  onClearAll: () => void
  hasActiveFilters: boolean
  resultCount?: number
  totalCount?: number
  /** When true, the filter controls are hidden (only the container renders) */
  collapsed?: boolean
  /** Additional elements to render in the filter bar (e.g., view toggle buttons) */
  children?: React.ReactNode
}

/**
 * FilterBar component that renders filter controls.
 *
 * When `collapsed` is true, the filter controls are hidden.
 * The parent component is responsible for managing the collapsed state and
 * rendering the Filter toggle button in the toolbar.
 */
export function FilterBar({
  config,
  filters,
  onSearch,
  onStatuses,
  onParent,
  onDateFrom,
  onDateTo,
  onClearAll,
  hasActiveFilters,
  resultCount,
  totalCount,
  collapsed = false,
  children,
}: FilterBarProps) {
  // When collapsed, render nothing (parent toolbar handles the toggle button)
  if (collapsed) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border rounded-md bg-muted/30 mb-3">
      {/* Search input */}
      {config.search !== false && (
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {filters.search && (
            <button
              type="button"
              className="absolute right-2.5 top-2.5"
              onClick={() => onSearch('')}
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Parent relationship multi-select dropdowns */}
      {config.parentFilters?.map((pf) => (
        <MultiSelectFilter
          key={pf.key}
          label={pf.label}
          options={pf.options}
          selected={filters.parents[pf.key] ?? []}
          onChange={(values) => onParent(pf.key, values)}
        />
      ))}

      {/* Status multi-select */}
      {config.status && config.status.length > 0 && (
        <MultiSelectFilter
          label="Status"
          options={config.status.map((s) => ({
            value: s,
            label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          }))}
          selected={filters.statuses}
          onChange={onStatuses}
        />
      )}

      {/* Date range */}
      {config.dateRangeField && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Due:</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onDateFrom(e.target.value)}
            className="h-9 px-2 text-sm border rounded-md bg-background"
          />
          <span className="text-xs text-muted-foreground">-</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onDateTo(e.target.value)}
            className="h-9 px-2 text-sm border rounded-md bg-background"
          />
        </div>
      )}

      {/* Clear all button - pushed to right when filters active */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-muted-foreground h-9 ml-auto"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear all
        </Button>
      )}

      {/* Result count - show when filtered */}
      {resultCount !== undefined &&
        totalCount !== undefined &&
        resultCount !== totalCount &&
        !hasActiveFilters && (
          <span className="text-xs text-muted-foreground ml-auto">
            {resultCount} of {totalCount} records
          </span>
        )}

      {/* Additional children (e.g., view toggle) */}
      {children}
    </div>
  )
}
