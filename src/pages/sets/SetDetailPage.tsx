import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSet, useSetMutations } from '@/hooks/useSets'
import { useRequirementsBySet } from '@/hooks/useRequirements'
import { usePitchesBySet } from '@/hooks/usePitches'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { usePhasesByProject } from '@/hooks/usePhases'
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
  FolderKanban,
  Edit,
  X,
  Save,
  Loader2,
  MoreVertical,
  ExternalLink,
  Calendar,
  Users,
  Wallet,
  Presentation,
} from 'lucide-react'
import { formatDate, URGENCY_OPTIONS, IMPORTANCE_OPTIONS, calculateEisenhowerPriority, getPriorityLabel, getPriorityColor } from '@/lib/utils'
import { computeDisplayStatus, computeKeyStartDate, computeKeyEndDate, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel, DiscussionsPanel, RequirementsTabbedPanel } from '@/components/shared'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { UrgencyLevel, ImportanceLevel } from '@/types/database'

// Set form schema - status removed since it's now computed/read-only
const setFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  client_id: z.string().min(1, 'Client is required'),
  project_id: z.string().optional(),
  phase_id: z.string().optional(), // Phase within the project
  // Status is now computed and read-only - removed from form
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  // Completion tracking - sets completed_date to mark as "Completed"
  completed_date: z.string().optional(),
  // Team fields - editable in detail page
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  pm_id: z.string().optional(),
  // Budget fields
  budget_days: z.number().optional(),
  budget_hours: z.number().optional(),
  // Order field for manual sorting
  set_order: z.number().optional(),
})

type SetFormValues = z.infer<typeof setFormSchema>

export function SetDetailPage() {
  const { setId } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: set, isLoading } = useSet(setId!)
  const { data: requirements, isLoading: requirementsLoading } = useRequirementsBySet(setId!)
  const { data: pitches, isLoading: pitchesLoading } = usePitchesBySet(setId!)
  const { data: clients } = useClients()
  const { data: allProjects } = useProjects()
  const { data: users } = useTenantUsers()
  const { updateSet } = useSetMutations()
  const { openCreateModal } = useUIStore()

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Set form - status is computed and not editable
  const form = useForm<SetFormValues>({
    resolver: zodResolver(setFormSchema),
    defaultValues: {
      name: set?.name || '',
      description: set?.description || '',
      client_id: set?.client_id || set?.projects?.client_id || '',
      project_id: set?.project_id || '',
      phase_id: set?.phase_id || '',
      urgency: set?.urgency || 'medium',
      importance: set?.importance || 'medium',
      expected_start_date: set?.expected_start_date?.split('T')[0] || '',
      expected_end_date: set?.expected_end_date?.split('T')[0] || '',
      actual_start_date: set?.actual_start_date?.split('T')[0] || '',
      actual_end_date: set?.actual_end_date?.split('T')[0] || '',
      completed_date: set?.completion_date?.split('T')[0] || '',
      lead_id: set?.lead_id || '',
      secondary_lead_id: set?.secondary_lead_id || '',
      pm_id: set?.pm_id || '',
      budget_days: set?.budget_days ?? undefined,
      budget_hours: set?.budget_hours ?? undefined,
      set_order: set?.set_order ?? undefined,
    },
  })

  // Watch client_id and project_id for cascading filters
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
  const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })

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
      // Note: Sets use completion_date (not completed_date)
      return computeDisplayStatus({
        completion_date: watchedCompletedDate || null,
        actual_start_date: watchedActualStartDate || null,
        expected_start_date: watchedExpectedStartDate || null,
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
        key_start_date: set?.key_start_date || null,
        key_end_date: set?.key_end_date || null,
      })
    }
    // VIEW MODE: Compute from stored record (same function, same logic)
    // AFTER_COMMIT: Query cache refresh triggers this recomputation
    return computeDisplayStatus({
      completion_date: set?.completion_date || null,
      actual_start_date: set?.actual_start_date || null,
      expected_start_date: set?.expected_start_date || null,
      actual_end_date: set?.actual_end_date || null,
      expected_end_date: set?.expected_end_date || null,
      key_start_date: set?.key_start_date || null,
      key_end_date: set?.key_end_date || null,
    })
  }, [
    isEditing,
    watchedCompletedDate,
    watchedActualStartDate,
    watchedExpectedStartDate,
    watchedActualEndDate,
    watchedExpectedEndDate,
    set?.completion_date,
    set?.actual_start_date,
    set?.expected_start_date,
    set?.actual_end_date,
    set?.expected_end_date,
    set?.key_start_date,
    set?.key_end_date,
  ])

  // ON_CHANGE: Compute reactive key dates from form values in edit mode
  const reactiveKeyStartDate = useMemo(() => {
    if (isEditing) {
      return computeKeyStartDate({
        actual_start_date: watchedActualStartDate || null,
        expected_start_date: watchedExpectedStartDate || null,
      })
    }
    return computeKeyStartDate({
      actual_start_date: set?.actual_start_date || null,
      expected_start_date: set?.expected_start_date || null,
    })
  }, [isEditing, watchedActualStartDate, watchedExpectedStartDate, set?.actual_start_date, set?.expected_start_date])

  const reactiveKeyEndDate = useMemo(() => {
    if (isEditing) {
      return computeKeyEndDate({
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
      })
    }
    return computeKeyEndDate({
      actual_end_date: set?.actual_end_date || null,
      expected_end_date: set?.expected_end_date || null,
    })
  }, [isEditing, watchedActualEndDate, watchedExpectedEndDate, set?.actual_end_date, set?.expected_end_date])

  // Fetch phases for the selected project
  const { data: projectPhases } = usePhasesByProject(selectedProjectId || '')

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Build options for selects
  const clientOptions = useMemo(() =>
    clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  const projectOptions = useMemo(() =>
    filteredProjects.map((p) => ({
      value: p.id,
      label: p.name,
      description: `${p.project_code} • ${p.clients?.name || ''}`,
    })),
    [filteredProjects]
  )

  // Phase options for the selected project
  const phaseOptions = useMemo(() =>
    projectPhases?.map((p) => ({
      value: p.id,
      label: p.name,
      description: `Order: ${p.phase_order}`,
    })) || [],
    [projectPhases]
  )

  // User options for team member dropdowns - use user_profiles.id
  const userOptions = useMemo(() =>
    users?.filter((u) => u.user_profiles?.id).map((u) => ({
      value: u.user_profiles!.id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  // Reset form when set data loads - status is computed, not in form
  useEffect(() => {
    if (set && !isEditing) {
      form.reset({
        name: set.name,
        description: set.description || '',
        client_id: set.client_id || set.projects?.client_id || '',
        project_id: set.project_id || '',
        phase_id: set.phase_id || '',
        urgency: set.urgency,
        importance: set.importance,
        expected_start_date: set.expected_start_date?.split('T')[0] || '',
        expected_end_date: set.expected_end_date?.split('T')[0] || '',
        actual_start_date: set.actual_start_date?.split('T')[0] || '',
        actual_end_date: set.actual_end_date?.split('T')[0] || '',
        completed_date: set.completion_date?.split('T')[0] || '',
        lead_id: set.lead_id || '',
        secondary_lead_id: set.secondary_lead_id || '',
        pm_id: set.pm_id || '',
        budget_days: set.budget_days ?? undefined,
        budget_hours: set.budget_hours ?? undefined,
        set_order: set.set_order ?? undefined,
      })
    }
  }, [set?.id, set?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && set && !isEditing) {
      setIsEditing(true)
      // Clear the query param after entering edit mode
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, set])

  const handleSaveSet = async (data: SetFormValues) => {
    if (!setId) return
    setIsSaving(true)
    try {
      // Status is computed from dates, not editable
      // completed_date triggers auto-fill of completed_by via database trigger
      // BEFORE_COMMIT: normalize empty date strings to null so DB column is cleared
      // Using `null` (not `undefined`) ensures Supabase updates the column to NULL
      await updateSet.mutateAsync({
        id: setId,
        name: data.name,
        description: data.description,
        client_id: data.client_id,
        project_id: data.project_id || null,
        phase_id: data.phase_id || null,
        urgency: data.urgency as UrgencyLevel,
        importance: data.importance as ImportanceLevel,
        expected_start_date: data.expected_start_date?.trim() || null,
        expected_end_date: data.expected_end_date?.trim() || null,
        actual_start_date: data.actual_start_date?.trim() || null,
        actual_end_date: data.actual_end_date?.trim() || null,
        completion_date: data.completed_date?.trim() || null, // Sets use completion_date column
        lead_id: data.lead_id || null,
        secondary_lead_id: data.secondary_lead_id || null,
        pm_id: data.pm_id || null,
        budget_days: data.budget_days,
        budget_hours: data.budget_hours,
        set_order: data.set_order,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      name: set?.name || '',
      description: set?.description || '',
      client_id: set?.client_id || set?.projects?.client_id || '',
      project_id: set?.project_id || '',
      phase_id: set?.phase_id || '',
      urgency: set?.urgency || 'medium',
      importance: set?.importance || 'medium',
      expected_start_date: set?.expected_start_date?.split('T')[0] || '',
      expected_end_date: set?.expected_end_date?.split('T')[0] || '',
      actual_start_date: set?.actual_start_date?.split('T')[0] || '',
      actual_end_date: set?.actual_end_date?.split('T')[0] || '',
      completed_date: set?.completion_date?.split('T')[0] || '',
      lead_id: set?.lead_id || '',
      secondary_lead_id: set?.secondary_lead_id || '',
      pm_id: set?.pm_id || '',
      budget_days: set?.budget_days ?? undefined,
      budget_hours: set?.budget_hours ?? undefined,
      set_order: set?.set_order ?? undefined,
    })
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!set) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Set not found</p>
        <Link to="/sets">
          <Button variant="link">Back to Sets</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs: Client > [Project] > Set */}
      {/* For client-only sets (no project), show Client > Set */}
      {/* For project-linked sets, show Client > Project > Set */}
      <Breadcrumbs
        items={(() => {
          // Get client info - either from direct link or via project
          const clientId = set.client_id || set.projects?.client_id || set.projects?.clients?.id
          const clientName = clients?.find((c) => c.id === clientId)?.name || set.projects?.clients?.name || 'Client'

          const breadcrumbItems: { label: string; href?: string; displayId?: number | string }[] = [
            {
              label: clientName,
              href: clientId ? `/clients/${clientId}` : '/clients',
            },
          ]

          // Only add project breadcrumb if set has a project
          if (set.project_id && set.projects?.name) {
            breadcrumbItems.push({
              label: set.projects.name,
              href: `/projects/${set.project_id}`,
            })
          }

          breadcrumbItems.push({ label: set.name, displayId: set.display_id })

          return breadcrumbItems
        })()}
      />

      {/* Header - Title with Name | ID format */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : set.name}
              {set.display_id && <span className="text-muted-foreground"> | ID: {set.display_id}</span>}
            </h1>
            <Badge className={getStatusColor(reactiveStatus)}>
              {getStatusLabel(reactiveStatus)}
            </Badge>
            <Badge
              variant="outline"
              className={
                set.urgency === 'high' && set.importance === 'high'
                  ? 'border-red-500 text-red-700'
                  : set.importance === 'high'
                  ? 'border-blue-500 text-blue-700'
                  : set.urgency === 'high'
                  ? 'border-amber-500 text-amber-700'
                  : ''
              }
            >
              U:{set.urgency[0].toUpperCase()} I:{set.importance[0].toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {set.projects?.name}
            {set.project_phases && ` • ${set.project_phases.name}`}
          </p>
        </div>
      </div>

      {/* Set Info Card - Key fields only */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons */}
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
                  onClick={form.handleSubmit(handleSaveSet)}
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
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>

          {/* Progress section with Key Dates - always visible */}
          <div className="space-y-3 mb-6 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Progress</p>
                <p className="text-2xl font-bold">{set.completion_percentage}%</p>
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
            <Progress value={set.completion_percentage} className="h-3" />
          </div>

          {/* Header fields: Name, Status, Urgency, Importance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ViewEditField
              type="text"
              label="Set Name"
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
              type="select"
              label="Urgency"
              isEditing={isEditing}
              value={form.watch('urgency')}
              onChange={(v) => form.setValue('urgency', v as UrgencyLevel)}
              options={URGENCY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            />
            <ViewEditField
              type="select"
              label="Importance"
              isEditing={isEditing}
              value={form.watch('importance')}
              onChange={(v) => form.setValue('importance', v as ImportanceLevel)}
              options={IMPORTANCE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            />
            {/* Priority - calculated from Urgency + Importance */}
            <div className="min-h-[52px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Priority
              </label>
              {(() => {
                const priority = calculateEisenhowerPriority(form.watch('importance'), form.watch('urgency'))
                return (
                  <div className="h-9 flex items-center">
                    <Badge className={getPriorityColor(priority)}>
                      {priority} - {getPriorityLabel(priority)}
                    </Badge>
                  </div>
                )
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Layers className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Requirements
            {requirements && requirements.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {requirements.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pitches" className="gap-2">
            <Presentation className="h-4 w-4" />
            Pitches
            {pitches && pitches.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {pitches.length}
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
          <TabsTrigger value="discussions" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Discussions
          </TabsTrigger>
        </TabsList>

        {/* Details Tab - Organized sections */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Set Info Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Layers className="h-5 w-5 text-muted-foreground" />
                Set Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Client - Editable dropdown */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Client *</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={clientOptions}
                      value={form.watch('client_id')}
                      onValueChange={(value) => {
                        form.setValue('client_id', value || '')
                        // Reset project if it doesn't belong to new client
                        const currentProject = form.getValues('project_id')
                        if (currentProject && value) {
                          const projectBelongsToClient = allProjects?.find(
                            (p) => p.id === currentProject && p.client_id === value
                          )
                          if (!projectBelongsToClient) {
                            form.setValue('project_id', '')
                          }
                        }
                      }}
                      placeholder="Select client..."
                      searchPlaceholder="Search clients..."
                      emptyMessage="No clients found."
                    />
                  ) : (
                    <Link
                      to={`/clients/${set.client_id || set.projects?.client_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Building2 className="h-3 w-3" />
                      {clients?.find((c) => c.id === (set.client_id || set.projects?.client_id))?.name || set.projects?.clients?.name || '—'}
                    </Link>
                  )}
                </div>
                {/* Project - Editable dropdown */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Project</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={projectOptions}
                      value={form.watch('project_id') || ''}
                      onValueChange={(value) => form.setValue('project_id', value || '')}
                      placeholder="Select project (optional)..."
                      searchPlaceholder="Search projects..."
                      emptyMessage="No projects found."
                      clearable
                    />
                  ) : set.project_id ? (
                    <Link
                      to={`/projects/${set.project_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <FolderKanban className="h-3 w-3" />
                      {set.projects?.name || '—'}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* Phase - Editable dropdown (only when project is selected) */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Phase</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={phaseOptions}
                      value={form.watch('phase_id') || ''}
                      onValueChange={(value) => form.setValue('phase_id', value || '')}
                      placeholder="Select phase (optional)..."
                      searchPlaceholder="Search phases..."
                      emptyMessage={selectedProjectId ? "No phases found for this project." : "Select a project first."}
                      clearable
                      disabled={!selectedProjectId}
                    />
                  ) : set.project_phases ? (
                    <Link
                      to={`/phases/${set.phase_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Calendar className="h-3 w-3" />
                      {set.project_phases.name}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completion</p>
                  <p>{set.completion_percentage}%</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Order</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('set_order') ?? ''}
                      onChange={(e) => form.setValue('set_order', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                  ) : (
                    <p className="font-medium">{set.set_order ?? '—'}</p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <ViewEditField
                  type="textarea"
                  label="Description"
                  isEditing={isEditing}
                  value={form.watch('description') || ''}
                  onChange={(v) => form.setValue('description', v)}
                  placeholder="Set description..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Schedule Section - due_date removed per UX cleanup */}
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

          {/* Budget Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                Budget
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Budget Days</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('budget_days') ?? ''}
                      onChange={(e) => form.setValue('budget_days', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                  ) : (
                    <p className="font-medium">{set.budget_days ?? '—'}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Budget Hours</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('budget_hours') ?? ''}
                      onChange={(e) => form.setValue('budget_hours', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0.00"
                      min="0"
                      step="0.25"
                    />
                  ) : (
                    <p className="font-medium">{set.budget_hours ?? '—'}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team Section - Label Above / Value Below pattern with editable dropdowns */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Team Information
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
                  ) : set.lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {set.lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{set.lead.full_name}</span>
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
                  ) : set.secondary_lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {set.secondary_lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{set.secondary_lead.full_name}</span>
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
                  ) : set.pm ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {set.pm.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{set.pm.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={set.created_at}
                  created_by={set.created_by}
                  updated_at={set.updated_at}
                  updated_by={set.updated_by}
                  creator={set.creator}
                  updater={set.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requirements Tab - Split into Open/Completed */}
        <TabsContent value="requirements" className="mt-6">
          <RequirementsTabbedPanel
            requirements={requirements}
            isLoading={requirementsLoading}
            createContext={{ set_id: set.id, client_id: set.client_id || set.projects?.client_id }}
            showSetColumn={false}
            showProjectColumn={false}
          />
        </TabsContent>

        {/* Pitches Tab */}
        <TabsContent value="pitches" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('pitch', { set_id: setId })}>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : !pitches || pitches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Presentation className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pitches yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('pitch', { set_id: setId })}
                >
                  Create First Pitch
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pitches.map((pitch) => (
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
                          <Badge className={getStatusColor(computeDisplayStatus(pitch))} variant="outline">
                            {getStatusLabel(computeDisplayStatus(pitch))}
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
            entityType="set"
            entityId={setId!}
            title="Set Documents"
            description="Upload and manage files for this set"
            maxHeight="500px"
            allowMultiple
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <NotesPanel
            entityType="set"
            entityId={setId!}
            title="Set Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="set"
            entityId={setId!}
            title="Set Discussions"
            description="Collaborate on set details"
            maxHeight="600px"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
