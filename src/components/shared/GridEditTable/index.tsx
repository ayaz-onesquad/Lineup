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
import { Loader2, Pencil, X, MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { GridColumn, GridEditTableProps } from './types'

export type { GridColumn, GridColumnType, GridEditTableProps } from './types'

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
}: GridEditTableProps<T>) {
  // Internal state management
  const [isGridEditMode, setIsGridEditMode] = useState(false)
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<T>>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [deleteRow, setDeleteRow] = useState<T | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const dirtyCount = dirtyRows.size

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

  // Memoize columns to prevent re-renders
  const tableColumns = useMemo(() => columns, [columns])

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
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 flex-1">
          {children}
        </div>
        <div className="flex items-center gap-2">
          {toolbarActions}
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
        <div className="border rounded-lg">
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
                {onDelete && (
                  <TableHead style={{ width: '50px' }}></TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    'cursor-pointer hover:bg-muted/50 min-h-[44px]',
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
                  {onDelete && (
                    <TableCell>
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
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Floating Save Bar */}
      {isGridEditMode && dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex justify-between items-center z-50">
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
