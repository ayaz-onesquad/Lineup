import { useState } from 'react'
import { useEntityStatusUpdates } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, Plus } from 'lucide-react'
import { StatusUpdateCard } from './StatusUpdateCard'
import { PostStatusUpdateDialog } from './PostStatusUpdateDialog'
import type { StatusUpdateEntityType } from '@/types/database'

interface StatusUpdatesTimelineProps {
  entityType: StatusUpdateEntityType
  entityId: string
  canPost?: boolean
}

export function StatusUpdatesTimeline({
  entityType,
  entityId,
  canPost = true,
}: StatusUpdatesTimelineProps) {
  const { data: updates, isLoading } = useEntityStatusUpdates(entityType, entityId)
  const [postDialogOpen, setPostDialogOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Status Updates
        </h3>
        {canPost && (
          <Button onClick={() => setPostDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Post Update
          </Button>
        )}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !updates || updates.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          No status updates yet.
          {canPost && ' Post one to keep the team informed!'}
        </Card>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {/* Updates */}
          <div className="space-y-4">
            {updates.map((update, index) => (
              <StatusUpdateCard
                key={update.id}
                update={update}
                isFirst={index === 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Post dialog */}
      <PostStatusUpdateDialog
        entityType={entityType}
        entityId={entityId}
        open={postDialogOpen}
        onOpenChange={setPostDialogOpen}
      />
    </div>
  )
}
