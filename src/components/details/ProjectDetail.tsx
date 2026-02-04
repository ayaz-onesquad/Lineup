import { useProject } from '@/hooks/useProjects'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FolderKanban, Calendar, User } from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'

interface ProjectDetailProps {
  id: string
}

export function ProjectDetail({ id }: ProjectDetailProps) {
  const { data: project, isLoading } = useProject(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!project) {
    return <div className="text-muted-foreground">Project not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <FolderKanban className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{project.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
          <Badge variant="outline" className={getHealthColor(project.health)}>
            {project.health.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span>Progress</span>
          <span>{project.completion_percentage}%</span>
        </div>
        <Progress value={project.completion_percentage} />
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
              <span className="text-muted-foreground">Code: </span>
              <span className="font-mono">{project.project_code}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Client: </span>
              <span>{project.clients?.name}</span>
            </div>
            {project.lead && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{project.lead.full_name}</span>
              </div>
            )}
            {project.expected_start_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatDate(project.expected_start_date)} -{' '}
                  {formatDate(project.expected_end_date)}
                </span>
              </div>
            )}
            {project.description && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Description</p>
                <p>{project.description}</p>
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
