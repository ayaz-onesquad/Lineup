import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
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
import { toast } from '@/hooks/use-toast'

interface DeleteRecordButtonProps {
  /** Singular, lower case: "requirement". Used in the dialog and toast. */
  entityName: string
  /** The record's display name, shown in the confirmation. */
  recordName?: string | null
  /** Deletes the record. Typically `deleteX.mutateAsync(id)`. */
  onDelete: () => Promise<unknown>
  /** Where to go once it is gone, usually the overview list. */
  redirectTo: string
  /** Extra consequence spelled out in the dialog, e.g. child records. */
  warning?: string
  disabled?: boolean
  className?: string
}

/**
 * Delete action for a record's detail page, placed in the edit toolbar.
 *
 * One component so every entity asks the same question, reports failure the
 * same way, and leaves the page afterwards (a deleted record's page would
 * otherwise sit there showing stale data). Records are soft-deleted by the
 * entity's own mutation.
 */
export function DeleteRecordButton({
  entityName,
  recordName,
  onDelete,
  redirectTo,
  warning,
  disabled,
  className,
}: DeleteRecordButtonProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async (event: React.MouseEvent) => {
    // Keep the dialog open until the delete settles, so a failure is visible.
    event.preventDefault()
    setIsDeleting(true)
    try {
      await onDelete()
      setOpen(false)
      toast({ title: `${entityName.charAt(0).toUpperCase()}${entityName.slice(1)} deleted` })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      toast({
        title: `Could not delete this ${entityName}`,
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/40 ' +
          (className ?? '')
        }
        onClick={() => setOpen(true)}
        disabled={disabled || isDeleting}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>

      <AlertDialog open={open} onOpenChange={next => !isDeleting && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {entityName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {recordName ? (
                <>
                  <span className="font-medium text-foreground break-words">{recordName}</span> will be
                  removed.
                </>
              ) : (
                <>This {entityName} will be removed.</>
              )}{' '}
              {warning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
