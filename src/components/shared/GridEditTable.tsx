import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
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
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ColumnType = 'text' | 'select' | 'date' | 'number'

export interface GridColumn<T> {
  key: keyof T | string
  header: string
  editable?: boolean
  type?: ColumnType
  options?: SearchableSelectOption[]
  render?: (row: T) => React.ReactNode
  getValue?: (row: T) => string | number | undefined
  width?: string
}

export interface GridEditTableProps<T extends { id: string }> {
  columns: GridColumn<T>[]
  data: T[]
  isGridEditMode: boolean
  onSave: (dirtyRows: Map<string, Partial<T>>) => Promise<void>
  onRowClick?: (row: T) => void
  onRowDoubleClick?: (row: T) => void
  isLoading?: boolean
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  emptyAction?: React.ReactNode
}

export function GridEditTable<T extends { id: string }>({
  columns,
  data,
  isGridEditMode,
  onSave,
  onRowClick,
  onRowDoubleClick,
  isLoading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  emptyAction,
}: GridEditTableProps<T>) {
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<T>>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [pendingExitCallback, setPendingExitCallback] = useState<(() => void) | null>(null)

  const dirtyCount = dirtyRows.size

  const handleCellChange = useCallback((rowId: string, key: keyof T | string, value: unknown) => {
    setDirtyRows((prev) => {
      const next = new Map(prev)
      const existing = next.get(rowId) || {}
      next.set(rowId, { ...existing, [key]: value } as Partial<T>)
      return next
    })
  }, [])

  const handleDiscard = useCallback(() => {
    setDirtyRows(new Map())
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (dirtyRows.size === 0) return
    setIsSaving(true)
    try {
      await onSave(dirtyRows)
      setDirtyRows(new Map())
    } finally {
      setIsSaving(false)
    }
  }, [dirtyRows, onSave])

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

  const isDirty = useCallback(
    (rowId: string) => {
      return dirtyRows.has(rowId)
    },
    [dirtyRows]
  )

  const confirmExit = useCallback(() => {
    setDirtyRows(new Map())
    setShowExitConfirm(false)
    if (pendingExitCallback) {
      pendingExitCallback()
      setPendingExitCallback(null)
    }
  }, [pendingExitCallback])

  const cancelExit = useCallback(() => {
    setShowExitConfirm(false)
    setPendingExitCallback(null)
  }, [])

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
            isGridEditMode && 'bg-muted/50 px-2 py-1.5 rounded cursor-not-allowed text-muted-foreground block'
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
            />
          )
      }
    },
    [isGridEditMode, getCellValue, handleCellChange]
  )

  // Memoize columns to prevent re-renders
  const tableColumns = useMemo(() => columns, [columns])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        {emptyIcon}
        <p className="text-muted-foreground mt-4">{emptyMessage}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {tableColumns.map((column) => (
              <TableHead
                key={String(column.key)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                'cursor-pointer hover:bg-muted/50',
                isDirty(row.id) && 'border-l-2 border-l-primary bg-primary/5'
              )}
              onClick={() => !isGridEditMode && onRowClick?.(row)}
              onDoubleClick={() => !isGridEditMode && onRowDoubleClick?.(row)}
            >
              {tableColumns.map((column) => (
                <TableCell key={String(column.key)}>
                  {renderCell(row, column)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Floating Save Bar */}
      {isGridEditMode && dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex justify-between items-center z-50">
          <span className="text-sm font-medium">
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
            <AlertDialogCancel onClick={cancelExit}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Hook to manage grid edit mode with exit confirmation
export function useGridEditMode() {
  const [isGridEditMode, setIsGridEditMode] = useState(false)
  const [exitRequestCallback, setExitRequestCallback] = useState<(() => void) | null>(null)

  const toggleGridEditMode = useCallback(() => {
    setIsGridEditMode((prev) => !prev)
  }, [])

  const requestExitGridEditMode = useCallback((callback?: () => void) => {
    if (callback) {
      setExitRequestCallback(() => callback)
    }
    return exitRequestCallback
  }, [exitRequestCallback])

  return {
    isGridEditMode,
    setIsGridEditMode,
    toggleGridEditMode,
    requestExitGridEditMode,
  }
}
