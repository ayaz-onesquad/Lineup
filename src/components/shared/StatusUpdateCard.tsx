import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Eye } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { StatusUpdateWithAuthor } from '@/types/database'

interface StatusUpdateCardProps {
  update: StatusUpdateWithAuthor
  isFirst?: boolean
}

const STATUS_TYPES = [
  { value: 'general', label: 'Update', variant: 'default' },
  { value: 'milestone', label: 'Milestone', variant: 'default' },
  { value: 'blocker', label: 'Blocker', variant: 'destructive' },
  { value: 'completed', label: 'Completed', variant: 'default' },
] as const

export function StatusUpdateCard({ update, isFirst }: StatusUpdateCardProps) {
  const statusType = STATUS_TYPES.find((t) => t.value === update.update_type)

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div
        className={cn(
          'absolute left-2.5 w-3 h-3 rounded-full border-2 border-background',
          isFirst ? 'bg-primary' : 'bg-muted-foreground'
        )}
      />

      {/* Card */}
      <Card className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Badge
              variant={statusType?.variant as 'default' | 'destructive' | undefined}
            >
              {statusType?.label || update.update_type}
            </Badge>
            {update.show_in_client_portal && (
              <Badge variant="outline">
                <Eye className="h-3 w-3 mr-1" />
                Client Visible
              </Badge>
            )}
          </div>

          {/* Title */}
          {update.title && <h4 className="font-semibold">{update.title}</h4>}

          {/* Content */}
          <div className="text-muted-foreground text-sm whitespace-pre-wrap">
            {update.content}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarImage src={update.author?.avatar_url} />
              <AvatarFallback>
                {update.author?.full_name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <span>{update.author?.full_name || 'Unknown'}</span>
            <span>•</span>
            <span>
              {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
