import { useParams, Link } from 'react-router-dom'
import { useProjectWithHierarchy } from '@/hooks/useProjects'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  FolderKanban,
  Layers,
  CheckSquare,
  FileText,
  MessageSquare,
  Settings,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'
import { useState } from 'react'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)
  const { openDetailPanel, openCreateModal } = useUIStore()
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())

  const togglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases)
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId)
    } else {
      newExpanded.add(phaseId)
    }
    setExpandedPhases(newExpanded)
  }

  const toggleSet = (setId: string) => {
    const newExpanded = new Set(expandedSets)
    if (newExpanded.has(setId)) {
      newExpanded.delete(setId)
    } else {
      newExpanded.add(setId)
    }
    setExpandedSets(newExpanded)
  }

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
        <Link to="/projects">
          <Button variant="link">Back to Projects</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/projects">
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
          <p className="text-muted-foreground">
            {project.project_code} • {project.clients?.name}
          </p>
        </div>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Overall Progress</p>
              <p className="text-2xl font-bold">{project.completion_percentage}%</p>
            </div>
            {project.expected_end_date && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="font-medium">{formatDate(project.expected_end_date)}</p>
              </div>
            )}
          </div>
          <Progress value={project.completion_percentage} className="h-3" />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="hierarchy">
        <TabsList>
          <TabsTrigger value="hierarchy" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Hierarchy
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              onClick={() => openCreateModal('phase', { project_id: project.id })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Phase
            </Button>
          </div>

          {project.phases?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No phases yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('phase', { project_id: project.id })}
                >
                  Add First Phase
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {project.phases
                ?.sort((a, b) => a.phase_order - b.phase_order)
                .map((phase) => (
                  <Card key={phase.id}>
                    <Collapsible
                      open={expandedPhases.has(phase.id)}
                      onOpenChange={() => togglePhase(phase.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <ChevronRight
                              className={`h-4 w-4 transition-transform ${
                                expandedPhases.has(phase.id) ? 'rotate-90' : ''
                              }`}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-lg">{phase.name}</CardTitle>
                                <Badge className={getStatusColor(phase.status)}>
                                  {phase.status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <CardDescription>
                                {phase.sets?.length || 0} sets • {phase.completion_percentage}%
                                complete
                              </CardDescription>
                            </div>
                            <Progress value={phase.completion_percentage} className="w-24 h-2" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pl-12">
                          {phase.sets?.length === 0 ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-muted-foreground mb-2">No sets yet</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  openCreateModal('set', {
                                    project_id: project.id,
                                    phase_id: phase.id,
                                  })
                                }
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Add Set
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {phase.sets
                                ?.sort((a, b) => a.set_order - b.set_order)
                                .map((set) => (
                                  <Collapsible
                                    key={set.id}
                                    open={expandedSets.has(set.id)}
                                    onOpenChange={() => toggleSet(set.id)}
                                  >
                                    <CollapsibleTrigger asChild>
                                      <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                                        <ChevronRight
                                          className={`h-4 w-4 transition-transform ${
                                            expandedSets.has(set.id) ? 'rotate-90' : ''
                                          }`}
                                        />
                                        <Layers className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">{set.name}</span>
                                            <Badge
                                              variant="outline"
                                              className={`text-xs ${
                                                set.urgency === 'high' && set.importance === 'high'
                                                  ? 'border-red-500 text-red-700'
                                                  : ''
                                              }`}
                                            >
                                              U:{set.urgency[0].toUpperCase()} I:
                                              {set.importance[0].toUpperCase()}
                                            </Badge>
                                          </div>
                                          <p className="text-xs text-muted-foreground">
                                            {set.requirements?.length || 0} requirements
                                          </p>
                                        </div>
                                        <Progress
                                          value={set.completion_percentage}
                                          className="w-16 h-1.5"
                                        />
                                      </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="ml-8 mt-2 space-y-2">
                                        {set.requirements?.map((req) => (
                                          <div
                                            key={req.id}
                                            className="flex items-center gap-2 p-2 rounded border-l-2 hover:bg-muted/50 cursor-pointer"
                                            style={{
                                              borderLeftColor:
                                                req.status === 'completed'
                                                  ? '#10B981'
                                                  : req.status === 'in_progress'
                                                  ? '#3B82F6'
                                                  : req.status === 'blocked'
                                                  ? '#EF4444'
                                                  : '#9CA3AF',
                                            }}
                                            onClick={() => openDetailPanel('requirement', req.id)}
                                          >
                                            <CheckSquare className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm flex-1">{req.title}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {req.status.replace('_', ' ')}
                                            </Badge>
                                          </div>
                                        ))}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full"
                                          onClick={() =>
                                            openCreateModal('requirement', { set_id: set.id })
                                          }
                                        >
                                          <Plus className="mr-2 h-3 w-3" />
                                          Add Requirement
                                        </Button>
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  openCreateModal('set', {
                                    project_id: project.id,
                                    phase_id: phase.id,
                                  })
                                }
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Add Set
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents yet</p>
              <Button className="mt-4">Upload Document</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No activity yet</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
