import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRequirement, useRequirementMutations } from '@/hooks/useRequirements'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { usePhasesByProject } from '@/hooks/usePhases'
import { useSets } from '@/hooks/useSets'
import { usePitchesBySet } from '@/hooks/usePitches'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  CheckSquare,
  FileText,
  MessageSquare,
  Building2,
  FolderKanban,
  Layers,
  Edit,
  X,
  Save,
  Loader2,
  Calendar,
  Users,
  Clock,
  Presentation,
} from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatDate, URGENCY_OPTIONS, IMPORTANCE_OPTIONS, calculateEisenhowerPriority, getPriorityLabel, getPriorityColor } from '@/lib/utils'
import { computeRequirementStatus, computeKeyDueDate, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DiscussionsPanel, DocumentsTab, NotesPanel } from '@/components/shared'
import type {
  RequirementType,
  ReviewStatus,
  UrgencyLevel,
  ImportanceLevel,
} from '@/types/database'

const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'open_item', label: 'Open Item' },
  { value: 'technical', label: 'Technical' },
  { value: 'support', label: 'Support' },
  { value: 'internal_deliverable', label: 'Internal Deliverable' },
  { value: 'client_deliverable', label: 'Client Deliverable' },
]

const REVIEW_STATUS_OPTIONS = [
  { value: 'not_required', label: 'Not Required' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

// Requirement form schema - status is now computed and read-only
const requirementFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  // Parent hierarchy - all editable
  client_id: z.string().min(1, 'Client is required'),
  project_id: z.string().optional(), // For filtering phases/sets
  phase_id: z.string().optional(), // For filtering sets
  set_id: z.string().optional(), // Parent set
  pitch_id: z.string().optional(), // Optional pitch grouping
  // Status is computed from dates, not editable
  requirement_type: z.enum(['task', 'open_item', 'technical', 'support', 'internal_deliverable', 'client_deliverable']),
  is_task: z.boolean(), // When true, appears in Global Tasks view
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  requires_document: z.boolean(),
  requires_review: z.boolean(),
  review_status: z.enum(['not_required', 'pending', 'in_review', 'approved', 'rejected']),
  assigned_to_id: z.string().optional(),
  reviewer_id: z.string().optional(),
  // Date fields: expected_due_date, actual_due_date, completed_date (old fields removed)
  expected_due_date: z.string().optional(),
  actual_due_date: z.string().optional(),
  completed_date: z.string().optional(),
  estimated_hours: z.number().optional(),
  actual_hours: z.number().optional(),
  // Order field for manual sorting
  requirement_order: z.number().optional(),
})

type RequirementFormValues = z.infer<typeof requirementFormSchema>

export function RequirementDetailPage() {
  const { requirementId } = useParams<{ requirementId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: requirement, isLoading } = useRequirement(requirementId!)
  const { data: clients } = useClients()
  const { data: allProjects } = useProjects()
  const { data: allSets } = useSets()
  const { data: tenantUsers } = useTenantUsers()
  const { updateRequirement } = useRequirementMutations()

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Requirement form - status is computed and not editable
  const form = useForm<RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: {
      title: requirement?.title || '',
      description: requirement?.description || '',
      client_id: requirement?.client_id || '',
      project_id: requirement?.sets?.project_id || '',
      phase_id: requirement?.sets?.phase_id || '',
      set_id: requirement?.set_id || '',
      pitch_id: requirement?.pitch_id || '',
      requirement_type: requirement?.requirement_type || 'task',
      is_task: requirement?.is_task || false,
      urgency: requirement?.urgency || 'medium',
      importance: requirement?.importance || 'medium',
      requires_document: requirement?.requires_document || false,
      requires_review: requirement?.requires_review || false,
      review_status: requirement?.review_status || 'not_required',
      assigned_to_id: requirement?.assigned_to_id || '',
      reviewer_id: requirement?.reviewer_id || '',
      expected_due_date: requirement?.expected_due_date?.split('T')[0] || '',
      actual_due_date: requirement?.actual_due_date?.split('T')[0] || '',
      completed_date: requirement?.completed_date?.split('T')[0] || '',
      estimated_hours: requirement?.estimated_hours || undefined,
      actual_hours: requirement?.actual_hours || undefined,
      requirement_order: requirement?.requirement_order ?? undefined,
    },
  })

  // Watch parent fields for cascading dropdown filtering
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
  const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })
  const selectedPhaseId = useWatch({ control: form.control, name: 'phase_id' })
  const selectedSetId = useWatch({ control: form.control, name: 'set_id' })

  // Fetch phases for the selected project
  const { data: projectPhases } = usePhasesByProject(selectedProjectId || '')

  // Fetch pitches for the selected set
  const { data: setPitches } = usePitchesBySet(selectedSetId || '')

  // Build client options for dropdown
  const clientOptions = useMemo(() =>
    clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Build project options
  const projectOptions = useMemo(() =>
    filteredProjects.map((p) => ({
      value: p.id,
      label: p.name,
      description: p.project_code,
    })),
    [filteredProjects]
  )

  // Build phase options for selected project
  const phaseOptions = useMemo(() =>
    projectPhases?.map((p) => ({
      value: p.id,
      label: p.name,
      description: `Order: ${p.phase_order}`,
    })) || [],
    [projectPhases]
  )

  // Filter sets by selected client/project/phase (cascading)
  const filteredSets = useMemo(() => {
    if (!allSets) return []
    let filtered = allSets

    // Filter by client
    if (selectedClientId) {
      filtered = filtered.filter((s) =>
        s.client_id === selectedClientId ||
        s.projects?.client_id === selectedClientId
      )
    }

    // Filter by project if selected
    if (selectedProjectId) {
      filtered = filtered.filter((s) => s.project_id === selectedProjectId)
    }

    // Filter by phase if selected
    if (selectedPhaseId) {
      filtered = filtered.filter((s) => s.phase_id === selectedPhaseId)
    }

    return filtered
  }, [allSets, selectedClientId, selectedProjectId, selectedPhaseId])

  // Build set options
  const setOptions = useMemo(() =>
    filteredSets.map((s) => ({
      value: s.id,
      label: s.name,
      description: s.projects?.name || 'No project',
    })),
    [filteredSets]
  )

  // Build pitch options for selected set
  const pitchOptions = useMemo(() =>
    setPitches?.map((p) => ({
      value: p.id,
      label: p.name,
    })) || [],
    [setPitches]
  )

  // Watch date fields for real-time reactive status calculation
  const watchedActualDueDate = useWatch({ control: form.control, name: 'actual_due_date' })
  const watchedExpectedDueDate = useWatch({ control: form.control, name: 'expected_due_date' })
  const watchedCompletedDate = useWatch({ control: form.control, name: 'completed_date' })

  // Calculate real-time status based on current form values (reactive before save)
  // ON_CHANGE: This fires whenever date fields change in edit mode
  // Uses centralized computeRequirementStatus for BOTH view and edit modes
  const reactiveStatus = useMemo(() => {
    if (isEditing) {
      // EDIT MODE: Compute from form values for immediate feedback
      return computeRequirementStatus({
        completed_date: watchedCompletedDate || null,
        actual_due_date: watchedActualDueDate || null,
        expected_due_date: watchedExpectedDueDate || null,
        key_due_date: requirement?.key_due_date || null,
        actual_start_date: requirement?.actual_start_date || null,
        expected_start_date: requirement?.expected_start_date || null,
      })
    }
    // VIEW MODE: Compute from stored record (same function, same logic)
    // AFTER_COMMIT: Query cache refresh triggers this recomputation
    return computeRequirementStatus({
      completed_date: requirement?.completed_date || null,
      actual_due_date: requirement?.actual_due_date || null,
      expected_due_date: requirement?.expected_due_date || null,
      key_due_date: requirement?.key_due_date || null,
      actual_start_date: requirement?.actual_start_date || null,
      expected_start_date: requirement?.expected_start_date || null,
    })
  }, [
    isEditing,
    watchedCompletedDate,
    watchedActualDueDate,
    watchedExpectedDueDate,
    requirement?.completed_date,
    requirement?.actual_due_date,
    requirement?.expected_due_date,
    requirement?.key_due_date,
    requirement?.actual_start_date,
    requirement?.expected_start_date,
  ])

  // ON_CHANGE: Compute reactive key due date from form values in edit mode
  const reactiveKeyDueDate = useMemo(() => {
    if (isEditing) {
      return computeKeyDueDate({
        actual_due_date: watchedActualDueDate || null,
        expected_due_date: watchedExpectedDueDate || null,
      })
    }
    return computeKeyDueDate({
      actual_due_date: requirement?.actual_due_date || null,
      expected_due_date: requirement?.expected_due_date || null,
    })
  }, [isEditing, watchedActualDueDate, watchedExpectedDueDate, requirement?.actual_due_date, requirement?.expected_due_date])

  // Reset form when requirement data loads - status is computed
  useEffect(() => {
    if (requirement && !isEditing) {
      form.reset({
        title: requirement.title,
        description: requirement.description || '',
        client_id: requirement.client_id || '',
        project_id: requirement.sets?.project_id || '',
        phase_id: requirement.sets?.phase_id || '',
        set_id: requirement.set_id || '',
        pitch_id: requirement.pitch_id || '',
        requirement_type: requirement.requirement_type,
        is_task: requirement.is_task || false,
        urgency: requirement.urgency,
        importance: requirement.importance,
        requires_document: requirement.requires_document,
        requires_review: requirement.requires_review,
        review_status: requirement.review_status,
        assigned_to_id: requirement.assigned_to_id || '',
        reviewer_id: requirement.reviewer_id || '',
        expected_due_date: requirement.expected_due_date?.split('T')[0] || '',
        actual_due_date: requirement.actual_due_date?.split('T')[0] || '',
        completed_date: requirement.completed_date?.split('T')[0] || '',
        estimated_hours: requirement.estimated_hours || undefined,
        actual_hours: requirement.actual_hours || undefined,
        requirement_order: requirement.requirement_order ?? undefined,
      })
    }
  }, [requirement?.id, requirement?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && requirement && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, requirement])

  // BEFORE_COMMIT: Supabase DATE columns reject empty strings silently.
  // Must convert '' to null so the DB column is actually cleared.
  // Type assertion needed because mutation types expect undefined, but Supabase needs null.
  const toNullableDate = (val: string | undefined | null): string | undefined =>
    val?.trim() ? val.trim() : (null as unknown as undefined)

  const handleSaveRequirement = async (data: RequirementFormValues) => {
    if (!requirementId) return
    setIsSaving(true)
    try {
      // Status is computed from dates, not editable
      await updateRequirement.mutateAsync({
        id: requirementId,
        title: data.title,
        description: data.description,
        client_id: data.client_id,
        set_id: data.set_id || undefined,
        pitch_id: data.pitch_id || undefined,
        requirement_type: data.requirement_type as RequirementType,
        is_task: data.is_task,
        urgency: data.urgency as UrgencyLevel,
        importance: data.importance as ImportanceLevel,
        requires_document: data.requires_document,
        requires_review: data.requires_review,
        review_status: data.review_status as ReviewStatus,
        assigned_to_id: data.assigned_to_id || undefined,
        reviewer_id: data.reviewer_id || undefined,
        expected_due_date: toNullableDate(data.expected_due_date),
        actual_due_date: toNullableDate(data.actual_due_date),
        completed_date: toNullableDate(data.completed_date),
        estimated_hours: data.estimated_hours,
        actual_hours: data.actual_hours,
        requirement_order: data.requirement_order,
      })
      // AFTER_COMMIT: Do NOT reset form here - let the useEffect that watches
      // record?.updated_at handle form reset when fresh data arrives from query cache
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      title: requirement?.title || '',
      description: requirement?.description || '',
      client_id: requirement?.client_id || '',
      project_id: requirement?.sets?.project_id || '',
      phase_id: requirement?.sets?.phase_id || '',
      set_id: requirement?.set_id || '',
      pitch_id: requirement?.pitch_id || '',
      requirement_type: requirement?.requirement_type || 'task',
      is_task: requirement?.is_task || false,
      urgency: requirement?.urgency || 'medium',
      importance: requirement?.importance || 'medium',
      requires_document: requirement?.requires_document || false,
      requires_review: requirement?.requires_review || false,
      review_status: requirement?.review_status || 'not_required',
      assigned_to_id: requirement?.assigned_to_id || '',
      reviewer_id: requirement?.reviewer_id || '',
      expected_due_date: requirement?.expected_due_date?.split('T')[0] || '',
      actual_due_date: requirement?.actual_due_date?.split('T')[0] || '',
      completed_date: requirement?.completed_date?.split('T')[0] || '',
      estimated_hours: requirement?.estimated_hours || undefined,
      actual_hours: requirement?.actual_hours || undefined,
      requirement_order: requirement?.requirement_order ?? undefined,
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

  if (!requirement) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Requirement not found</p>
        <Link to="/requirements">
          <Button variant="link">Back to Requirements</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs: Client > Project > Phase > Set > Pitch > Requirement (hierarchy order) */}
      <Breadcrumbs
        items={(() => {
          const items: { label: string; href?: string; displayId?: number | string }[] = []

          // 1. Client (use requirement's client_id directly)
          const clientName = clients?.find((c) => c.id === requirement.client_id)?.name || 'Client'
          items.push({
            label: clientName,
            href: requirement.client_id ? `/clients/${requirement.client_id}` : '/clients',
          })

          // 2. Project (if exists via set)
          if (requirement.sets?.project_id && requirement.sets?.projects?.name) {
            items.push({
              label: requirement.sets.projects.name,
              href: `/projects/${requirement.sets.project_id}`,
            })
          }

          // 3. Phase (if exists via set)
          if (requirement.sets?.phase_id && requirement.sets?.project_phases?.name) {
            items.push({
              label: requirement.sets.project_phases.name,
              href: `/phases/${requirement.sets.phase_id}`,
            })
          }

          // 4. Set (if exists)
          if (requirement.set_id && requirement.sets?.name) {
            items.push({
              label: requirement.sets.name,
              href: `/sets/${requirement.set_id}`,
            })
          }

          // 5. Pitch (if exists)
          if (requirement.pitch_id && requirement.pitches?.name) {
            items.push({
              label: requirement.pitches.name,
              href: `/pitches/${requirement.pitch_id}`,
            })
          }

          // 6. Requirement (current item)
          items.push({
            label: requirement.title,
            displayId: requirement.display_id,
          })

          return items
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
              {isEditing ? form.watch('title') : requirement.title}
              {requirement.display_id && (
                <span className="text-muted-foreground"> | ID: {requirement.display_id}</span>
              )}
            </h1>
            <Badge className={getStatusColor(reactiveStatus)}>
              {getStatusLabel(reactiveStatus)}
            </Badge>
            <Badge variant="outline">{requirement.requirement_type}</Badge>
          </div>
          <p className="text-muted-foreground">
            {requirement.sets?.name}
            {requirement.sets?.projects && ` • ${requirement.sets.projects.name}`}
          </p>
        </div>
      </div>

      {/* Requirement Info Card - Key fields only */}
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
                  onClick={form.handleSubmit(handleSaveRequirement)}
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

          {/* Header fields: Title, Type, Status only */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ViewEditField
              type="text"
              label="Title"
              required
              isEditing={isEditing}
              value={form.watch('title')}
              onChange={(v) => form.setValue('title', v)}
              error={form.formState.errors.title?.message}
            />
            <ViewEditField
              type="select"
              label="Type"
              isEditing={isEditing}
              value={form.watch('requirement_type')}
              onChange={(v) => form.setValue('requirement_type', v as RequirementType)}
              options={REQUIREMENT_TYPE_OPTIONS}
            />
            <ViewEditField
              type="switch"
              label="Mark as Task"
              isEditing={isEditing}
              value={form.watch('is_task')}
              onChange={(v) => form.setValue('is_task', v)}
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
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Details
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
        </TabsList>

        {/* Details Tab - Organized sections */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Parent Info Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-muted-foreground" />
                Requirement Information
              </h3>
              {/* Parent Hierarchy: Client → Project → Phase → Set → Pitch (all editable) */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                {/* 1. Client - Editable */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Client *</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={clientOptions}
                      value={form.watch('client_id')}
                      onValueChange={(value) => {
                        form.setValue('client_id', value || '')
                        // Reset dependent fields when client changes
                        const currentProject = form.getValues('project_id')
                        if (currentProject && value) {
                          const projectBelongsToClient = allProjects?.find(
                            (p) => p.id === currentProject && p.client_id === value
                          )
                          if (!projectBelongsToClient) {
                            form.setValue('project_id', '')
                            form.setValue('phase_id', '')
                          }
                        }
                        // Reset set if it doesn't belong to new client
                        const currentSet = form.getValues('set_id')
                        if (currentSet && value) {
                          const setBelongsToClient = allSets?.find(
                            (s) => s.id === currentSet && (s.client_id === value || s.projects?.client_id === value)
                          )
                          if (!setBelongsToClient) {
                            form.setValue('set_id', '')
                            form.setValue('pitch_id', '')
                          }
                        }
                      }}
                      placeholder="Select client..."
                      searchPlaceholder="Search clients..."
                      emptyMessage="No clients found."
                    />
                  ) : (
                    <Link
                      to={`/clients/${requirement.client_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Building2 className="h-3 w-3" />
                      {clients?.find((c) => c.id === requirement.client_id)?.name || '—'}
                    </Link>
                  )}
                </div>
                {/* 2. Project - Editable (filters sets) */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Project</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={projectOptions}
                      value={form.watch('project_id') || ''}
                      onValueChange={(value) => {
                        form.setValue('project_id', value || '')
                        // Reset phase when project changes
                        form.setValue('phase_id', '')
                        // Reset set if it doesn't belong to new project
                        const currentSet = form.getValues('set_id')
                        if (currentSet && value) {
                          const setBelongsToProject = allSets?.find(
                            (s) => s.id === currentSet && s.project_id === value
                          )
                          if (!setBelongsToProject) {
                            form.setValue('set_id', '')
                            form.setValue('pitch_id', '')
                          }
                        }
                      }}
                      placeholder="Select project..."
                      searchPlaceholder="Search projects..."
                      emptyMessage={selectedClientId ? "No projects found." : "Select a client first."}
                      clearable
                    />
                  ) : requirement.sets?.project_id ? (
                    <Link
                      to={`/projects/${requirement.sets.project_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <FolderKanban className="h-3 w-3" />
                      {requirement.sets?.projects?.name || '—'}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* 3. Phase - Editable (filters sets) */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Phase</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={phaseOptions}
                      value={form.watch('phase_id') || ''}
                      onValueChange={(value) => {
                        form.setValue('phase_id', value || '')
                        // Reset set if it doesn't belong to new phase
                        const currentSet = form.getValues('set_id')
                        if (currentSet && value) {
                          const setBelongsToPhase = allSets?.find(
                            (s) => s.id === currentSet && s.phase_id === value
                          )
                          if (!setBelongsToPhase) {
                            form.setValue('set_id', '')
                            form.setValue('pitch_id', '')
                          }
                        }
                      }}
                      placeholder="Select phase..."
                      searchPlaceholder="Search phases..."
                      emptyMessage={selectedProjectId ? "No phases found." : "Select a project first."}
                      clearable
                      disabled={!selectedProjectId}
                    />
                  ) : requirement.sets?.phase_id ? (
                    <Link
                      to={`/phases/${requirement.sets.phase_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Calendar className="h-3 w-3" />
                      {requirement.sets?.project_phases?.name || '—'}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* 4. Set - Editable */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Set</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={setOptions}
                      value={form.watch('set_id') || ''}
                      onValueChange={(value) => {
                        form.setValue('set_id', value || '')
                        // Reset pitch when set changes
                        form.setValue('pitch_id', '')
                      }}
                      placeholder="Select set..."
                      searchPlaceholder="Search sets..."
                      emptyMessage={selectedClientId ? "No sets found." : "Select a client first."}
                      clearable
                    />
                  ) : requirement.set_id ? (
                    <Link
                      to={`/sets/${requirement.set_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Layers className="h-3 w-3" />
                      {requirement.sets?.name || '—'}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* 5. Pitch - Editable (if set is selected) */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Pitch</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={pitchOptions}
                      value={form.watch('pitch_id') || ''}
                      onValueChange={(value) => form.setValue('pitch_id', value || '')}
                      placeholder="Select pitch..."
                      searchPlaceholder="Search pitches..."
                      emptyMessage={selectedSetId ? "No pitches found." : "Select a set first."}
                      clearable
                      disabled={!selectedSetId}
                    />
                  ) : requirement.pitch_id && requirement.pitches ? (
                    <Link
                      to={`/pitches/${requirement.pitch_id}`}
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      <Presentation className="h-3 w-3" />
                      {requirement.pitches.name || '—'}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                {/* Order */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Order</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('requirement_order') ?? ''}
                      onChange={(e) => form.setValue('requirement_order', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                  ) : (
                    <p className="font-medium">{requirement.requirement_order ?? '—'}</p>
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
                  placeholder="Requirement description..."
                  rows={3}
                />
              </div>
              {/* Priority fields - Urgency and Importance */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4 pt-4 border-t">
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

          {/* Schedule Section - shows only expected_due_date, actual_due_date, completed_date */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Schedule
              </h3>
              {/* Key Due Date Display - Computed from actual/expected dates, reactive in edit mode */}
              <div className="mb-4 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Key Due Date</p>
                    <p className="text-lg font-semibold">{reactiveKeyDueDate ? formatDate(reactiveKeyDueDate.toISOString()) : '—'}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Auto-calculated from actual or expected dates
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <ViewEditField
                  type="date"
                  label="Expected Due Date"
                  isEditing={isEditing}
                  value={form.watch('expected_due_date') || ''}
                  onChange={(v) => form.setValue('expected_due_date', v)}
                />
                <ViewEditField
                  type="date"
                  label="Actual Due Date"
                  isEditing={isEditing}
                  value={form.watch('actual_due_date') || ''}
                  onChange={(v) => form.setValue('actual_due_date', v)}
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

          {/* Time Tracking Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Time Tracking
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Estimated Hours</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('estimated_hours') || ''}
                      onChange={(e) => form.setValue('estimated_hours', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  ) : (
                    <p>{requirement.estimated_hours || '—'}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Actual Hours</p>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={form.watch('actual_hours') || ''}
                      onChange={(e) => form.setValue('actual_hours', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                    />
                  ) : (
                    <p>{requirement.actual_hours || '—'}</p>
                  )}
                </div>
                {requirement.completed_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Completed At</p>
                    <p>{formatDate(requirement.completed_at)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Assignment & Review Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Assignment & Review
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <ViewEditField
                  type="select"
                  label="Assigned To"
                  isEditing={isEditing}
                  value={form.watch('assigned_to_id') || ''}
                  onChange={(v) => form.setValue('assigned_to_id', v)}
                  options={tenantUsers?.filter(u => u.user_profiles?.id).map((u) => ({
                    value: u.user_profiles!.id,
                    label: u.user_profiles!.full_name || 'Unknown User',
                  })) || []}
                  placeholder="Select assignee"
                />
                <ViewEditField
                  type="switch"
                  label="Requires Document"
                  isEditing={isEditing}
                  value={form.watch('requires_document')}
                  onChange={(v) => form.setValue('requires_document', v)}
                  description="Document upload required"
                />
                <ViewEditField
                  type="switch"
                  label="Requires Review"
                  isEditing={isEditing}
                  value={form.watch('requires_review')}
                  onChange={(v) => form.setValue('requires_review', v)}
                  description="Review required before completion"
                />
                {form.watch('requires_review') && (
                  <>
                    <ViewEditField
                      type="select"
                      label="Reviewer"
                      isEditing={isEditing}
                      value={form.watch('reviewer_id') || ''}
                      onChange={(v) => form.setValue('reviewer_id', v)}
                      options={tenantUsers?.filter(u => u.user_profiles?.id).map((u) => ({
                        value: u.user_profiles!.id,
                        label: u.user_profiles!.full_name || 'Unknown User',
                      })) || []}
                      placeholder="Select reviewer"
                    />
                    <ViewEditField
                      type="select"
                      label="Review Status"
                      isEditing={isEditing}
                      value={form.watch('review_status')}
                      onChange={(v) => form.setValue('review_status', v as ReviewStatus)}
                      options={REVIEW_STATUS_OPTIONS}
                    />
                  </>
                )}
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={requirement.created_at}
                  created_by={requirement.created_by}
                  updated_at={requirement.updated_at}
                  updated_by={requirement.updated_by}
                  creator={requirement.creator}
                  updater={requirement.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab
            entityType="requirement"
            entityId={requirementId!}
            requirementId={requirementId}
            pitchId={requirement?.pitch_id}
            setId={requirement?.set_id}
            phaseId={requirement?.sets?.phase_id}
            projectId={requirement?.sets?.project_id}
            clientId={requirement?.client_id}
            title="Requirement Documents"
            parentContext={{
              clientName: clients?.find((c) => c.id === requirement?.client_id)?.name,
              projectName: requirement?.sets?.projects?.name,
              phaseName: requirement?.sets?.project_phases?.name,
              setName: requirement?.sets?.name,
              pitchName: requirement?.pitches?.name,
              requirementName: requirement?.title,
            }}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <NotesPanel
            entityType="requirement"
            entityId={requirementId!}
            title="Requirement Notes"
            description="Add notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="requirement"
            entityId={requirementId!}
            title="Requirement Discussions"
            description="Discuss requirement details"
            maxHeight="600px"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
