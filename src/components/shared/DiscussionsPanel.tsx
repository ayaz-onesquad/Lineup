import { useState, useMemo } from 'react'
import { useEntityDiscussions, useDiscussionMutations } from '@/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { MessageSquare, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiscussionThread } from './DiscussionThread'
import type { EntityType } from '@/types/database'

interface DiscussionsPanelProps {
  entityType: EntityType
  entityId: string
  title?: string
  description?: string
  maxHeight?: string
  className?: string
}

export function DiscussionsPanel({
  entityType,
  entityId,
  title = 'Discussions',
  description,
  maxHeight = '600px',
  className,
}: DiscussionsPanelProps) {
  const { data: discussions, isLoading } = useEntityDiscussions(entityType, entityId)
  const { createDiscussion } = useDiscussionMutations()

  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(true)

  // Group discussions by thread (parent_discussion_id)
  const threads = useMemo(() => {
    if (!discussions) return []
    return discussions
  }, [discussions])

  const handleSubmit = () => {
    if (!newComment.trim()) return

    createDiscussion.mutate(
      {
        entity_type: entityType,
        entity_id: entityId,
        content: newComment,
        is_internal: isInternal,
      },
      {
        onSuccess: () => {
          setNewComment('')
          setIsInternal(true)
        },
      }
    )
  }

  const totalComments = discussions?.reduce(
    (acc, d) => acc + 1 + (d.replies?.length || 0),
    0
  )

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {title}
            {totalComments !== undefined && (
              <span className="text-muted-foreground text-sm font-normal">
                ({totalComments})
              </span>
            )}
          </div>
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New discussion form */}
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
          <Textarea
            placeholder="Start a discussion..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[100px] bg-background"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="internal-toggle"
                checked={isInternal}
                onCheckedChange={setIsInternal}
              />
              <Label htmlFor="internal-toggle" className="text-sm cursor-pointer">
                Internal only (not visible to clients)
              </Label>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!newComment.trim() || createDiscussion.isPending}
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              Post
            </Button>
          </div>
        </div>

        {/* Discussion threads */}
        <div
          className="space-y-4 overflow-y-auto pr-2"
          style={{ maxHeight }}
        >
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No discussions yet.</p>
              <p className="text-xs">Start the conversation above!</p>
            </div>
          ) : (
            threads.map((thread) => (
              <DiscussionThread key={thread.id} discussion={thread} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
