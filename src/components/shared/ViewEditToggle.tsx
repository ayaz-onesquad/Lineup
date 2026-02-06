import { Button } from '@/components/ui/button'
import { Edit, X, Save, Loader2 } from 'lucide-react'

interface ViewEditToggleProps {
  isEditing: boolean
  isSaving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  editLabel?: string
  saveLabel?: string
  cancelLabel?: string
  children: {
    view: React.ReactNode
    edit: React.ReactNode
  }
}

export function ViewEditToggle({
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  editLabel = 'Edit',
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  children,
}: ViewEditToggleProps) {
  return (
    <div>
      {/* Toggle buttons - right aligned */}
      <div className="flex justify-end gap-2 mb-4">
        {isEditing ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSaving}
            >
              <X className="mr-2 h-4 w-4" />
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saveLabel}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
          >
            <Edit className="mr-2 h-4 w-4" />
            {editLabel}
          </Button>
        )}
      </div>

      {/* Content - switches between view and edit */}
      {isEditing ? children.edit : children.view}
    </div>
  )
}
