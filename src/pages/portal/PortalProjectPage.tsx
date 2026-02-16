import { useParams, Link } from 'react-router-dom'
import { useProjectWithHierarchy } from '@/hooks/useProjects'
import {
  usePortalSets,
  usePortalRequirements,
  usePortalDocuments,
  usePortalStatusUpdates,
} from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusUpdateCard } from '@/components/shared'
import {
  PortalSetsTable,
  PortalRequirementsTable,
  PortalDocumentsGrid,
} from '@/components/portal'
import {
  ArrowLeft,
  Layers,
  CheckSquare,
  FileText,
  MessageSquare,
  Calendar,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'
import type { StatusUpdateWithAuthor } from '@/types/database'

export function PortalProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)

  // Fetch portal-visible content
  const { data: sets, isLoading: setsLoading } = usePortalSets(projectId!)
  const { data: requirements, isLoading: requirementsLoading } = usePortalRequirements(projectId!)
  const { data: documents, isLoading: documentsLoading } = usePortalDocuments(projectId!)
  const { data: clientUpdates, isLoading: updatesLoading } = usePortalStatusUpdates(projectId!)

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
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
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
      <Tabs defaultValue="sets">
        <TabsList>
          <TabsTrigger value="sets" className="gap-2">
            <Layers className="h-4 w-4" />
            Work Packages ({sets?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Requirements ({requirements?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents ({documents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="updates" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Updates
          </TabsTrigger>
        </TabsList>

        {/* Sets Tab */}
        <TabsContent value="sets" className="mt-6">
          {setsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <PortalSetsTable sets={sets || []} />
          )}
        </TabsContent>

        {/* Requirements Tab */}
        <TabsContent value="requirements" className="mt-6">
          {requirementsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <PortalRequirementsTable requirements={requirements || []} />
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {documentsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <PortalDocumentsGrid documents={documents || []} />
          )}
        </TabsContent>

        {/* Updates Tab */}
        <TabsContent value="updates" className="mt-6">
          {updatesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !clientUpdates || clientUpdates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No updates shared yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

              {/* Status update cards */}
              <div className="space-y-4">
                {clientUpdates.map((update: StatusUpdateWithAuthor, index: number) => (
                  <StatusUpdateCard
                    key={update.id}
                    update={update}
                    isFirst={index === 0}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
