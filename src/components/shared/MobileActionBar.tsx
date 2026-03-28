import { Button } from '@/components/ui/button'
import { X, Eye, Edit, Trash2 } from 'lucide-react'

interface MobileActionBarProps {
  /** Display name of the selected record */
  selectedName: string
  /** Called when user taps deselect (X) */
  onDeselect: () => void
  /** Called when user taps Open/View */
  onOpen: () => void
  /** Called when user taps Edit (optional) */
  onEdit?: () => void
  /** Called when user taps Delete (optional) */
  onDelete?: () => void
  /** Custom action buttons (rendered between Open and Edit) */
  customActions?: React.ReactNode
}

/**
 * Sticky bottom action bar for mobile list views.
 * Appears when a row is selected on mobile devices.
 * Hidden on md and above (md:hidden).
 */
export function MobileActionBar({
  selectedName,
  onDeselect,
  onOpen,
  onEdit,
  onDelete,
  customActions,
}: MobileActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t shadow-lg p-4 flex gap-3 items-center">
      {/* Close / deselect */}
      <Button variant="outline" size="sm" className="flex-none" onClick={onDeselect}>
        <X className="h-4 w-4" />
      </Button>

      {/* Record name — truncated */}
      <span className="flex-1 text-sm font-medium truncate">{selectedName}</span>

      {/* Custom actions */}
      {customActions}

      {/* Open */}
      <Button variant="outline" size="sm" onClick={onOpen}>
        <Eye className="h-4 w-4 mr-1" />
        Open
      </Button>

      {/* Edit (optional) */}
      {onEdit && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
      )}

      {/* Delete (optional) */}
      {onDelete && (
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
