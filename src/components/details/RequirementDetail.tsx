import { useRequirement } from '@/hooks/useRequirements'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckSquare, Calendar, User, Clock } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'

interface RequirementDetailProps {
  id: string
}

export function RequirementDetail({ id }: RequirementDetailProps) {
  const { data: requirement, isLoading } = useRequirement(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!requirement) {
    return <div className="text-muted-foreground">Requirement not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <CheckSquare className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{requirement.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(requirement.status)}>
            {requirement.status.replace('_', ' ')}
          </Badge>
          <Badge variant="outline">{requirement.requirement_type.replace('_', ' ')}</Badge>
        </div>
      </div>

      {/* Details */}
      <Tabs defaultValue="details">
        <TabsList className="w-full">
          <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Project: </span>
              <span>{requirement.sets?.projects?.name}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Set: </span>
              <span>{requirement.sets?.name}</span>
            </div>
            {requirement.assigned_to && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{requirement.assigned_to.full_name}</span>
              </div>
            )}
            {requirement.due_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Due {formatDate(requirement.due_date)}</span>
              </div>
            )}
            {requirement.estimated_hours && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {requirement.actual_hours || 0} / {requirement.estimated_hours} hours
                </span>
              </div>
            )}
            {requirement.description && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Description</p>
                <p>{requirement.description}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <p className="text-sm text-muted-foreground">Activity will be listed here</p>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <p className="text-sm text-muted-foreground">Documents will be listed here</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
