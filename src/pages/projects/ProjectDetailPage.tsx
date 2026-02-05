import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useProjectWithHierarchy, useProjectMutations } from '@/hooks/useProjects'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  FolderKanban,
  Layers,
  CheckSquare,
  FileText,
  MessageSquare,
  Building2,
  Calendar,
  Edit,
  X,
  Save,
  Loader2,
  User,
  Users,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import type { ProjectStatus, ProjectHealth } from '@/types/database'

// Project form schema
const projectFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']),
  health: z.enum(['on_track', 'at_risk', 'delayed']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
})

type ProjectFormValues = z.infer<typeof projectFormSchema>

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)
  const { updateProject } = useProjectMutations()
  const { openDetailPanel, openCreateModal } = useUIStore()

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Project form
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name || '',
      description: project?.description || '',
      status: project?.status || 'planning',
      health: project?.health || 'on_track',
      expected_start_date: project?.expected_start_date?.split('T')[0] || '',
      expected_end_date: project?.expected_end_date?.split('T')[0] || '',
      actual_start_date: project?.actual_start_date?.split('T')[0] || '',
      actual_end_date: project?.actual_end_date?.split('T')[0] || '',
    },
  })

  // Reset form when project data loads
  if (project && !form.formState.isDirty && !isEditing) {
    form.reset({
      name: project.name,
      description: project.description || '',
      status: project.status,
      health: project.health,
      expected_start_date: project.expected_start_date?.split('T')[0] || '',
      expected_end_date: project.expected_end_date?.split('T')[0] || '',
      actual_start_date: project.actual_start_date?.split('T')[0] || '',
      actual_end_date: project.actual_end_date?.split('T')[0] || '',
    })
  }

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

  const handleSaveProject = async (data: ProjectFormValues) => {
    if (!projectId) return
    setIsSaving(true)
    try {
      await updateProject.mutateAsync({
        id: projectId,
        name: data.name,
        description: data.description,
        status: data.status as ProjectStatus,
        health: data.health as ProjectHealth,
        expected_start_date: data.expected_start_date || undefined,
        expected_end_date: data.expected_end_date || undefined,
        actual_start_date: data.actual_start_date || undefined,
        actual_end_date: data.actual_end_date || undefined,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      name: project?.name || '',
      description: project?.description || '',
      status: project?.status || 'planning',
      health: project?.health || 'on_track',
      expected_start_date: project?.expected_start_date?.split('T')[0] || '',
      expected_end_date: project?.expected_end_date?.split('T')[0] || '',
      actual_start_date: project?.actual_start_date?.split('T')[0] || '',
      actual_end_date: project?.actual_end_date?.split('T')[0] || '',
    })
    setIsEditing(false)
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
            {isEditing ? (
              <Input
                {...form.register('name')}
                className="text-3xl font-bold h-auto py-1 px-2 max-w-md"
              />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            )}
            <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
            <Badge variant="outline" className={getHealthColor(project.health)}>
              {project.health.replace('_', ' ')}
            </Badge>
            {project.display_id && (
              <Badge variant="outline" className="font-mono">
                #{project.display_id}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {project.project_code} • {project.clients?.name}
          </p>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={form.handleSubmit(handleSaveProject)} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {/* Project Info Card */}
      <Card>
        <CardContent className="pt-6">
          {isEditing ? (
            <Form {...form}>
              <form className="space-y-6">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Project description..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="planning">Planning</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="on_hold">On Hold</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="health"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Health</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="on_track">On Track</SelectItem>
                            <SelectItem value="at_risk">At Risk</SelectItem>
                            <SelectItem value="delayed">Delayed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expected_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expected_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="actual_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actual Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="actual_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actual End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
              {/* Progress Row */}
              <div className="flex items-center justify-between">
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

              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-medium">{project.clients?.name || '-'}</p>
                  </div>
                </div>
                {project.lead && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Lead</p>
                      <p className="font-medium">{project.lead.full_name}</p>
                    </div>
                  </div>
                )}
                {project.pm && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Project Manager</p>
                      <p className="font-medium">{project.pm.full_name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{formatDate(project.created_at)}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{project.description}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="hierarchy">
        <TabsList>
          <TabsTrigger value="hierarchy" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Hierarchy
          </TabsTrigger>
          <TabsTrigger value="details" className="gap-2">
            <Building2 className="h-4 w-4" />
            Details
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

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Project Code</p>
                    <p className="font-mono">{project.project_code}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Health</p>
                    <Badge variant="outline" className={getHealthColor(project.health)}>
                      {project.health.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Completion</p>
                    <p>{project.completion_percentage}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Expected Start</p>
                    <p>{formatDate(project.expected_start_date) || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Expected End</p>
                    <p>{formatDate(project.expected_end_date) || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Actual Start</p>
                    <p>{formatDate(project.actual_start_date) || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Actual End</p>
                    <p>{formatDate(project.actual_end_date) || '-'}</p>
                  </div>
                </div>

                {/* Team */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Team</p>
                  <div className="flex flex-wrap gap-4">
                    {project.lead && (
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {project.lead.full_name?.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{project.lead.full_name}</p>
                          <p className="text-xs text-muted-foreground">Lead</p>
                        </div>
                      </div>
                    )}
                    {project.secondary_lead && (
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {project.secondary_lead.full_name?.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{project.secondary_lead.full_name}</p>
                          <p className="text-xs text-muted-foreground">Secondary Lead</p>
                        </div>
                      </div>
                    )}
                    {project.pm && (
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {project.pm.full_name?.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{project.pm.full_name}</p>
                          <p className="text-xs text-muted-foreground">Project Manager</p>
                        </div>
                      </div>
                    )}
                    {!project.lead && !project.secondary_lead && !project.pm && (
                      <p className="text-sm text-muted-foreground">No team members assigned</p>
                    )}
                  </div>
                </div>
              </div>
              <AuditTrail
                created_at={project.created_at}
                created_by={project.created_by}
                updated_at={project.updated_at}
                updated_by={project.updated_by}
                creator={project.creator}
                updater={project.updater}
              />
            </CardContent>
          </Card>
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
