import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useProjectWithHierarchy, useProjectMutations } from '@/hooks/useProjects'
import { useSetsByProject } from '@/hooks/useSets'
import { useRequirementsByProject } from '@/hooks/useRequirements'
import { usePitchesByProject } from '@/hooks/usePitches'
import { useTenantUsers } from '@/hooks/useTenant'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Plus,
  Layers,
  CheckSquare,
  FileText,
  MessageSquare,
  Building2,
  Edit,
  X,
  Save,
  Loader2,
  MoreVertical,
  MoreHorizontal,
  ExternalLink,
  Calendar,
  Users,
  Presentation,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel, DiscussionsPanel, StatusUpdatesTimeline } from '@/components/shared'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SaveAsTemplateDialog } from '@/components/projects/SaveAsTemplateDialog'
import { DraggablePhasesTable } from '@/components/phases/DraggablePhasesTable'
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
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  pm_id: z.string().optional(),
})

type ProjectFormValues = z.infer<typeof projectFormSchema>

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)
  const { data: projectSets, isLoading: setsLoading } = useSetsByProject(projectId!)
  const { data: projectRequirements, isLoading: requirementsLoading } = useRequirementsByProject(projectId!)
  const { data: projectPitches, isLoading: pitchesLoading } = usePitchesByProject(projectId!)
  const { updateProject } = useProjectMutations()
  const { data: users } = useTenantUsers()
  const { openDetailPanel, openCreateModal } = useUIStore()

  // User options for team member dropdowns - use user_profiles.id (not user_id)
  const userOptions = useMemo(() =>
    users?.filter((u) => u.user_profiles?.id).map((u) => ({
      value: u.user_profiles!.id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

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
      lead_id: project?.lead_id || '',
      secondary_lead_id: project?.secondary_lead_id || '',
      pm_id: project?.pm_id || '',
    },
  })

  // Reset form when project data loads
  useEffect(() => {
    if (project && !isEditing) {
      form.reset({
        name: project.name,
        description: project.description || '',
        status: project.status,
        health: project.health,
        expected_start_date: project.expected_start_date?.split('T')[0] || '',
        expected_end_date: project.expected_end_date?.split('T')[0] || '',
        actual_start_date: project.actual_start_date?.split('T')[0] || '',
        actual_end_date: project.actual_end_date?.split('T')[0] || '',
        lead_id: project.lead_id || '',
        secondary_lead_id: project.secondary_lead_id || '',
        pm_id: project.pm_id || '',
      })
    }
  }, [project?.id, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && project && !isEditing) {
      setIsEditing(true)
      // Clear the query param after entering edit mode
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, project])

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
        lead_id: data.lead_id || undefined,
        secondary_lead_id: data.secondary_lead_id || undefined,
        pm_id: data.pm_id || undefined,
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
      lead_id: project?.lead_id || '',
      secondary_lead_id: project?.secondary_lead_id || '',
      pm_id: project?.pm_id || '',
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
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs: Client > Project */}
      <Breadcrumbs
        items={[
          {
            label: project.clients?.name || 'Client',
            href: project.clients?.id ? `/clients/${project.clients.id}` : '/clients',
          },
          { label: project.name, displayId: project.display_id },
        ]}
      />

      {/* Header - Client Name first, then Project Name, Status, Health */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : project.name}
              {project.display_id && <span className="text-muted-foreground"> | ID: {project.display_id}</span>}
            </h1>
            <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
            <Badge variant="outline" className={getHealthColor(project.health)}>
              {project.health.replace('_', ' ')}
            </Badge>
          </div>
        </div>
        {/* Edit button moved to within the card for consistent UX */}
      </div>

      {/* Project Info Card - Key fields: Client (1st), Project Name, Status, Health */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons and Actions menu */}
          <div className="flex justify-end gap-2 mb-4">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={form.handleSubmit(handleSaveProject)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                      Save as Template
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {/* TODO: duplicate logic */}}>
                      Duplicate Project
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Delete Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Header fields: Client (1st), Project Name, Status, Health */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Client</p>
              <Link
                to={`/clients/${project.clients?.id}`}
                className="font-medium hover:underline"
              >
                {project.clients?.name || '—'}
              </Link>
            </div>
            <ViewEditField
              type="text"
              label="Project Name"
              required
              isEditing={isEditing}
              value={form.watch('name')}
              onChange={(v) => form.setValue('name', v)}
              error={form.formState.errors.name?.message}
            />
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={form.watch('status')}
              onChange={(v) => form.setValue('status', v as ProjectStatus)}
              options={[
                { value: 'planning', label: 'Planning', variant: 'secondary' },
                { value: 'active', label: 'Active', variant: 'default' },
                { value: 'on_hold', label: 'On Hold', variant: 'outline' },
                { value: 'completed', label: 'Completed', variant: 'default' },
                { value: 'cancelled', label: 'Cancelled', variant: 'secondary' },
              ]}
            />
            <ViewEditField
              type="badge"
              label="Health"
              isEditing={isEditing}
              value={form.watch('health')}
              onChange={(v) => form.setValue('health', v as ProjectHealth)}
              options={[
                { value: 'on_track', label: 'On Track', variant: 'default' },
                { value: 'at_risk', label: 'At Risk', variant: 'outline' },
                { value: 'delayed', label: 'Delayed', variant: 'secondary' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Building2 className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="phases" className="gap-2">
            <Layers className="h-4 w-4" />
            Phases
            {project.phases && project.phases.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {project.phases.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sets" className="gap-2">
            <Layers className="h-4 w-4" />
            Sets
            {projectSets && projectSets.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projectSets.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Requirements
            {projectRequirements && projectRequirements.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projectRequirements.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pitches" className="gap-2">
            <Presentation className="h-4 w-4" />
            Pitches
            {projectPitches && projectPitches.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projectPitches.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="status-updates" className="gap-2">
            <Calendar className="h-4 w-4" />
            Status Updates
          </TabsTrigger>
          <TabsTrigger value="discussions" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Discussions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phases" className="mt-6">
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
            <DraggablePhasesTable
              projectId={project.id}
              phases={project.phases || []}
              expandedPhases={expandedPhases}
              togglePhase={togglePhase}
              expandedSets={expandedSets}
              toggleSet={toggleSet}
              openCreateModal={openCreateModal}
            />
          )}
        </TabsContent>

        {/* Sets Tab - Flat view of all sets using dedicated query */}
        <TabsContent value="sets" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              onClick={() => openCreateModal('set', { project_id: project.id })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Set
            </Button>
          </div>
          {setsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !projectSets || projectSets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sets yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('set', { project_id: project.id })}
                >
                  Create First Set
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectSets.map((set) => (
                      <TableRow
                        key={set.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetailPanel('set', set.id)}
                        onDoubleClick={() => navigate(`/sets/${set.id}`)}
                      >
                        <TableCell className="font-medium">{set.name}</TableCell>
                        <TableCell>{set.project_phases?.name || '—'}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(set.status)} variant="outline">
                            {set.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            set.urgency === 'high' && set.importance === 'high'
                              ? 'border-red-500 text-red-700'
                              : ''
                          }>
                            U:{set.urgency[0].toUpperCase()} I:{set.importance[0].toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={set.completion_percentage} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{set.completion_percentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetailPanel('set', set.id)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openDetailPanel('set', set.id)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Details Tab - Organized sections */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Progress Section - moved from header */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Progress
              </h3>
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Completion</p>
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
              </div>
            </CardContent>
          </Card>

          {/* Project Info Section - Simplified (no Code, no Client) */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Project Information
              </h3>
              <ViewEditField
                type="textarea"
                label="Description"
                isEditing={isEditing}
                value={form.watch('description') || ''}
                onChange={(v) => form.setValue('description', v)}
                placeholder="Project description..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Schedule Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Schedule
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <ViewEditField
                  type="date"
                  label="Expected Start"
                  isEditing={isEditing}
                  value={form.watch('expected_start_date') || ''}
                  onChange={(v) => form.setValue('expected_start_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Expected End"
                  isEditing={isEditing}
                  value={form.watch('expected_end_date') || ''}
                  onChange={(v) => form.setValue('expected_end_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Actual Start"
                  isEditing={isEditing}
                  value={form.watch('actual_start_date') || ''}
                  onChange={(v) => form.setValue('actual_start_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Actual End"
                  isEditing={isEditing}
                  value={form.watch('actual_end_date') || ''}
                  onChange={(v) => form.setValue('actual_end_date', v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Team Section - Editable dropdowns in Edit Mode */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Team
              </h3>
              <div className="grid grid-cols-3 gap-6">
                {/* Lead */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Lead</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('lead_id') || ''}
                      onValueChange={(value) => form.setValue('lead_id', value || '')}
                      placeholder="Select lead..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : project.lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {project.lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{project.lead.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>

                {/* Secondary Lead */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Secondary Lead</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('secondary_lead_id') || ''}
                      onValueChange={(value) => form.setValue('secondary_lead_id', value || '')}
                      placeholder="Select secondary lead..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : project.secondary_lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {project.secondary_lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{project.secondary_lead.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>

                {/* Project Manager */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Project Manager</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('pm_id') || ''}
                      onValueChange={(value) => form.setValue('pm_id', value || '')}
                      placeholder="Select PM..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : project.pm ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {project.pm.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{project.pm.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={project.created_at}
                  created_by={project.created_by}
                  updated_at={project.updated_at}
                  updated_by={project.updated_by}
                  creator={project.creator}
                  updater={project.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requirements Tab */}
        <TabsContent value="requirements" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              onClick={() => openCreateModal('requirement', {
                client_id: project.clients?.id,
                project_id: project.id,
              })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Requirement
            </Button>
          </div>
          {requirementsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !projectRequirements || projectRequirements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No requirements yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('requirement', {
                    client_id: project.clients?.id,
                    project_id: project.id,
                  })}
                >
                  Add First Requirement
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectRequirements.map((req) => (
                      <TableRow
                        key={req.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/requirements/${req.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {req.title}
                            {req.display_id && (
                              <Badge variant="outline" className="font-mono text-xs">
                                #{req.display_id}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/sets/${req.set_id}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {req.sets?.name || '—'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{req.requirement_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(req.status)} variant="outline">
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              req.urgency === 'high' && req.importance === 'high'
                                ? 'border-red-500 text-red-700'
                                : ''
                            }
                          >
                            U:{req.urgency[0].toUpperCase()} I:{req.importance[0].toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {req.assigned_to?.full_name || '—'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/requirements/${req.id}`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/requirements/${req.id}?edit=true`)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pitches Tab */}
        <TabsContent value="pitches" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('pitch' as any, { project_id: projectId })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Pitch
            </Button>
          </div>
          {pitchesLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : !projectPitches || projectPitches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Presentation className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pitches yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create sets to add pitches
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectPitches.map((pitch) => (
                      <TableRow
                        key={pitch.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/pitches/${pitch.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {pitch.name}
                            {pitch.pitch_id_display && (
                              <Badge variant="outline" className="font-mono text-xs">
                                {pitch.pitch_id_display}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/sets/${pitch.set_id}`}
                            className="hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Layers className="h-3 w-3 text-muted-foreground" />
                            {pitch.sets?.name || '—'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(pitch.status)} variant="outline">
                            {pitch.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pitch.lead?.full_name || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pitch.completion_percentage} className="h-2 w-16" />
                            <span className="text-xs text-muted-foreground">
                              {pitch.completion_percentage}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/pitches/${pitch.id}`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentUpload
            entityType="project"
            entityId={projectId!}
            title="Project Documents"
            description="Upload and manage files for this project"
            maxHeight="500px"
            allowMultiple
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <NotesPanel
            entityType="project"
            entityId={projectId!}
            title="Project Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        <TabsContent value="status-updates" className="mt-6">
          <StatusUpdatesTimeline
            entityType="project"
            entityId={projectId!}
            canPost={true}
          />
        </TabsContent>

        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="project"
            entityId={projectId!}
            title="Project Discussions"
            description="Collaborate on project matters"
            maxHeight="600px"
          />
        </TabsContent>
      </Tabs>

      {/* Save as Template Dialog */}
      <SaveAsTemplateDialog
        projectId={project.id}
        projectName={project.name}
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
      />
    </div>
  )
}
