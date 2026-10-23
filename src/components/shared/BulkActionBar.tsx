import { Button } from '@/components/ui/button'
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
import { Trash2, Eye, Edit, X, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface BulkActionBarProps<T extends { id: string }> {
  selectedRows: T[]
  entityName: string
  /** URL segment for the single-row View / Edit shortcuts. Omit to hide them. */
  entityPath?: string
  onClearSelection: () => void
  onDelete: (ids: string[]) => Promise<void>
  onNavigate?: (path: string) => void
}

export function BulkActionBar<T extends { id: string }>({
  selectedRows,
  entityName,
  entityPath,
  onClearSelection,
  onDelete,
  onNavigate,
}: BulkActionBarProps<T>) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  if (selectedRows.length === 0) return null

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(selectedRows.map((row) => row.id))
      onClearSelection()
      setShowDeleteDialog(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const pluralSuffix = selectedRows.length !== 1 ? 's' : ''

  // Docked bars must clear the home indicator, hence the safe-area inset, and
  // must wrap so a long record name plus three actions does not overflow a
  // 390px viewport. See docs/DESIGN-SYSTEM.md section 5.3.
  return (
    <>

      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-wrap items-center justify-between gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
        <span className="text-sm font-medium">
          {selectedRows.length} {entityName}{pluralSuffix} selected
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClearSelection}>
            <X className="h-4 w-4 mr-2" />
            Clear selection
          </Button>
          {selectedRows.length === 1 && entityPath && onNavigate && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(`/${entityPath}/${selectedRows[0].id}`)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(`/${entityPath}/${selectedRows[0].id}?edit=true`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </>
          )}
          {selectedRows.length > 1 && entityPath && onNavigate && (
            <Button variant="ghost" size="sm" disabled title="Select only one row to view or edit">
              <Eye className="h-4 w-4 mr-2" />
              View / Edit (select one)
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete {selectedRows.length} {entityName}{pluralSuffix}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedRows.length} {entityName}{pluralSuffix}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRows.length} {entityName}{pluralSuffix}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedRows.length} ${entityName}${pluralSuffix}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
