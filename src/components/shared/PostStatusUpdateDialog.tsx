import { useState } from 'react'
import { useStatusUpdateMutations } from '@/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { StatusUpdateEntityType, StatusUpdateType } from '@/types/database'

interface PostStatusUpdateDialogProps {
  entityType: StatusUpdateEntityType
  entityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_UPDATE_TYPES = [
  { value: 'general', label: 'General Update', description: 'Regular progress update' },
  { value: 'milestone', label: 'Milestone', description: 'Important milestone reached' },
  { value: 'blocker', label: 'Blocker', description: 'Issue blocking progress' },
  { value: 'completed', label: 'Completed', description: 'Task or phase completed' },
] as const

export function PostStatusUpdateDialog({
  entityType,
  entityId,
  open,
  onOpenChange,
}: PostStatusUpdateDialogProps) {
  const { createStatusUpdate } = useStatusUpdateMutations()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [updateType, setUpdateType] = useState<StatusUpdateType>('general')
  const [isClientVisible, setIsClientVisible] = useState(false)

  const resetForm = () => {
    setTitle('')
    setContent('')
    setUpdateType('general')
    setIsClientVisible(false)
  }

  const handleSubmit = () => {
    if (!content.trim()) return

    createStatusUpdate.mutate(
      {
        entity_type: entityType,
        entity_id: entityId,
        title: title.trim() || undefined,
        content: content.trim(),
        update_type: updateType,
        show_in_client_portal: isClientVisible,
      },
      {
        onSuccess: () => {
          resetForm()
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post Status Update</DialogTitle>
          <DialogDescription>
            Share progress, milestones, or blockers with your team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Update Type and Client Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="update-type">Update Type</Label>
              <Select
                value={updateType}
                onValueChange={(v) => setUpdateType(v as StatusUpdateType)}
              >
                <SelectTrigger id="update-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_UPDATE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {type.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-visible">Client Portal</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  id="client-visible"
                  checked={isClientVisible}
                  onCheckedChange={setIsClientVisible}
                />
                <span className="text-sm text-muted-foreground">
                  Visible to client
                </span>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of this update"
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">
              Content <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Provide details about this update..."
              className="min-h-[150px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || createStatusUpdate.isPending}
          >
            {createStatusUpdate.isPending ? 'Posting...' : 'Post Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
