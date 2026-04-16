import { useState, useMemo } from 'react'
import { useEntityDiscussions } from '@/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MessageSquare,
  Plus,
  Lock,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn, getInitials } from '@/lib/utils'
import { NewDiscussionDialog } from './NewDiscussionDialog'
import { DiscussionView } from './DiscussionView'
import type { EntityType, DiscussionStatus, DiscussionWithAuthor } from '@/types/database'

interface DiscussionsPanelProps {
  entityType: EntityType
  entityId: string
  entityLabel?: string // e.g., "Project: Website Redesign"
  title?: string
  description?: string
  maxHeight?: string
  className?: string
}

export function DiscussionsPanel({
  entityType,
  entityId,
  entityLabel,
  title = 'Discussions',
  description,
  maxHeight = '600px',
  className,
}: DiscussionsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<DiscussionStatus | 'all'>('open')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null)

  const { data: discussions, isLoading } = useEntityDiscussions(
    entityType,
    entityId,
    statusFilter
  )

  // Count open and closed discussions (for tab badges)
  const { openCount, closedCount, totalComments } = useMemo(() => {
    if (!discussions) return { openCount: 0, closedCount: 0, totalComments: 0 }

    let open = 0
    let closed = 0
    let comments = 0

    // When filter is 'all', we have all discussions
    // When filter is 'open' or 'closed', we only have that subset
    // For accurate counts, we need to use 'all' but we'll show what we have
    discussions.forEach(d => {
      if (d.status === 'closed') {
        closed++
      } else {
        open++
      }
      comments += 1 + (d.replies?.length || 0)
    })

    return { openCount: open, closedCount: closed, totalComments: comments }
  }, [discussions])

  const handleRowClick = (discussion: DiscussionWithAuthor) => {
    setSelectedDiscussionId(discussion.id)
  }

  return (
    <>
      <Card className={cn(className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              {title}
              <span className="text-muted-foreground text-sm font-normal">
                ({totalComments})
              </span>
            </CardTitle>
            <Button size="sm" onClick={() => setShowNewDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Discussion
            </Button>
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {/* Status Filter Tabs */}
          <Tabs
            value={statusFilter}
            onValueChange={v => setStatusFilter(v as DiscussionStatus | 'all')}
            className="mt-2"
          >
            <TabsList className="h-8">
              <TabsTrigger value="open" className="text-xs px-3">
                Active
                {openCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {openCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="closed" className="text-xs px-3">
                Closed
                {closedCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {closedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-3">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="pt-0">
          <div
            className="space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight }}
          >
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : !discussions?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">
                  {statusFilter === 'open'
                    ? 'No active discussions'
                    : statusFilter === 'closed'
                    ? 'No closed discussions'
                    : 'No discussions yet'}
                </p>
                <p className="text-xs mt-1">
                  Start a conversation by clicking "New Discussion"
                </p>
              </div>
            ) : (
              discussions.map(discussion => (
                <DiscussionRow
                  key={discussion.id}
                  discussion={discussion}
                  onClick={() => handleRowClick(discussion)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* New Discussion Dialog */}
      <NewDiscussionDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
      />

      {/* Discussion View Sheet */}
      <DiscussionView
        discussionId={selectedDiscussionId}
        open={!!selectedDiscussionId}
        onOpenChange={open => {
          if (!open) setSelectedDiscussionId(null)
        }}
        entityLabel={entityLabel}
      />
    </>
  )
}

// Individual Discussion Row
interface DiscussionRowProps {
  discussion: DiscussionWithAuthor
  onClick: () => void
}

function DiscussionRow({ discussion, onClick }: DiscussionRowProps) {
  const replyCount = discussion.replies?.length || 0
  const isClosed = discussion.status === 'closed'
  const displaySubject =
    discussion.subject || discussion.title || discussion.content.slice(0, 60)

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        'hover:bg-muted/50',
        isClosed && 'opacity-70'
      )}
      onClick={onClick}
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={discussion.author?.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {getInitials(discussion.author?.full_name || '')}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">
            {displaySubject.length > 60
              ? displaySubject.slice(0, 60) + '...'
              : displaySubject}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{discussion.author?.full_name}</span>
          <span>•</span>
          <span>
            {formatDistanceToNow(new Date(discussion.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Reply count */}
        {replyCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageCircle className="h-3 w-3" />
            {replyCount}
          </div>
        )}

        {/* Status badge */}
        {isClosed ? (
          <Badge variant="secondary" className="text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Closed
          </Badge>
        ) : discussion.is_internal ? (
          <Badge variant="outline" className="text-xs gap-1">
            <Lock className="h-3 w-3" />
            Internal
          </Badge>
        ) : null}

        {/* Participant avatars */}
        {discussion.participants && discussion.participants.length > 1 && (
          <div className="flex -space-x-2">
            {discussion.participants.slice(0, 3).map((_, idx) => (
              <div
                key={idx}
                className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center"
              >
                <span className="text-[8px] text-muted-foreground">
                  {idx + 1}
                </span>
              </div>
            ))}
            {discussion.participants.length > 3 && (
              <div className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-muted-foreground">
                  +{discussion.participants.length - 3}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
