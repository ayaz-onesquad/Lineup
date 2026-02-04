import { useParams, Link } from 'react-router-dom'
import { useProjectWithHierarchy } from '@/hooks/useProjects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Layers,
  CheckSquare,
  FileText,
  MessageSquare,
  Calendar,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'

export function PortalProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Link to="/portal">
          <Button variant="link">Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  // Filter visible items
  const visiblePhases = project.phases?.filter((p) => p.show_in_client_portal) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/portal">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
            <Badge variant="outline" className={getHealthColor(project.health)}>
              {project.health.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.project_code}</p>
        </div>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Overall Progress</p>
              <div className="flex items-center gap-4">
                <Progress value={project.completion_percentage} className="h-3 flex-1" />
                <span className="text-2xl font-bold">{project.completion_percentage}%</span>
              </div>
            </div>
            {project.expected_start_date && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="font-medium">{formatDate(project.expected_start_date)}</p>
                </div>
              </div>
            )}
            {project.expected_end_date && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expected Completion</p>
                  <p className="font-medium">{formatDate(project.expected_end_date)}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress" className="gap-2">
            <Layers className="h-4 w-4" />
            Progress
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="updates" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Updates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="mt-6">
          {visiblePhases.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No phases shared yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {visiblePhases
                .sort((a, b) => a.phase_order - b.phase_order)
                .map((phase) => {
                  const visibleSets = phase.sets?.filter((s) => s.show_in_client_portal) || []
                  return (
                    <Card key={phase.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">{phase.name}</CardTitle>
                            <CardDescription>
                              {phase.description || 'No description'}
                            </CardDescription>
                          </div>
                          <Badge className={getStatusColor(phase.status)}>
                            {phase.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span>Progress</span>
                            <span>{phase.completion_percentage}%</span>
                          </div>
                          <Progress value={phase.completion_percentage} className="h-2" />
                        </div>

                        {visibleSets.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <p className="text-sm font-medium">Work Items</p>
                            {visibleSets.map((set) => {
                              const visibleReqs =
                                set.requirements?.filter((r) => r.show_in_client_portal) || []
                              return (
                                <div key={set.id} className="p-3 rounded-lg border">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">{set.name}</span>
                                    <Badge variant="outline">
                                      {set.completion_percentage}%
                                    </Badge>
                                  </div>
                                  {visibleReqs.length > 0 && (
                                    <div className="space-y-1 mt-2">
                                      {visibleReqs.map((req) => (
                                        <div
                                          key={req.id}
                                          className="flex items-center gap-2 text-sm"
                                        >
                                          <CheckSquare
                                            className={`h-4 w-4 ${
                                              req.status === 'completed'
                                                ? 'text-green-500'
                                                : 'text-muted-foreground'
                                            }`}
                                          />
                                          <span
                                            className={
                                              req.status === 'completed'
                                                ? 'line-through text-muted-foreground'
                                                : ''
                                            }
                                          >
                                            {req.title}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents shared yet</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No updates shared yet</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
