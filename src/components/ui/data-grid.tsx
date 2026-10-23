import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronsUpDown,
  Columns3,
  RotateCcw,
  SlidersHorizontal,
  AlertTriangle,
  Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'

// ---------------------------------------------------------------------------
// Column model
//
// See docs/DESIGN-SYSTEM.md section 4.1. Priority drives both what survives on
// mobile and the order fields appear in a card, so it is the one field you
// must think about when defining a column.
// ---------------------------------------------------------------------------

export type ColumnPriority = 'primary' | 'secondary' | 'tertiary'
export type ColumnAlign = 'left' | 'right' | 'center'
export type GridDensity = 'compact' | 'comfortable' | 'spacious'
export type SortDirection = 'asc' | 'desc'

/** Values a column can sort by. */
export type SortableValue = string | number | boolean | Date | null | undefined

export interface DataGridColumn<T> {
  /** Stable id. Used for sort state and visibility persistence. */
  id: string
  /** Header text. Also the label used in the mobile card unless overridden. */
  header: string

  /**
   * The sortable, comparable value for this cell. Supply this for any column
   * showing a scalar: it is what makes the column sortable, and sorting is
   * mandatory (section 4.2).
   */
  accessor?: (row: T) => SortableValue

  /** Custom cell renderer. Falls back to the accessor value as text. */
  cell?: (row: T) => ReactNode

  /**
   * `primary` is the card title on mobile — exactly one per grid.
   * `secondary` is always shown on a card, at most four.
   * `tertiary` (the default) hides behind "More details" on mobile.
   */
  priority?: ColumnPriority

  /** Desktop-only noise: internal ids, audit timestamps. Never on a card. */
  hideOnMobile?: boolean

  /** Shorter label for the mobile card, where width is tight. */
  mobileLabel?: string

  align?: ColumnAlign

  /** Right-aligns and applies tabular figures, so digits line up (section 4.3). */
  numeric?: boolean

  /** Defaults to true when an accessor is present. Set false for avatars, checkboxes, actions. */
  sortable?: boolean

  /** Explicit width. Columns without one collapse below legibility (section 4.4). */
  width?: string
  minWidth?: string

  /** Allow the column manager to hide it. The primary column is always false. */
  hideable?: boolean

  /** Exclude from the mobile card entirely. Implied for action columns. */
  mobileHidden?: boolean

  /** Extra classes for the cell. */
  className?: string
}

export interface DataGridEmptyState {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[]
  data: T[] | undefined
  getRowId: (row: T) => string

  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void

  /** Single click on desktop: open the quick-view panel. */
  onRowClick?: (row: T) => void
  /** Double click, Enter, or a tap on mobile: navigate to the record. */
  onRowOpen?: (row: T) => void

  density?: GridDensity
  stickyFirstColumn?: boolean

  /**
   * Caps the grid's height and scrolls the body inside it, e.g. "60vh".
   *
   * This is also what makes the header stick. `position: sticky` resolves
   * against the nearest scrolling ancestor, so without a vertical scroll
   * container there is nothing for the header to stick to and it simply
   * scrolls away with the page. Omit this and the header is not sticky, which
   * is the right default for a short list.
   */
  maxBodyHeight?: string

  /** Enables persistence of sort and column visibility in localStorage. */
  storageKey?: string
  defaultSort?: { columnId: string; direction: SortDirection }

  /** Search and filter controls, rendered above the grid. */
  toolbar?: ReactNode

  emptyState: DataGridEmptyState
  /** Shown instead of `emptyState` when filters are active and matched nothing. */
  hasActiveFilters?: boolean
  onClearFilters?: () => void

  /** Row actions for the right edge of a desktop row. */
  rowActions?: (row: T) => ReactNode

  /**
   * One or two essential actions pinned to the bottom of a mobile card.
   *
   * Row actions normally move to the detail page on mobile (section 4.5),
   * because a cramped dropdown on a card is worse than a tap that opens the
   * record. The exception is an action that IS the point of the list — copying
   * a credential, for instance. Keep it to two controls; this is not a place
   * to reproduce the desktop action menu.
   */
  mobileCardActions?: (row: T) => ReactNode

  /**
   * Extra classes per row, for highlighting state the grid does not own
   * (the row currently open in the quick-view panel, a row with unsaved
   * edits, an overdue record).
   */
  rowClassName?: (row: T) => string | undefined

  /** Multi-select. When provided, a checkbox column is prepended. */
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void

  className?: string
  /** Caption for screen readers describing what the grid contains. */
  ariaLabel?: string
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

interface SortState {
  columnId: string
  direction: SortDirection
}

/**
 * Comparator used for every column.
 *
 * Nulls always sort last regardless of direction: a requirement with no due
 * date is not "the oldest", and burying blanks at one end makes a sorted column
 * misleading (section 4.2).
 */
function compareValues(a: SortableValue, b: SortableValue, direction: SortDirection): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  const factor = direction === 'asc' ? 1 : -1

  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(String(a)).getTime()
    const bt = b instanceof Date ? b.getTime() : new Date(String(b)).getTime()
    return (at - bt) * factor
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * factor
  }

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return (Number(a) - Number(b)) * factor
  }

  // localeCompare with numeric so "Phase 2" sorts before "Phase 10".
  return (
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) *
    factor
  )
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PersistedState {
  sort?: SortState | null
  hidden?: string[]
}

function readPersisted(key: string | undefined): PersistedState {
  if (!key) return {}
  try {
    const raw = window.localStorage.getItem(`lineup:grid:${key}`)
    return raw ? (JSON.parse(raw) as PersistedState) : {}
  } catch {
    return {}
  }
}

function writePersisted(key: string | undefined, state: PersistedState): void {
  if (!key) return
  try {
    window.localStorage.setItem(`lineup:grid:${key}`, JSON.stringify(state))
  } catch {
    /* storage unavailable; sorting still works for this session */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DENSITY_ROW_CLASS: Record<GridDensity, string> = {
  compact: 'h-row-compact',
  comfortable: 'h-row-comfortable',
  spacious: 'h-row-spacious',
}

const DENSITY_CELL_CLASS: Record<GridDensity, string> = {
  compact: 'px-3 py-1.5',
  comfortable: 'px-4 py-3',
  spacious: 'px-4 py-4',
}

function alignClass(column: DataGridColumn<unknown>): string {
  const align = column.align ?? (column.numeric ? 'right' : 'left')
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

function isSortable<T>(column: DataGridColumn<T>): boolean {
  return column.sortable ?? !!column.accessor
}

function renderCellContent<T>(column: DataGridColumn<T>, row: T): ReactNode {
  if (column.cell) return column.cell(row)
  const value = column.accessor?.(row)
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>
  }
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

function mobileLabelOf<T>(column: DataGridColumn<T>): string {
  return column.mobileLabel ?? column.header
}

// ---------------------------------------------------------------------------
// DataGrid
// ---------------------------------------------------------------------------

/**
 * The responsive data grid. Every read-only tabular view in the app uses this.
 *
 * Below `md` it renders a list of cards driven by column priority; at `md` and
 * above it renders a sortable table inside a scroll container with edge
 * shadows. Both views come from one column definition, so a page cannot ship a
 * working desktop table and a broken phone layout.
 *
 * See docs/DESIGN-SYSTEM.md sections 4 and 5.
 */
export function DataGrid<T>({
  columns,
  data,
  getRowId,
  isLoading = false,
  error = null,
  onRetry,
  onRowClick,
  onRowOpen,
  density = 'comfortable',
  stickyFirstColumn = false,
  maxBodyHeight,
  storageKey,
  defaultSort,
  toolbar,
  emptyState,
  hasActiveFilters = false,
  onClearFilters,
  rowActions,
  selectedIds,
  onSelectionChange,
  mobileCardActions,
  rowClassName,
  className,
  ariaLabel,
}: DataGridProps<T>) {
  const isMobile = useMediaQuery('(max-width: 767px)')

  const persisted = useMemo(() => readPersisted(storageKey), [storageKey])

  const [sort, setSort] = useState<SortState | null>(
    persisted.sort ?? (defaultSort ? { ...defaultSort } : null)
  )
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    new Set(persisted.hidden ?? [])
  )

  // Development guard: the priority model only works if exactly one column is
  // the row's identity.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const primaries = columns.filter(c => c.priority === 'primary')
    if (primaries.length !== 1) {
      console.warn(
        `[DataGrid] Expected exactly one column with priority "primary", found ${primaries.length}. ` +
          'The mobile card has no title without it. See docs/DESIGN-SYSTEM.md section 4.1.',
        columns.map(c => c.id)
      )
    }
    const secondaries = columns.filter(c => c.priority === 'secondary')
    if (secondaries.length > 4) {
      console.warn(
        `[DataGrid] ${secondaries.length} "secondary" columns; the limit is 4. ` +
          'Extra fields make the mobile card unreadable. Demote some to "tertiary".',
        secondaries.map(c => c.id)
      )
    }
  }, [columns])

  const persist = useCallback(
    (next: PersistedState) => {
      writePersisted(storageKey, {
        sort: next.sort !== undefined ? next.sort : sort,
        hidden: next.hidden !== undefined ? next.hidden : Array.from(hiddenIds),
      })
    },
    [storageKey, sort, hiddenIds]
  )

  /** Three-state cycle: ascending, descending, unsorted. */
  const toggleSort = useCallback(
    (columnId: string) => {
      setSort(current => {
        let next: SortState | null
        if (!current || current.columnId !== columnId) {
          next = { columnId, direction: 'asc' }
        } else if (current.direction === 'asc') {
          next = { columnId, direction: 'desc' }
        } else {
          next = null
        }
        persist({ sort: next })
        return next
      })
    },
    [persist]
  )

  const toggleColumn = useCallback(
    (columnId: string) => {
      setHiddenIds(current => {
        const next = new Set(current)
        if (next.has(columnId)) next.delete(columnId)
        else next.add(columnId)
        persist({ hidden: Array.from(next) })
        return next
      })
    },
    [persist]
  )

  // Selection column, prepended when selection is enabled. Its header carries
  // the select-all / clear-all control, with an indeterminate state when only
  // some rows are selected.
  const selectionColumn: DataGridColumn<T> | null = useMemo(() => {
    if (!selectedIds || !onSelectionChange) return null
    return {
      id: '__select',
      header: '',
      sortable: false,
      hideable: false,
      mobileHidden: true,
      width: '44px',
      align: 'center',
      cell: row => {
        const id = getRowId(row)
        return (
          <Checkbox
            checked={selectedIds.has(id)}
            aria-label="Select row"
            onClick={e => e.stopPropagation()}
            onCheckedChange={checked => {
              const next = new Set(selectedIds)
              if (checked) next.add(id)
              else next.delete(id)
              onSelectionChange(next)
            }}
          />
        )
      },
    }
  }, [selectedIds, onSelectionChange, getRowId])

  const allColumns = useMemo(
    () => (selectionColumn ? [selectionColumn, ...columns] : columns),
    [selectionColumn, columns]
  )

  const visibleColumns = useMemo(
    () => allColumns.filter(c => !hiddenIds.has(c.id)),
    [allColumns, hiddenIds]
  )

  const sortedData = useMemo(() => {
    const rows = data ?? []
    if (!sort) return rows
    const column = allColumns.find(c => c.id === sort.columnId)
    if (!column?.accessor) return rows
    const accessor = column.accessor
    // Copy before sorting: the array belongs to React Query's cache.
    return [...rows].sort((a, b) =>
      compareValues(accessor(a), accessor(b), sort.direction)
    )
  }, [data, sort, allColumns])

  // Select-all state. Derived from the rows currently visible after filtering,
  // so "select all" means what the user can see, not the whole unfiltered set.
  const allRowsSelected =
    !!selectedIds && sortedData.length > 0 && sortedData.every(row => selectedIds.has(getRowId(row)))
  const someRowsSelected =
    !!selectedIds && !allRowsSelected && sortedData.some(row => selectedIds.has(getRowId(row)))

  const sortableColumns = useMemo(
    () => allColumns.filter(c => isSortable(c) && c.id !== '__select'),
    [allColumns]
  )

  const hideableColumns = useMemo(
    () => allColumns.filter(c => (c.hideable ?? true) && c.priority !== 'primary' && c.id !== '__select'),
    [allColumns]
  )

  // -------------------------------------------------------------------------
  // Shared chrome: toolbar, sort sheet, column manager
  // -------------------------------------------------------------------------

  const chrome = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">{toolbar}</div>

      {/* Sorting has no header to click in card view, so it moves to a sheet. */}
      {isMobile && sortableColumns.length > 0 && (
        <SortSheet
          columns={sortableColumns}
          sort={sort}
          onToggle={toggleSort}
          onClear={() => {
            setSort(null)
            persist({ sort: null })
          }}
        />
      )}

      {/* Column manager is desktop-only: mobile already reduces to cards. */}
      {!isMobile && hideableColumns.length > 8 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-touch shrink-0">
              <Columns3 className="mr-2 h-4 w-4" />
              Columns
              {hiddenIds.size > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {hideableColumns.length - hiddenIds.size}/{hideableColumns.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hideableColumns.map(column => (
              <DropdownMenuItem
                key={column.id}
                onSelect={e => {
                  e.preventDefault()
                  toggleColumn(column.id)
                }}
                className="gap-2"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center',
                    hiddenIds.has(column.id) && 'opacity-0'
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{column.header}</span>
              </DropdownMenuItem>
            ))}
            {hiddenIds.size > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setHiddenIds(new Set())
                    persist({ hidden: [] })
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Show all
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  // -------------------------------------------------------------------------
  // States
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className={cn('space-y-3', className)}>
        {chrome}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-medium">Could not load this list</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="min-h-touch">
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)} aria-busy="true">
        {chrome}
        {isMobile ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="space-y-2 rounded-lg border bg-card p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <GridFrame maxBodyHeight={maxBodyHeight}>
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map(column => (
                    <TableHead
                      key={column.id}
                      style={{ width: column.width, minWidth: column.minWidth }}
                      className="h-11 text-xs font-medium uppercase tracking-wide"
                    >
                      {column.header}
                    </TableHead>
                  ))}
                  {/* Keep the skeleton's column count identical to the real
                      table's, so the layout does not jump when data arrives. */}
                  {rowActions && <TableHead className="w-[60px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[0, 1, 2, 3, 4].map(i => (
                  <TableRow key={i} className={DENSITY_ROW_CLASS[density]}>
                    {visibleColumns.map(column => (
                      <TableCell key={column.id} className={DENSITY_CELL_CLASS[density]}>
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className={DENSITY_CELL_CLASS[density]}>
                        <Skeleton className="ml-auto h-4 w-4" />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GridFrame>
        )}
      </div>
    )
  }

  if (sortedData.length === 0) {
    // Filtered-empty and truly-empty are different situations and get different
    // copy: offering "Create" when the records exist but are filtered out is
    // actively misleading (section 4.6).
    const EmptyIcon = emptyState.icon
    return (
      <div className={cn('space-y-3', className)}>
        {chrome}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center sm:p-12">
          {hasActiveFilters ? (
            <>
              <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No records match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust or clear the filters to see more.
                </p>
              </div>
              {onClearFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                  className="min-h-touch"
                >
                  Clear filters
                </Button>
              )}
            </>
          ) : (
            <>
              {EmptyIcon && <EmptyIcon className="h-8 w-8 text-muted-foreground" />}
              <div>
                <p className="font-medium">{emptyState.title}</p>
                {emptyState.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {emptyState.description}
                  </p>
                )}
              </div>
              {emptyState.action}
            </>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Mobile: cards
  // -------------------------------------------------------------------------

  if (isMobile) {
    return (
      <div className={cn('space-y-3', className)}>
        {chrome}
        <div className="space-y-3" role="list" aria-label={ariaLabel}>
          {sortedData.map(row => (
            <MobileCard
              key={getRowId(row)}
              row={row}
              columns={columns}
              onOpen={onRowOpen ?? onRowClick}
              isSelected={selectedIds?.has(getRowId(row)) ?? false}
              className={rowClassName?.(row)}
              actions={mobileCardActions?.(row)}
            />
          ))}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Desktop: table
  // -------------------------------------------------------------------------

  return (
    <div className={cn('space-y-3', className)}>
      {chrome}
      <GridFrame maxBodyHeight={maxBodyHeight}>
        <Table aria-label={ariaLabel}>
          <TableHeader
            className={cn(maxBodyHeight && 'sticky top-0 z-10 bg-card')}
          >
            <TableRow>
              {visibleColumns.map((column, index) => {
                const sortable = isSortable(column)
                const active = sort?.columnId === column.id
                return (
                  <TableHead
                    key={column.id}
                    style={{ width: column.width, minWidth: column.minWidth }}
                    aria-sort={
                      active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    className={cn(
                      'h-11 whitespace-nowrap px-4 text-xs font-medium uppercase tracking-wide',
                      alignClass(column as DataGridColumn<unknown>),
                      stickyFirstColumn &&
                        index === 0 &&
                        'sticky left-0 z-20 bg-card shadow-scroll-right'
                    )}
                  >
                    {column.id === '__select' && selectedIds && onSelectionChange ? (
                      <Checkbox
                        // Radix accepts 'indeterminate' and renders a dash,
                        // which is the correct affordance for a partial
                        // selection.
                        checked={
                          allRowsSelected
                            ? true
                            : someRowsSelected
                              ? 'indeterminate'
                              : false
                        }
                        aria-label={allRowsSelected ? 'Clear selection' : 'Select all rows'}
                        onCheckedChange={checked => {
                          onSelectionChange(
                            checked ? new Set(sortedData.map(getRowId)) : new Set()
                          )
                        }}
                      />
                    ) : sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          'group -mx-2 inline-flex min-h-touch items-center gap-1.5 rounded px-2',
                          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active && 'text-foreground'
                        )}
                      >
                        <span className="truncate">{column.header}</span>
                        {active ? (
                          sort!.direction === 'asc' ? (
                            <ArrowUpAZ className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowDownAZ className="h-3.5 w-3.5 shrink-0" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                        )}
                      </button>
                    ) : (
                      <span className="truncate">{column.header}</span>
                    )}
                  </TableHead>
                )
              })}
              {rowActions && (
                <TableHead className="w-[60px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedData.map(row => {
              const id = getRowId(row)
              const interactive = !!(onRowClick || onRowOpen)
              return (
                <TableRow
                  key={id}
                  tabIndex={interactive ? 0 : undefined}
                  data-state={selectedIds?.has(id) ? 'selected' : undefined}
                  className={cn(
                    DENSITY_ROW_CLASS[density],
                    interactive &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    rowClassName?.(row)
                  )}
                  onClick={() => onRowClick?.(row)}
                  onDoubleClick={() => onRowOpen?.(row)}
                  onKeyDown={event => {
                    // Keyboard equivalent of double-click, so navigation does
                    // not require a pointer.
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      ;(onRowOpen ?? onRowClick)?.(row)
                    }
                  }}
                >
                  {visibleColumns.map((column, index) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        DENSITY_CELL_CLASS[density],
                        alignClass(column as DataGridColumn<unknown>),
                        column.numeric && 'font-mono tabular-nums',
                        stickyFirstColumn &&
                          index === 0 &&
                          'sticky left-0 z-10 bg-card shadow-scroll-right',
                        column.className
                      )}
                      style={{ width: column.width, minWidth: column.minWidth }}
                    >
                      {renderCellContent(column, row)}
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell
                      className={cn(DENSITY_CELL_CLASS[density], 'text-right')}
                      onClick={e => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </GridFrame>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scroll frame
// ---------------------------------------------------------------------------

/**
 * Horizontal scroll container with edge shadows.
 *
 * Without the shadow, a wide table is silently clipped and the user has no cue
 * that more columns exist, which is the second half of the "columns override
 * each other" complaint (section 4.4).
 */
function GridFrame({
  children,
  maxBodyHeight,
}: {
  children: ReactNode
  maxBodyHeight?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setEdges({
      left: el.scrollLeft > 1,
      right: maxScroll > 1 && el.scrollLeft < maxScroll - 1,
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [update])

  return (
    <div className="relative rounded-lg border bg-card">
      <div
        ref={ref}
        className={cn('w-full overflow-x-auto', maxBodyHeight && 'overflow-y-auto')}
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
      >
        {children}
      </div>
      {edges.left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-3 rounded-l-lg shadow-scroll-left"
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-3 rounded-r-lg shadow-scroll-right"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobileCard<T>({
  row,
  columns,
  onOpen,
  isSelected,
  className,
  actions,
}: {
  row: T
  columns: DataGridColumn<T>[]
  onOpen?: (row: T) => void
  isSelected: boolean
  className?: string
  actions?: ReactNode
}) {
  const [showMore, setShowMore] = useState(false)

  const usable = columns.filter(c => !c.hideOnMobile && !c.mobileHidden)
  const primary = usable.find(c => c.priority === 'primary')
  const secondary = usable.filter(c => c.priority === 'secondary').slice(0, 4)
  const tertiary = usable.filter(
    c => c !== primary && !secondary.includes(c)
  )

  return (
    <article
      role="listitem"
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(row)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(row)
        }
      }}
      className={cn(
        'min-h-touch rounded-lg border bg-card p-4 shadow-sm',
        onOpen &&
          'cursor-pointer active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'ring-2 ring-primary',
        className
      )}
    >
      {primary && (
        <h3 className="text-base font-semibold leading-snug break-words [overflow-wrap:anywhere]">
          {renderCellContent(primary, row)}
        </h3>
      )}

      {secondary.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-sm">
          {secondary.map(column => (
            <div key={column.id} className="flex items-start gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">
                {mobileLabelOf(column)}
              </dt>
              <dd className={cn('min-w-0 flex-1 break-words [overflow-wrap:anywhere]', column.numeric && 'tabular-nums')}>
                {renderCellContent(column, row)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Tertiary fields collapse behind one disclosure. Rendering sixteen
          key-value rows is the wall of text the card view replaces. */}
      {tertiary.length > 0 && (
        <Collapsible open={showMore} onOpenChange={setShowMore}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onClick={e => e.stopPropagation()}
              className="mt-3 inline-flex min-h-touch items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')}
              />
              {showMore ? 'Less' : 'More details'}
              <span className="sr-only"> for this record</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 space-y-1.5 border-t pt-2 text-sm">
              {tertiary.map(column => (
                <div key={column.id} className="flex items-start gap-3">
                  <dt className="w-24 shrink-0 text-muted-foreground">
                    {mobileLabelOf(column)}
                  </dt>
                  <dd className={cn('min-w-0 flex-1 break-words [overflow-wrap:anywhere]', column.numeric && 'tabular-nums')}>
                    {renderCellContent(column, row)}
                  </dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}

      {actions && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
          // The card itself navigates; a tap on an action must not do both.
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Sort sheet (mobile)
// ---------------------------------------------------------------------------

function SortSheet<T>({
  columns,
  sort,
  onToggle,
  onClear,
}: {
  columns: DataGridColumn<T>[]
  sort: SortState | null
  onToggle: (columnId: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const activeLabel = columns.find(c => c.id === sort?.columnId)?.header

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-touch shrink-0">
          <ChevronsUpDown className="mr-2 h-4 w-4" />
          Sort
          {activeLabel && (
            <Badge variant="secondary" className="ml-2 max-w-[90px] truncate text-xs">
              {activeLabel}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto pb-safe">
        <SheetHeader className="text-left">
          <SheetTitle>Sort by</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-1">
          {columns.map(column => {
            const active = sort?.columnId === column.id
            return (
              <button
                key={column.id}
                type="button"
                onClick={() => onToggle(column.id)}
                className={cn(
                  'flex w-full min-h-touch-lg items-center justify-between rounded-md px-3 text-left text-sm',
                  'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-muted font-medium'
                )}
              >
                <span className="truncate">{column.header}</span>
                {active &&
                  (sort!.direction === 'asc' ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <ArrowUpAZ className="h-4 w-4" />
                      Ascending
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <ArrowDownAZ className="h-4 w-4" />
                      Descending
                    </span>
                  ))}
              </button>
            )
          })}
        </div>
        {sort && (
          <Button variant="ghost" className="mt-3 w-full min-h-touch-lg" onClick={onClear}>
            Clear sorting
          </Button>
        )}
      </SheetContent>
    </Sheet>
  )
}
