import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { useProjectWithHierarchy, useProjectMutations } from '@/hooks/useProjects'
import { useSetsByProject } from '@/hooks/useSets'
import { useRequirementsByProject } from '@/hooks/useRequirements'
import { usePitchesByProject } from '@/hooks/usePitches'
import { useTenantUsers } from '@/hooks/useTenant'
import { useClients } from '@/hooks/useClients'
import { useUIStore, useTenantStore } from '@/stores'
import { cascadeProjectClientId } from '@/services/api/projects'
import { toast } from '@/hooks/use-toast'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { formatDate, getHealthColor } from '@/lib/utils'
import { computeDisplayStatus, computeRequirementStatus, computeKeyStartDate, computeKeyEndDate, computeKeyDueDate, computeRequirementKeyStartDate, getStatusLabel, getStatusColor, STATUS_LABELS, STATUS_COLORS } from '@/utils/statusUtils'
import { calculateEisenhowerPriority as calcPriority, getPriorityColor as getPrioColor } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel, DiscussionsPanel, StatusUpdatesTimeline } from '@/components/shared'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SaveAsTemplateDialog } from '@/components/projects/SaveAsTemplateDialog'
import { DraggablePhasesTable } from '@/components/phases/DraggablePhasesTable'
import type { ProjectHealth } from '@/types/database'

// Project form schema - status removed since it's now computed/read-only
const projectFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  // Client is editable for parent re-assignment
  client_id: z.string().min(1, 'Client is required'),
  // Status is now computed from dates, not editable
  health: z.enum(['on_track', 'at_risk', 'delayed']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  // Completion tracking - sets completed_date to mark as "Completed"
  completed_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  pm_id: z.string().optional(),
})

type ProjectFormValues = z.infer<typeof projectFormSchema>

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: project, isLoading } = useProjectWithHierarchy(projectId!)
  const { data: projectSets, isLoading: setsLoading } = useSetsByProject(projectId!)
  const { data: projectRequirements, isLoading: requirementsLoading } = useRequirementsByProject(projectId!)
  const { data: projectPitches, isLoading: pitchesLoading } = usePitchesByProject(projectId!)
  const { updateProject, duplicateProject } = useProjectMutations()
  const { data: users } = useTenantUsers()
  const { data: clients } = useClients()
  const { openDetailPanel, openCreateModal } = useUIStore()

  // User options for team member dropdowns - use user_profiles.id (not user_id)
  const userOptions = useMemo(() =>
    users?.filter((u) => u.user_profiles?.id).map((u) => ({
      value: u.user_profiles!.id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  // Client options for client dropdown
  const clientOptions = useMemo(() =>
    clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  // Cascade dialog state for parent re-assignment
  const [cascadeDialogOpen, setCascadeDialogOpen] = useState(false)
  const [pendingSaveData, setPendingSaveData] = useState<ProjectFormValues | null>(null)
  const [parentChanges, setParentChanges] = useState<string[]>([])

  // Project form - status is computed and not editable
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name || '',
      description: project?.description || '',
      client_id: project?.client_id || '',
      health: project?.health || 'on_track',
      expected_start_date: project?.expected_start_date?.split('T')[0] || '',
      expected_end_date: project?.expected_end_date?.split('T')[0] || '',
      actual_start_date: project?.actual_start_date?.split('T')[0] || '',
      actual_end_date: project?.actual_end_date?.split('T')[0] || '',
      completed_date: project?.completed_date?.split('T')[0] || '',
      lead_id: project?.lead_id || '',
      secondary_lead_id: project?.secondary_lead_id || '',
      pm_id: project?.pm_id || '',
    },
  })

  // Watch date fields for real-time reactive status calculation
  const watchedActualStartDate = useWatch({ control: form.control, name: 'actual_start_date' })
  const watchedExpectedStartDate = useWatch({ control: form.control, name: 'expected_start_date' })
  const watchedActualEndDate = useWatch({ control: form.control, name: 'actual_end_date' })
  const watchedExpectedEndDate = useWatch({ control: form.control, name: 'expected_end_date' })
  const watchedCompletedDate = useWatch({ control: form.control, name: 'completed_date' })

  // Calculate real-time status based on current form values (reactive before save)
  // ON_CHANGE: This fires whenever date fields change in edit mode
  // Uses centralized computeDisplayStatus for BOTH view and edit modes
  const reactiveStatus = useMemo(() => {
    if (isEditing) {
      // EDIT MODE: Compute from form values for immediate feedback
      return computeDisplayStatus({
        completed_date: watchedCompletedDate || null,
        actual_start_date: watchedActualStartDate || null,
        expected_start_date: watchedExpectedStartDate || null,
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
        key_start_date: project?.key_start_date || null,
        key_end_date: project?.key_end_date || null,
      })
    }
    // VIEW MODE: Compute from stored record (same function, same logic)
    // AFTER_COMMIT: Query cache refresh triggers this recomputation
    return computeDisplayStatus({
      completed_date: project?.completed_date || null,
      actual_start_date: project?.actual_start_date || null,
      expected_start_date: project?.expected_start_date || null,
      actual_end_date: project?.actual_end_date || null,
      expected_end_date: project?.expected_end_date || null,
      key_start_date: project?.key_start_date || null,
      key_end_date: project?.key_end_date || null,
    })
  }, [
    isEditing,
    watchedCompletedDate,
    watchedActualStartDate,
    watchedExpectedStartDate,
    watchedActualEndDate,
    watchedExpectedEndDate,
    project?.completed_date,
    project?.actual_start_date,
    project?.expected_start_date,
    project?.actual_end_date,
    project?.expected_end_date,
    project?.key_start_date,
    project?.key_end_date,
  ])

  // ON_CHANGE: Compute reactive key dates from form values in edit mode
  // Uses computeKeyStartDate/computeKeyEndDate for consistent logic
  const reactiveKeyStartDate = useMemo(() => {
    if (isEditing) {
      return computeKeyStartDate({
        actual_start_date: watchedActualStartDate || null,
        expected_start_date: watchedExpectedStartDate || null,
      })
    }
    return computeKeyStartDate({
      actual_start_date: project?.actual_start_date || null,
      expected_start_date: project?.expected_start_date || null,
    })
  }, [isEditing, watchedActualStartDate, watchedExpectedStartDate, project?.actual_start_date, project?.expected_start_date])

  const reactiveKeyEndDate = useMemo(() => {
    if (isEditing) {
      return computeKeyEndDate({
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
      })
    }
    return computeKeyEndDate({
      actual_end_date: project?.actual_end_date || null,
      expected_end_date: project?.expected_end_date || null,
    })
  }, [isEditing, watchedActualEndDate, watchedExpectedEndDate, project?.actual_end_date, project?.expected_end_date])

  // Reset form when project data loads - status is computed
  useEffect(() => {
    if (project && !isEditing) {
      form.reset({
        name: project.name,
        description: project.description || '',
        client_id: project.client_id || '',
        health: project.health,
        expected_start_date: project.expected_start_date?.split('T')[0] || '',
        expected_end_date: project.expected_end_date?.split('T')[0] || '',
        actual_start_date: project.actual_start_date?.split('T')[0] || '',
        actual_end_date: project.actual_end_date?.split('T')[0] || '',
        completed_date: project.completed_date?.split('T')[0] || '',
        lead_id: project.lead_id || '',
        secondary_lead_id: project.secondary_lead_id || '',
        pm_id: project.pm_id || '',
      })
    }
  }, [project?.id, project?.updated_at, isEditing])

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

  // BEFORE_COMMIT: Supabase DATE columns reject empty strings silently.
  // Must convert '' to null so the DB column is actually cleared.
  // Type assertion needed because mutation types expect undefined, but Supabase needs null.
  const toNullableDate = (val: string | undefined | null): string | undefined =>
    val?.trim() ? val.trim() : (null as unknown as undefined)

  // Detect parent changes and show cascade dialog if needed
  const handleSaveProject = async (data: ProjectFormValues) => {
    if (!projectId) return

    // Check if client_id changed (only parent field for projects)
    const changes: string[] = []
    if (data.client_id !== project?.client_id) {
      changes.push('Client')
    }

    if (changes.length > 0) {
      // Parent changed — hold the save and show dialog
      setPendingSaveData(data)
      setParentChanges(changes)
      setCascadeDialogOpen(true)
      return
    }

    // No parent change — save normally
    await executeSave(data, false)
  }

  // Called after user answers the cascade dialog
  const handleCascadeDecision = async (cascade: boolean) => {
    setCascadeDialogOpen(false)
    if (pendingSaveData) {
      await executeSave(pendingSaveData, cascade)
      setPendingSaveData(null)
      setParentChanges([])
    }
  }

  // The actual save logic (separated so cascade dialog can call it)
  const executeSave = async (data: ProjectFormValues, cascade: boolean) => {
    if (!projectId) return
    setIsSaving(true)
    try {
      // Status is computed from dates, not editable
      // completed_date triggers auto-fill of completed_by via database trigger
      await updateProject.mutateAsync({
        id: projectId,
        name: data.name,
        description: data.description,
        client_id: data.client_id,
        health: data.health as ProjectHealth,
        expected_start_date: toNullableDate(data.expected_start_date),
        expected_end_date: toNullableDate(data.expected_end_date),
        actual_start_date: toNullableDate(data.actual_start_date),
        actual_end_date: toNullableDate(data.actual_end_date),
        completed_date: toNullableDate(data.completed_date),
        lead_id: data.lead_id || undefined,
        secondary_lead_id: data.secondary_lead_id || undefined,
        pm_id: data.pm_id || undefined,
      })

      // Cascade client_id to children if user confirmed
      if (cascade && data.client_id !== project?.client_id) {
        try {
          await cascadeProjectClientId(projectId, data.client_id)
          // Invalidate related queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['sets', 'project', projectId] })
          queryClient.invalidateQueries({ queryKey: ['requirements', 'project', projectId] })
          queryClient.invalidateQueries({ queryKey: ['sets', currentTenant?.id] })
          toast({
            title: 'Saved',
            description: 'Project and all child records updated.',
          })
        } catch (cascadeError) {
          console.error('Cascade failed:', cascadeError)
          toast({
            title: 'Partial Update',
            description: 'Project saved, but failed to update child records.',
            variant: 'destructive',
          })
        }
      } else if (cascade === false && parentChanges.length > 0) {
        toast({
          title: 'Saved',
          description: 'Project saved. Child records not changed.',
        })
      }

      // AFTER_COMMIT: Do NOT reset form here - let the useEffect that watches
      // record?.updated_at handle form reset when fresh data arrives from query cache
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      name: project?.name || '',
      description: project?.description || '',
      client_id: project?.client_id || '',
      health: project?.health || 'on_track',
      expected_start_date: project?.expected_start_date?.split('T')[0] || '',
      expected_end_date: project?.expected_end_date?.split('T')[0] || '',
      actual_start_date: project?.actual_start_date?.split('T')[0] || '',
      actual_end_date: project?.actual_end_date?.split('T')[0] || '',
      completed_date: project?.completed_date?.split('T')[0] || '',
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
            <Badge className={getStatusColor(reactiveStatus)}>
              {getStatusLabel(reactiveStatus)}
            </Badge>
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
                    <DropdownMenuItem
                      onClick={() => {
                        if (projectId && confirm('Duplicate this project?')) {
                          duplicateProject.mutate({ projectId, options: { include_children: true } })
                        }
                      }}
                    >
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
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Client {isEditing && <span className="text-red-500">*</span>}
              </p>
              {isEditing ? (
                <SearchableSelect
                  options={clientOptions}
                  value={form.watch('client_id') || ''}
                  onValueChange={(value) => form.setValue('client_id', value || '')}
                  placeholder="Select client..."
                  searchPlaceholder="Search clients..."
                  emptyMessage="No clients found."
                />
              ) : (
                <Link
                  to={`/clients/${project.clients?.id}`}
                  className="font-medium hover:underline"
                >
                  {project.clients?.name || '—'}
                </Link>
              )}
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
            {/* Status is now computed and read-only - shows reactive status during editing */}
            <div className="min-h-[52px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status <span className="text-xs normal-case">(Auto)</span>
              </label>
              <div className="h-9 flex items-center">
                <Badge className={getStatusColor(reactiveStatus)}>
                  {getStatusLabel(reactiveStatus)}
                </Badge>
              </div>
            </div>
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
          <TabsTrigger value="pitches" className="gap-2">
            <Presentation className="h-4 w-4" />
            Pitches
            {projectPitches && projectPitches.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projectPitches.length}
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
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="discussions" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Discussions
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="status-updates" className="gap-2">
            <Calendar className="h-4 w-4" />
            Status Updates
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
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectSets.map((set) => {
                      const status = computeDisplayStatus(set)
                      const priority = calcPriority(set.importance, set.urgency)
                      const keyStart = computeKeyStartDate(set)
                      const keyEnd = computeKeyEndDate(set)
                      return (
                        <TableRow
                          key={set.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetailPanel('set', set.id)}
                          onDoubleClick={() => navigate(`/sets/${set.id}`)}
                        >
                          <TableCell className="text-right tabular-nums">
                            {set.set_order ?? '—'}
                          </TableCell>
                          <TableCell className="font-medium">{set.name}</TableCell>
                          <TableCell>
                            {priority ? (
                              <Badge className={getPrioColor(priority)}>P{priority}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                          </TableCell>
                          <TableCell>
                            {set.lead?.full_name || '—'}
                          </TableCell>
                          <TableCell>
                            {keyStart ? formatDate(keyStart.toISOString()) : '—'}
                          </TableCell>
                          <TableCell>
                            {keyEnd ? formatDate(keyEnd.toISOString()) : '—'}
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
                      )
                    })}
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
                  {/* Key Dates Display - Computed from actual/expected dates, reactive in edit mode */}
                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Key Start</p>
                      <p className="font-medium">{reactiveKeyStartDate ? formatDate(reactiveKeyStartDate.toISOString()) : '—'}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Key End</p>
                      <p className="font-medium">{reactiveKeyEndDate ? formatDate(reactiveKeyEndDate.toISOString()) : '—'}</p>
                    </div>
                  </div>
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <ViewEditField
                  type="date"
                  label="Expected Start Date"
                  isEditing={isEditing}
                  value={form.watch('expected_start_date') || ''}
                  onChange={(v) => form.setValue('expected_start_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Expected Due Date"
                  isEditing={isEditing}
                  value={form.watch('expected_end_date') || ''}
                  onChange={(v) => form.setValue('expected_end_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Actual Start Date"
                  isEditing={isEditing}
                  value={form.watch('actual_start_date') || ''}
                  onChange={(v) => form.setValue('actual_start_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Actual Due Date"
                  isEditing={isEditing}
                  value={form.watch('actual_end_date') || ''}
                  onChange={(v) => form.setValue('actual_end_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Completed Date"
                  isEditing={isEditing}
                  value={form.watch('completed_date') || ''}
                  onChange={(v) => form.setValue('completed_date', v)}
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
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectRequirements.map((req) => {
                      const status = computeRequirementStatus(req)
                      const priority = calcPriority(req.importance, req.urgency)
                      const keyStart = computeRequirementKeyStartDate(req)
                      const keyEnd = computeKeyDueDate(req)
                      return (
                        <TableRow
                          key={req.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onDoubleClick={() => navigate(`/requirements/${req.id}`)}
                        >
                          <TableCell className="text-right tabular-nums">
                            {req.requirement_order ?? '—'}
                          </TableCell>
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
                            {priority ? (
                              <Badge className={getPrioColor(priority)}>P{priority}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                          </TableCell>
                          <TableCell>
                            {req.assigned_to?.full_name || '—'}
                          </TableCell>
                          <TableCell>
                            {keyStart ? formatDate(keyStart.toISOString()) : '—'}
                          </TableCell>
                          <TableCell>
                            {keyEnd ? formatDate(keyEnd.toISOString()) : '—'}
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
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pitches Tab */}
        <TabsContent value="pitches" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('pitch', { project_id: projectId })}>
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
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
                      <TableHead className="w-[60px]">Order</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Key Start</TableHead>
                      <TableHead>Key End</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectPitches.map((pitch) => {
                      const status = computeDisplayStatus(pitch)
                      const priority = calcPriority(pitch.importance, pitch.urgency)
                      const keyStart = computeKeyStartDate(pitch)
                      const keyEnd = computeKeyEndDate(pitch)
                      return (
                        <TableRow
                          key={pitch.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onDoubleClick={() => navigate(`/pitches/${pitch.id}`)}
                        >
                          <TableCell className="text-right tabular-nums">
                            {pitch.order_manual ?? '—'}
                          </TableCell>
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
                            {priority ? (
                              <Badge className={getPrioColor(priority)}>P{priority}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                          </TableCell>
                          <TableCell>
                            {pitch.lead?.full_name || '—'}
                          </TableCell>
                          <TableCell>
                            {keyStart ? formatDate(keyStart.toISOString()) : '—'}
                          </TableCell>
                          <TableCell>
                            {keyEnd ? formatDate(keyEnd.toISOString()) : '—'}
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
                      )
                    })}
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

      {/* Cascade Confirmation Dialog */}
      <AlertDialog open={cascadeDialogOpen} onOpenChange={setCascadeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Child Records?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  You changed the <strong>{parentChanges.join(' and ')}</strong> of this project.
                  Would you like to update all child records to match?
                </p>
                <p className="mt-3">
                  <strong>Yes</strong> — All sets and requirements under this project will be
                  moved to the new {parentChanges.join(' / ')}.
                </p>
                <p className="mt-2">
                  <strong>No</strong> — Only this project is updated. Child records keep their
                  current parent assignments.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleCascadeDecision(false)}>
              No, this project only
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleCascadeDecision(true)}>
              Yes, update all children
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
