import { useState, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
// Note: Not using shadcn Table component because it wraps in a div that breaks sticky headers
// Using raw table elements with similar styling for proper overflow/sticky behavior
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  Pencil,
  X,
  MoreVertical,
  Trash2,
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  ArrowUpAZ,
  ArrowDownAZ,
  ChevronsUpDown,
  Inbox,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DataGrid, ScrollFrame, type DataGridColumn } from '@/components/ui/data-grid'
import { toast } from '@/hooks/use-toast'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GridColumn, GridEditTableProps, ColumnState, RowClickContext } from './types'

export type { GridColumn, GridColumnType, GridEditTableProps, ColumnState, RowClickContext } from './types'

/** Get a unique ID for a column */
function getColumnId<T>(column: GridColumn<T>): string {
  return column.id ?? String(column.key)
}

/** Component for a sortable column item in the column manager dropdown */
function SortableColumnItem<T>({
  column,
  isVisible,
  onToggle,
}: {
  column: GridColumn<T>
  isVisible: boolean
  onToggle: () => void
}) {
  const id = getColumnId(column)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const headerLabel = typeof column.header === 'string'
    ? column.header
    : String(column.key).replace(/_/g, ' ').replace(/\./g, ' › ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-sm"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        className="flex-1 flex items-center gap-2 text-sm text-left"
        onClick={onToggle}
      >
        {isVisible
          ? <Eye className="h-3.5 w-3.5 text-primary" />
          : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        }
        <span className={isVisible ? '' : 'text-muted-foreground'}>
          {headerLabel}
        </span>
      </button>
    </div>
  )
}

/** Column Manager Button that shows a dropdown to toggle visibility and reorder columns */
function ColumnManagerButton<T>({
  columns,
  columnVisibility,
  columnOrder,
  onVisibilityChange,
  onOrderChange,
}: {
  columns: GridColumn<T>[]
  columnVisibility: Record<string, boolean>
  columnOrder: string[]
  onVisibilityChange: (visibility: Record<string, boolean>) => void
  onOrderChange: (order: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Get hideable columns only
  const hideableColumns = columns.filter(col => col.enableHiding !== false)

  // Order columns by current order
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map(id => hideableColumns.find(c => getColumnId(c) === id))
      .filter((c): c is GridColumn<T> => c !== undefined)
  }, [hideableColumns, columnOrder])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = columnOrder.indexOf(active.id as string)
    const newIndex = columnOrder.indexOf(over.id as string)

    if (oldIndex !== -1 && newIndex !== -1) {
      onOrderChange(arrayMove(columnOrder, oldIndex, newIndex))
    }
  }

  const toggleVisibility = (columnId: string) => {
    onVisibilityChange({
      ...columnVisibility,
      [columnId]: !columnVisibility[columnId],
    })
  }

  const showAll = () => {
    const newVisibility: Record<string, boolean> = {}
    hideableColumns.forEach(col => {
      newVisibility[getColumnId(col)] = true
    })
    onVisibilityChange(newVisibility)
  }

  const hideAll = () => {
    const newVisibility: Record<string, boolean> = {}
    hideableColumns.forEach((col, index) => {
      // Never hide the first column
      newVisibility[getColumnId(col)] = index === 0
    })
    onVisibilityChange(newVisibility)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Settings2 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">Show / hide and reorder columns</p>
        </div>
        <div className="border-t my-1" />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderedColumns.map(c => getColumnId(c))}
            strategy={verticalListSortingStrategy}
          >
            {orderedColumns.map(col => {
              const id = getColumnId(col)
              return (
                <SortableColumnItem
                  key={id}
                  column={col}
                  isVisible={columnVisibility[id] !== false}
                  onToggle={() => toggleVisibility(id)}
                />
              )
            })}
          </SortableContext>
        </DndContext>

        <div className="border-t my-1 px-2 pb-1.5 pt-1 flex justify-between">
          <button
            className="text-xs text-primary hover:underline"
            onClick={showAll}
          >
            Show all
          </button>
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={hideAll}
          >
            Hide all
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Width for columns that declare none, so they cannot collapse. */
const DEFAULT_COLUMN_WIDTH = 160

export function GridEditTable<T extends { id: string }>({
  columns,
  data,
  isLoading = false,
  onSave,
  onRowClick,
  onRowDoubleClick,
  onDelete,
  deleteLabel = 'item',
  emptyMessage = 'No data found',
  emptyIcon,
  emptyAction,
  children,
  showGridEditToggle = true,
  toolbarActions,
  enableSelection = false,
  rowSelection = {},
  onRowSelectionChange,
  storageKey,
  density = 'compact',
  defaultSort,
  ariaLabel,
  exportFileName,
}: GridEditTableProps<T>) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  // Get initial column state from localStorage or defaults
  const getInitialColumnState = useCallback((): ColumnState => {
    const defaultOrder = columns.map(col => getColumnId(col))
    const defaultVisibility: Record<string, boolean> = {}
    columns.forEach(col => {
      defaultVisibility[getColumnId(col)] = true
    })

    if (!storageKey) {
      return { visibility: defaultVisibility, order: defaultOrder }
    }

    try {
      const saved = localStorage.getItem(`lineup_col_${storageKey}`)
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnState
        // Merge with defaults to handle new columns
        const mergedVisibility = { ...defaultVisibility }
        Object.keys(parsed.visibility).forEach(key => {
          if (key in mergedVisibility) {
            mergedVisibility[key] = parsed.visibility[key]
          }
        })
        // Ensure order contains all columns (add new ones at end)
        const mergedOrder = parsed.order.filter(id => defaultOrder.includes(id))
        defaultOrder.forEach(id => {
          if (!mergedOrder.includes(id)) {
            mergedOrder.push(id)
          }
        })
        return { visibility: mergedVisibility, order: mergedOrder }
      }
    } catch {
      // Ignore parse errors
    }

    return { visibility: defaultVisibility, order: defaultOrder }
  }, [columns, storageKey])

  // Column visibility and order state
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => getInitialColumnState().visibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => getInitialColumnState().order)

  // Persist column state to localStorage
  useEffect(() => {
    if (!storageKey) return
    const state: ColumnState = { visibility: columnVisibility, order: columnOrder }
    localStorage.setItem(`lineup_col_${storageKey}`, JSON.stringify(state))
  }, [columnVisibility, columnOrder, storageKey])

  // Get visible columns in order
  const visibleColumns = useMemo(() => {
    // First get non-hideable columns (always show first)
    const nonHideableColumns = columns.filter(col => col.enableHiding === false)
    // Then get hideable columns in order, filtered by visibility
    const hideableColumns = columnOrder
      .map(id => columns.find(col => getColumnId(col) === id))
      .filter((col): col is GridColumn<T> =>
        col !== undefined &&
        col.enableHiding !== false &&
        columnVisibility[getColumnId(col)] !== false
      )
    return [...nonHideableColumns, ...hideableColumns]
  }, [columns, columnOrder, columnVisibility])

  // Internal state management
  // Sorting. Persisted separately from column visibility so an older stored
  // ColumnState (which has no sort field) still loads cleanly.
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(
    () => {
      if (storageKey) {
        try {
          const saved = localStorage.getItem(`lineup_sort_${storageKey}`)
          if (saved) return JSON.parse(saved)
        } catch {
          /* fall through to the default */
        }
      }
      return defaultSort ?? null
    }
  )

  const toggleSort = useCallback(
    (columnId: string) => {
      setSort(current => {
        let next: { columnId: string; direction: 'asc' | 'desc' } | null
        if (!current || current.columnId !== columnId) {
          next = { columnId, direction: 'asc' }
        } else if (current.direction === 'asc') {
          next = { columnId, direction: 'desc' }
        } else {
          next = null
        }
        if (storageKey) {
          try {
            if (next) localStorage.setItem(`lineup_sort_${storageKey}`, JSON.stringify(next))
            else localStorage.removeItem(`lineup_sort_${storageKey}`)
          } catch {
            /* sorting still works for this session */
          }
        }
        return next
      })
    },
    [storageKey]
  )

  const [isGridEditMode, setIsGridEditMode] = useState(false)
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<T>>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [deleteRow, setDeleteRow] = useState<T | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const dirtyCount = dirtyRows.size

  // Selection helpers
  const selectedCount = Object.values(rowSelection).filter(Boolean).length
  const isAllSelected = data.length > 0 && selectedCount === data.length
  const isSomeSelected = selectedCount > 0 && selectedCount < data.length

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!onRowSelectionChange) return
    const newSelection: Record<string, boolean> = {}
    if (checked) {
      data.forEach((row) => {
        newSelection[row.id] = true
      })
    }
    onRowSelectionChange(newSelection)
  }, [data, onRowSelectionChange])

  const handleSelectRow = useCallback((rowId: string, checked: boolean) => {
    if (!onRowSelectionChange) return
    const newSelection = { ...rowSelection }
    if (checked) {
      newSelection[rowId] = true
    } else {
      delete newSelection[rowId]
    }
    onRowSelectionChange(newSelection)
  }, [rowSelection, onRowSelectionChange])

  // Handle cell value changes
  const handleCellChange = useCallback((rowId: string, key: keyof T | string, value: unknown) => {
    setDirtyRows((prev) => {
      const next = new Map(prev)
      const existing = next.get(rowId) || {}
      next.set(rowId, { ...existing, [key]: value } as Partial<T>)
      return next
    })
  }, [])

  // Discard all changes
  const handleDiscard = useCallback(() => {
    setDirtyRows(new Map())
  }, [])

  // Save all changes
  const handleSaveAll = useCallback(async () => {
    if (dirtyRows.size === 0) return
    setIsSaving(true)
    try {
      await onSave(dirtyRows)
      setDirtyRows(new Map())
      toast({
        title: 'Changes saved',
        description: `${dirtyRows.size} ${dirtyRows.size === 1 ? 'record' : 'records'} updated successfully.`,
      })
    } catch (error) {
      console.error('Failed to save changes:', error)
      toast({
        title: 'Failed to save changes',
        description: 'Some updates may have failed. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [dirtyRows, onSave])

  // Toggle grid edit mode with confirmation if dirty
  const handleToggleGridEdit = useCallback(() => {
    if (isGridEditMode && dirtyRows.size > 0) {
      setShowExitConfirm(true)
    } else {
      setIsGridEditMode(!isGridEditMode)
    }
  }, [isGridEditMode, dirtyRows.size])

  // Confirm exit without saving
  const confirmExit = useCallback(() => {
    setDirtyRows(new Map())
    setIsGridEditMode(false)
    setShowExitConfirm(false)
  }, [])

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteRow || !onDelete) return
    setIsDeleting(true)
    try {
      await onDelete(deleteRow)
      toast({
        title: 'Deleted',
        description: `The ${deleteLabel} has been deleted.`,
      })
    } catch (error) {
      console.error('Failed to delete:', error)
      toast({
        title: 'Delete failed',
        description: `Failed to delete ${deleteLabel}. Please try again.`,
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
      setDeleteRow(null)
    }
  }, [deleteRow, onDelete, deleteLabel])

  // Get the current value for a cell (edited value or original)
  const getCellValue = useCallback(
    (row: T, key: keyof T | string): unknown => {
      const edited = dirtyRows.get(row.id)
      if (edited && key in edited) {
        return edited[key as keyof Partial<T>]
      }
      const keyStr = String(key)
      if (keyStr.includes('.')) {
        // Handle nested keys like 'projects.name'
        const parts = keyStr.split('.')
        let value: unknown = row
        for (const part of parts) {
          if (value && typeof value === 'object') {
            value = (value as Record<string, unknown>)[part]
          } else {
            return undefined
          }
        }
        return value
      }
      return row[key as keyof T]
    },
    [dirtyRows]
  )

  // Check if row has unsaved changes
  const isDirty = useCallback(
    (rowId: string) => dirtyRows.has(rowId),
    [dirtyRows]
  )

  // Render a cell based on column config and edit mode
  const renderCell = useCallback(
    (row: T, column: GridColumn<T>) => {
      const isEditable = isGridEditMode && column.editable
      const value = column.getValue
        ? column.getValue(row)
        : getCellValue(row, column.key)

      // Non-editable cell
      if (!isEditable) {
        if (column.render) {
          return column.render(row)
        }
        return (
          <span className={cn(
            isGridEditMode && 'bg-muted/30 px-2 py-1.5 rounded cursor-not-allowed text-muted-foreground block'
          )}>
            {value as React.ReactNode}
          </span>
        )
      }

      // Editable cell based on type
      switch (column.type) {
        case 'select':
          return (
            <SearchableSelect
              options={column.options || []}
              value={value as string}
              onValueChange={(newValue) =>
                handleCellChange(row.id, column.key, newValue)
              }
              placeholder="Select..."
              clearable
              triggerClassName="h-8 text-sm"
            />
          )

        case 'date':
          return (
            <Input
              type="date"
              value={(value as string) || ''}
              onChange={(e) =>
                handleCellChange(row.id, column.key, e.target.value || null)
              }
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          )

        case 'number':
          return (
            <Input
              type="number"
              value={(value as number) ?? ''}
              onChange={(e) =>
                handleCellChange(
                  row.id,
                  column.key,
                  e.target.value ? Number(e.target.value) : null
                )
              }
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          )

        case 'text':
        default:
          return (
            <Input
              type="text"
              value={(value as string) || ''}
              onChange={(e) =>
                handleCellChange(row.id, column.key, e.target.value)
              }
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          )
      }
    },
    [isGridEditMode, getCellValue, handleCellChange]
  )

  // Check if any columns are hideable (to show column manager)
  /**
   * Comparator shared with DataGrid's: empty values sort last in both
   * directions, and strings compare numerically so "Phase 2" precedes
   * "Phase 10".
   */
  const sortedData = useMemo(() => {
    if (!sort) return data
    const column = columns.find(c => getColumnId(c) === sort.columnId)
    if (!column) return data

    const valueOf = (row: T): string | number | undefined => {
      if (column.getValue) return column.getValue(row)
      const raw = getCellValue(row, column.key)
      if (raw === null || raw === undefined) return undefined
      if (typeof raw === 'number' || typeof raw === 'string') return raw
      return String(raw)
    }

    const factor = sort.direction === 'asc' ? 1 : -1

    return [...data].sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      const aEmpty = av === undefined || av === ''
      const bEmpty = bv === undefined || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * factor
      )
    })
  }, [data, sort, columns, getCellValue])

  // Excel export: the rows on screen (or just the selected ones), in the
  // columns the user has not hidden, in their chosen order.
  const [isExporting, setIsExporting] = useState(false)
  const handleExport = useCallback(async () => {
    if (!exportFileName) return
    setIsExporting(true)
    try {
      const { exportToExcel } = await import('@/lib/exportToExcel')
      const selected = sortedData.filter(row => rowSelection[row.id])
      await exportToExcel<T>({
        fileName: exportFileName,
        rows: selected.length > 0 ? selected : sortedData,
        columns: visibleColumns.map(column => ({
          header: typeof column.header === 'string' ? column.header : getColumnId(column),
          value: (row: T) =>
            column.exportValue
              ? column.exportValue(row)
              : column.getValue
                ? column.getValue(row)
                : getCellValue(row, column.key),
        })),
      })
    } finally {
      setIsExporting(false)
    }
  }, [exportFileName, sortedData, rowSelection, visibleColumns, getCellValue])

  const selectedCountForExport = Object.values(rowSelection).filter(Boolean).length

  // Sum of declared column widths; see the table element below.
  const tableMinWidth = useMemo(
    () =>
      (enableSelection ? 40 : 0) +
      (onDelete ? 50 : 0) +
      visibleColumns.reduce((total, column) => {
        const declared = column.size ?? parseInt(String(column.width ?? ''), 10)
        return total + (Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_COLUMN_WIDTH)
      }, 0),
    [enableSelection, onDelete, visibleColumns]
  )

  const hasHideableColumns = useMemo(() =>
    columns.some(col => col.enableHiding !== false),
    [columns]
  )

  // ---------------------------------------------------------------------------
  // Mobile
  //
  // Below `md` this delegates entirely to DataGrid, which renders the card view
  // and the sort sheet. Two reasons rather than building a second card layout
  // here:
  //
  //   1. Inline cell editing is not viable on a phone. A 16-column grid with
  //      editable date and select inputs cannot be used at 390px, so grid-edit
  //      mode is deliberately desktop-only. Mobile is read-and-navigate.
  //   2. One card implementation means a column added to a page gets correct
  //      mobile treatment with no extra work.
  //
  // Selection and per-row delete are likewise desktop-only; on mobile the
  // record's own page carries those actions.
  // ---------------------------------------------------------------------------
  const mobileColumns = useMemo<DataGridColumn<T>[]>(
    () =>
      columns.map(column => {
        const columnId = getColumnId(column)
        const label =
          column.mobileLabel ??
          (typeof column.header === 'string' ? column.header : columnId)

        return {
          id: columnId,
          header: label,
          accessor: row => {
            if (column.getValue) return column.getValue(row)
            const raw = getCellValue(row, column.key)
            if (raw === null || raw === undefined) return undefined
            if (typeof raw === 'number' || typeof raw === 'string') return raw
            return String(raw)
          },
          cell: column.render ? row => column.render!(row) : undefined,
          priority: column.priority,
          mobileLabel: column.mobileLabel,
          hideOnMobile: column.hideOnMobile,
          numeric: column.numeric,
          sortable: column.sortable ?? true,
        }
      }),
    [columns, getCellValue]
  )

  if (isMobile) {
    return (
      <DataGrid<T>
        columns={mobileColumns}
        data={sortedData}
        getRowId={row => row.id}
        isLoading={isLoading}
        onRowOpen={
          onRowDoubleClick || onRowClick
            ? row => {
                const context: RowClickContext = {
                  sortedIds: sortedData.map(r => r.id),
                  source: storageKey || 'unknown',
                }
                ;(onRowDoubleClick ?? onRowClick)?.(row, context)
              }
            : undefined
        }
        density={density}
        storageKey={storageKey ? `${storageKey}-mobile` : undefined}
        defaultSort={sort ?? defaultSort}
        toolbar={children}
        ariaLabel={ariaLabel}
        exportOptions={exportFileName ? { fileName: exportFileName } : undefined}
        selectedIds={
          enableSelection && onRowSelectionChange
            ? new Set(Object.keys(rowSelection).filter(id => rowSelection[id]))
            : undefined
        }
        onSelectionChange={
          enableSelection && onRowSelectionChange
            ? ids => onRowSelectionChange(Object.fromEntries(Array.from(ids).map(id => [id, true])))
            : undefined
        }
        emptyState={{
          icon: Inbox,
          title: emptyMessage,
          action: emptyAction,
        }}
      />
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Toolbar. Wraps so filters, column manager and the grid-edit toggle do
          not overflow a narrow window. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {children}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportFileName && (
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting || sortedData.length === 0}
              className="gap-2"
              title={selectedCountForExport > 0 ? `Export the  selected rows to Excel` : 'Export these rows to Excel'}
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {selectedCountForExport > 0 ? `Export ` : 'Export'}
            </Button>
          )}
          {toolbarActions}
          {hasHideableColumns && storageKey && (
            <ColumnManagerButton
              columns={columns}
              columnVisibility={columnVisibility}
              columnOrder={columnOrder}
              onVisibilityChange={setColumnVisibility}
              onOrderChange={setColumnOrder}
            />
          )}
          {showGridEditToggle && (
            <Button
              variant={isGridEditMode ? 'default' : 'outline'}
              onClick={handleToggleGridEdit}
              className="gap-2"
            >
              {isGridEditMode ? (
                <>
                  <X className="h-4 w-4" />
                  Exit Grid Edit
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Grid Edit
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          {emptyIcon}
          <p className="text-muted-foreground mt-4">{emptyMessage}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : (
        <ScrollFrame maxBodyHeight="calc(100vh - 280px)">
          {/* `table-fixed` + `w-full` alone squeezes every column into the
              container, so a wide grid never scrolls and long text wraps one
              word per line. The min-width keeps each column at its declared
              width and lets the container above scroll sideways instead. */}
          <table className="w-full caption-bottom text-sm table-fixed" style={{ minWidth: tableMinWidth }}>
            <thead className="sticky top-0 z-10 bg-background shadow-sm [&_tr]:border-b">
              <tr className="border-b">
                {enableSelection && (
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: 40 }}>
                    <Checkbox
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) {
                          (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = isSomeSelected
                        }
                      }}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      aria-label="Select all"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}
                {visibleColumns.map((column) => {
                  const columnId = getColumnId(column)
                  const sortable = column.sortable ?? true
                  const active = sort?.columnId === columnId
                  return (
                    <th
                      key={columnId}
                      style={{ width: column.size ?? column.width ?? DEFAULT_COLUMN_WIDTH }}
                      aria-sort={
                        active
                          ? sort!.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className={cn(
                        'h-10 px-3 align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap',
                        column.numeric ? 'text-right' : 'text-left'
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(columnId)}
                          className={cn(
                            'group -mx-1 inline-flex items-center gap-1 rounded px-1',
                            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active && 'text-foreground'
                          )}
                        >
                          <span className="truncate">{column.header}</span>
                          {active ? (
                            sort!.direction === 'asc' ? (
                              <ArrowUpAZ className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDownAZ className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
                          )}
                        </button>
                      ) : (
                        <span className="truncate">{column.header}</span>
                      )}
                    </th>
                  )
                })}
                {onDelete && (
                  <th className="h-10 px-3" style={{ width: 50 }}></th>
                )}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {sortedData.map((row) => {
                // Save & Next walks the rows in the order the user sees them,
                // so this must be the sorted order, not the fetch order.
                const sortedIds = sortedData.map((r) => r.id)
                const clickContext: RowClickContext = {
                  sortedIds,
                  source: storageKey || 'unknown',
                }
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b transition-colors cursor-pointer hover:bg-muted/50 min-h-[44px]',
                      isDirty(row.id) && 'border-l-2 border-l-primary bg-primary/5',
                      rowSelection[row.id] && 'bg-muted/50'
                    )}
                    onClick={() => !isGridEditMode && onRowClick?.(row, clickContext)}
                    onDoubleClick={() => !isGridEditMode && onRowDoubleClick?.(row, clickContext)}
                  >
                    {enableSelection && (
                      <td className="px-3 py-2 align-middle">
                        <Checkbox
                          checked={!!rowSelection[row.id]}
                          onCheckedChange={(checked) => handleSelectRow(row.id, !!checked)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td
                        key={getColumnId(column)}
                        className={cn(
                          'px-3 py-2 align-middle',
                          column.numeric && 'text-right font-mono tabular-nums'
                        )}
                        style={column.size ? { width: column.size } : column.width ? { width: column.width } : undefined}
                      >
                        {renderCell(row, column)}
                      </td>
                    ))}
                    {onDelete && (
                      <td className="px-3 py-2 align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-50">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteRow(row)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollFrame>
      )}

      {/* Floating Save Bar */}
      {isGridEditMode && dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-wrap items-center justify-between gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
          <span className="text-sm text-muted-foreground">
            {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save All'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}.
              Are you sure you want to exit Grid Edit mode? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRow} onOpenChange={(open) => !open && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteLabel}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
