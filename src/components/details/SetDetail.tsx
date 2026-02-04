import { useSet } from '@/hooks/useSets'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Layers, Calendar, User } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'

interface SetDetailProps {
  id: string
}

export function SetDetail({ id }: SetDetailProps) {
  const { data: set, isLoading } = useSet(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!set) {
    return <div className="text-muted-foreground">Set not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{set.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(set.status)}>{set.status}</Badge>
          <Badge variant="outline">
            U: {set.urgency} / I: {set.importance}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span>Progress</span>
          <span>{set.completion_percentage}%</span>
        </div>
        <Progress value={set.completion_percentage} />
      </div>

      {/* Details */}
      <div className="space-y-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Project: </span>
          <span>{set.projects?.name}</span>
        </div>
        {set.project_phases && (
          <div className="text-sm">
            <span className="text-muted-foreground">Phase: </span>
            <span>{set.project_phases.name}</span>
          </div>
        )}
        {set.owner && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{set.owner.full_name}</span>
          </div>
        )}
        {set.due_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>Due {formatDate(set.due_date)}</span>
          </div>
        )}
        {set.description && (
          <div className="text-sm">
            <p className="text-muted-foreground mb-1">Description</p>
            <p>{set.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
