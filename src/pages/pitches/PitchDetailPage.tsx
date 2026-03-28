import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePitch, usePitchMutations } from '@/hooks/usePitches'
import { useRequirementsBySet, useRequirementMutations } from '@/hooks/useRequirements'
import { useTenantUsers } from '@/hooks/useTenant'
import { useClients } from '@/hooks/useClients'
import { useProjectsByClient } from '@/hooks/useProjects'
import { useSetsByProject, useSetsByClient } from '@/hooks/useSets'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Edit,
  X,
  Save,
  Loader2,
  Presentation,
  CheckSquare,
  FileText,
  MessageSquare,
  Calendar,
  Users,
} from 'lucide-react'
import {
  formatDate,
  URGENCY_OPTIONS,
  IMPORTANCE_OPTIONS,
  calculateEisenhowerPriority,
  getPriorityLabel,
  getPriorityColor,
} from '@/lib/utils'
import { computeDisplayStatus, computeKeyStartDate, computeKeyEndDate, getStatusLabel, getStatusColor } from '@/utils/statusUtils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentsTab, NotesPanel, DiscussionsPanel, RequirementsTabbedPanel } from '@/components/shared'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { UrgencyLevel, ImportanceLevel, RequirementType } from '@/types/database'

// Pitch form schema - status is now computed and read-only
const pitchFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  // Status is computed from dates, not editable
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  // Completion tracking - sets completed_date to mark as "Completed"
  completed_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  notes: z.string().optional(),
  show_in_client_portal: z.boolean(),
  order_manual: z.number().optional(),
})

type PitchFormValues = z.infer<typeof pitchFormSchema>

// Requirement type options for dropdown
const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'open_item', label: 'Open Item' },
  { value: 'technical', label: 'Technical' },
  { value: 'support', label: 'Support' },
  { value: 'internal_deliverable', label: 'Internal Deliverable' },
  { value: 'client_deliverable', label: 'Client Deliverable' },
]

export function PitchDetailPage() {
  const { pitchId } = useParams<{ pitchId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: pitch, isLoading } = usePitch(pitchId!)
  const { data: users } = useTenantUsers()
  const { updatePitch } = usePitchMutations()
  const { createRequirement } = useRequirementMutations()

  // Get requirements for this pitch's set (filtering by pitch_id would need API update)
  const { data: setRequirements } = useRequirementsBySet(pitch?.set_id || '')

  // Filter requirements that belong to this pitch
  // pitch_id is now included in the requirements select query
  const pitchRequirements = useMemo(
    () => setRequirements?.filter((r) => r.pitch_id === pitchId) || [],
    [setRequirements, pitchId]
  )

  // Parent entity data for edit mode
  const { data: clients } = useClients()
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedSetId, setSelectedSetId] = useState<string>('')

  // Cascading data queries
  const { data: projectsForClient } = useProjectsByClient(selectedClientId)
  const { data: setsForProject } = useSetsByProject(selectedProjectId)
  const { data: setsForClient } = useSetsByClient(selectedClientId)

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [createRequirementDialogOpen, setCreateRequirementDialogOpen] = useState(false)
  const [newRequirement, setNewRequirement] = useState({
    title: '',
    description: '',
    requirement_type: 'task' as RequirementType,
  })

  const form = useForm<PitchFormValues>({
    resolver: zodResolver(pitchFormSchema),
    defaultValues: {
      name: pitch?.name || '',
      description: pitch?.description || '',
      urgency: pitch?.urgency || 'medium',
      importance: pitch?.importance || 'medium',
      expected_start_date: pitch?.expected_start_date?.split('T')[0] || '',
      expected_end_date: pitch?.expected_end_date?.split('T')[0] || '',
      actual_start_date: pitch?.actual_start_date?.split('T')[0] || '',
      actual_end_date: pitch?.actual_end_date?.split('T')[0] || '',
      completed_date: pitch?.completed_date?.split('T')[0] || '',
      lead_id: pitch?.lead_id || '',
      secondary_lead_id: pitch?.secondary_lead_id || '',
      notes: pitch?.notes || '',
      show_in_client_portal: pitch?.show_in_client_portal ?? false,
      order_manual: pitch?.order_manual ?? undefined,
    },
  })

  // User options for team member dropdowns
  const userOptions = useMemo(
    () =>
      users
        ?.filter((u) => u.user_profiles?.id)
        .map((u) => ({
          value: u.user_profiles!.id,
          label: u.user_profiles?.full_name || 'Unknown',
        })) || [],
    [users]
  )

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
      })
    }
    // VIEW MODE: Compute from stored record (same function, same logic)
    return computeDisplayStatus({
      completed_date: pitch?.completed_date || null,
      actual_start_date: pitch?.actual_start_date || null,
      expected_start_date: pitch?.expected_start_date || null,
      actual_end_date: pitch?.actual_end_date || null,
      expected_end_date: pitch?.expected_end_date || null,
    })
  }, [
    isEditing,
    watchedCompletedDate,
    watchedActualStartDate,
    watchedExpectedStartDate,
    watchedActualEndDate,
    watchedExpectedEndDate,
    pitch?.completed_date,
    pitch?.actual_start_date,
    pitch?.expected_start_date,
    pitch?.actual_end_date,
    pitch?.expected_end_date,
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
      actual_start_date: pitch?.actual_start_date || null,
      expected_start_date: pitch?.expected_start_date || null,
    })
  }, [isEditing, watchedActualStartDate, watchedExpectedStartDate, pitch?.actual_start_date, pitch?.expected_start_date])

  const reactiveKeyEndDate = useMemo(() => {
    if (isEditing) {
      return computeKeyEndDate({
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
      })
    }
    return computeKeyEndDate({
      actual_end_date: pitch?.actual_end_date || null,
      expected_end_date: pitch?.expected_end_date || null,
    })
  }, [isEditing, watchedActualEndDate, watchedExpectedEndDate, pitch?.actual_end_date, pitch?.expected_end_date])

  // Reset form and parent selections when pitch data loads - status is computed
  useEffect(() => {
    if (pitch && !isEditing) {
      form.reset({
        name: pitch.name,
        description: pitch.description || '',
        urgency: pitch.urgency,
        importance: pitch.importance,
        expected_start_date: pitch.expected_start_date?.split('T')[0] || '',
        expected_end_date: pitch.expected_end_date?.split('T')[0] || '',
        actual_start_date: pitch.actual_start_date?.split('T')[0] || '',
        actual_end_date: pitch.actual_end_date?.split('T')[0] || '',
        completed_date: pitch.completed_date?.split('T')[0] || '',
        lead_id: pitch.lead_id || '',
        secondary_lead_id: pitch.secondary_lead_id || '',
        notes: pitch.notes || '',
        show_in_client_portal: pitch.show_in_client_portal,
        order_manual: pitch.order_manual ?? undefined,
      })
      // Set parent selections for edit mode
      const set = pitch.sets
      const project = set?.projects
      const client = project?.clients || set?.clients
      setSelectedClientId(client?.id || '')
      setSelectedProjectId(project?.id || '')
      setSelectedSetId(pitch.set_id || '')
    }
  }, [pitch?.id, pitch?.updated_at, isEditing])

  // Auto-enter edit mode
  useEffect(() => {
    if (shouldEditOnLoad && pitch && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, pitch])

  // BEFORE_COMMIT: Supabase DATE columns reject empty strings silently.
  // Must convert '' to null so the DB column is actually cleared.
  // Type assertion needed because mutation types expect undefined, but Supabase needs null.
  const toNullableDate = (val: string | undefined | null): string | undefined =>
    val?.trim() ? val.trim() : (null as unknown as undefined)

  const handleSave = async (data: PitchFormValues) => {
    if (!pitchId) return
    setIsSaving(true)
    try {
      // Status is computed from dates, not editable
      await updatePitch.mutateAsync({
        id: pitchId,
        name: data.name,
        description: data.description,
        urgency: data.urgency as UrgencyLevel,
        importance: data.importance as ImportanceLevel,
        expected_start_date: toNullableDate(data.expected_start_date),
        expected_end_date: toNullableDate(data.expected_end_date),
        actual_start_date: toNullableDate(data.actual_start_date),
        actual_end_date: toNullableDate(data.actual_end_date),
        completed_date: toNullableDate(data.completed_date),
        lead_id: data.lead_id || undefined,
        secondary_lead_id: data.secondary_lead_id || undefined,
        notes: data.notes,
        show_in_client_portal: data.show_in_client_portal,
        order_manual: data.order_manual,
      })
      // AFTER_COMMIT: Do NOT reset form here - let the useEffect that watches
      // record?.updated_at handle form reset when fresh data arrives from query cache
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (pitch) {
      form.reset({
        name: pitch.name,
        description: pitch.description || '',
        urgency: pitch.urgency,
        importance: pitch.importance,
        expected_start_date: pitch.expected_start_date?.split('T')[0] || '',
        expected_end_date: pitch.expected_end_date?.split('T')[0] || '',
        actual_start_date: pitch.actual_start_date?.split('T')[0] || '',
        actual_end_date: pitch.actual_end_date?.split('T')[0] || '',
        completed_date: pitch.completed_date?.split('T')[0] || '',
        lead_id: pitch.lead_id || '',
        secondary_lead_id: pitch.secondary_lead_id || '',
        notes: pitch.notes || '',
        show_in_client_portal: pitch.show_in_client_portal,
        order_manual: pitch.order_manual ?? undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCreateRequirement = async () => {
    if (!newRequirement.title || !pitch?.set_id) return

    // Get client_id from the pitch's parent hierarchy
    const clientId = pitch.sets?.client_id || pitch.sets?.projects?.client_id
    if (!clientId) return

    try {
      await createRequirement.mutateAsync({
        set_id: pitch.set_id,
        pitch_id: pitchId,
        client_id: clientId,
        title: newRequirement.title,
        description: newRequirement.description || undefined,
        requirement_type: newRequirement.requirement_type,
      })
      setCreateRequirementDialogOpen(false)
      setNewRequirement({
        title: '',
        description: '',
        requirement_type: 'task',
      })
    } catch {
      // Error handling done by mutation
    }
  }

  // Build options for parent dropdowns
  const clientOptions = useMemo(
    () => clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  const projectOptions = useMemo(
    () => projectsForClient?.map((p) => ({ value: p.id, label: p.name })) || [],
    [projectsForClient]
  )

  // Sets can come from project or directly from client
  const setOptions = useMemo(() => {
    const sets = selectedProjectId ? setsForProject : setsForClient
    return sets?.map((s) => ({ value: s.id, label: s.name })) || []
  }, [selectedProjectId, setsForProject, setsForClient])

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!pitch) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Pitch not found</p>
        <Button variant="link" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    )
  }

  // Build breadcrumbs: Client > Project > Set > Pitch
  const set = pitch.sets
  const project = set?.projects
  const client = project?.clients || set?.clients

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          ...(client
            ? [{ label: client.name, href: `/clients/${client.id}` }]
            : []),
          ...(project
            ? [{ label: project.name, href: `/projects/${project.id}` }]
            : []),
          ...(set
            ? [{ label: set.name, href: `/sets/${set.id}` }]
            : []),
          { label: pitch.name, displayId: pitch.pitch_id_display || pitch.display_id },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Presentation className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : pitch.name}
              {pitch.pitch_id_display && (
                <span className="text-muted-foreground"> | {pitch.pitch_id_display}</span>
              )}
            </h1>
            <Badge className={getStatusColor(reactiveStatus)}>
              {getStatusLabel(reactiveStatus)}
            </Badge>
          </div>
          {/* Parent selection dropdowns - only shown in edit mode */}
          {isEditing && (
            <div className="flex gap-4 mt-2">
              <div className="w-48">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <SearchableSelect
                  options={clientOptions}
                  value={selectedClientId}
                  onValueChange={(v) => {
                    setSelectedClientId(v || '')
                    setSelectedProjectId('') // Reset cascading
                    setSelectedSetId('')
                  }}
                  placeholder="Select client..."
                  searchPlaceholder="Search clients..."
                  emptyMessage="No clients found."
                />
              </div>
              <div className="w-48">
                <Label className="text-xs text-muted-foreground">Project (optional)</Label>
                <SearchableSelect
                  options={projectOptions}
                  value={selectedProjectId}
                  onValueChange={(v) => {
                    setSelectedProjectId(v || '')
                    setSelectedSetId('') // Reset cascading
                  }}
                  placeholder="Select project..."
                  searchPlaceholder="Search projects..."
                  emptyMessage="No projects found."
                  clearable
                />
              </div>
              <div className="w-48">
                <Label className="text-xs text-muted-foreground">Set *</Label>
                <SearchableSelect
                  options={setOptions}
                  value={selectedSetId}
                  onValueChange={(v) => setSelectedSetId(v || '')}
                  placeholder="Select set..."
                  searchPlaceholder="Search sets..."
                  emptyMessage="No sets found."
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Card */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons */}
          <div className="flex justify-end gap-2 mb-4">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm" onClick={form.handleSubmit(handleSave)} disabled={isSaving}>
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

          {/* Progress section with Key Dates */}
          <div className="space-y-3 mb-6 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion</p>
                <p className="text-2xl font-bold">{pitch.completion_percentage}%</p>
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
            <Progress value={pitch.completion_percentage} className="h-3" />
          </div>

          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ViewEditField
              type="text"
              label="Name"
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
              options={URGENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <ViewEditField
              type="select"
              label="Importance"
              isEditing={isEditing}
              value={form.watch('importance')}
              onChange={(v) => form.setValue('importance', v as ImportanceLevel)}
              options={IMPORTANCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            {/* Priority - calculated */}
            <div className="min-h-[52px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Priority
              </label>
              {(() => {
                const priority = calculateEisenhowerPriority(
                  form.watch('importance'),
                  form.watch('urgency')
                )
                return (
                  <div className="h-9 flex items-center">
                    <Badge className={getPriorityColor(priority)}>
                      {priority} - {getPriorityLabel(priority)}
                    </Badge>
                  </div>
                )
              })()}
            </div>
            {/* Order field */}
            <div className="min-h-[52px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Order
              </label>
              {isEditing ? (
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.watch('order_manual') ?? ''}
                  onChange={(e) => form.setValue('order_manual', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0"
                  min="0"
                  step="1"
                />
              ) : (
                <div className="h-9 flex items-center">
                  <span className="font-medium">{pitch.order_manual ?? '—'}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Presentation className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Requirements
            {pitchRequirements.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {pitchRequirements.length}
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
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Schedule */}
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

          {/* Team */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Team
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Lead</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('lead_id') || ''}
                      onValueChange={(v) => form.setValue('lead_id', v || '')}
                      placeholder="Select lead..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : pitch.lead ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={pitch.lead.avatar_url} />
                        <AvatarFallback>
                          {pitch.lead.full_name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{pitch.lead.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Secondary Lead</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('secondary_lead_id') || ''}
                      onValueChange={(v) => form.setValue('secondary_lead_id', v || '')}
                      placeholder="Select secondary lead..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : pitch.secondary_lead ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={pitch.secondary_lead.avatar_url} />
                        <AvatarFallback>
                          {pitch.secondary_lead.full_name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{pitch.secondary_lead.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Description & Notes */}
          <Card className="card-carbon">
            <CardContent className="pt-6 space-y-4">
              <ViewEditField
                type="textarea"
                label="Description"
                isEditing={isEditing}
                value={form.watch('description') || ''}
                onChange={(v) => form.setValue('description', v)}
                rows={3}
              />
              <ViewEditField
                type="textarea"
                label="Notes"
                isEditing={isEditing}
                value={form.watch('notes') || ''}
                onChange={(v) => form.setValue('notes', v)}
                rows={3}
              />
              <ViewEditField
                type="switch"
                label="Show in Client Portal"
                isEditing={isEditing}
                value={form.watch('show_in_client_portal')}
                onChange={(v) => form.setValue('show_in_client_portal', v)}
              />
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={pitch.created_at}
                  created_by={pitch.created_by || ''}
                  updated_at={pitch.updated_at}
                  updated_by={pitch.updated_by}
                  creator={pitch.creator}
                  updater={pitch.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requirements Tab - Split into Open/Completed */}
        <TabsContent value="requirements" className="mt-6">
          <RequirementsTabbedPanel
            requirements={pitchRequirements}
            isLoading={false}
            onCreateClick={() => setCreateRequirementDialogOpen(true)}
            showSetColumn={false}
            showProjectColumn={false}
            emptyMessage="No requirements linked to this pitch"
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab
            entityType="pitch"
            entityId={pitchId!}
            pitchId={pitchId}
            setId={pitch?.set_id}
            phaseId={pitch?.sets?.phase_id}
            projectId={pitch?.sets?.project_id}
            clientId={pitch?.sets?.client_id || pitch?.sets?.projects?.client_id}
            title="Pitch Documents"
            parentContext={{
              clientName: (pitch?.sets?.projects?.clients || pitch?.sets?.clients)?.name,
              projectName: pitch?.sets?.projects?.name,
              phaseName: pitch?.sets?.project_phases?.name,
              setName: pitch?.sets?.name,
              pitchName: pitch?.name,
            }}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <NotesPanel
            entityType="pitch"
            entityId={pitchId!}
            title="Pitch Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="pitch"
            entityId={pitchId!}
            title="Pitch Discussions"
            description="Collaborate on pitch details"
            maxHeight="600px"
          />
        </TabsContent>
      </Tabs>

      {/* Create Requirement Dialog */}
      <Dialog open={createRequirementDialogOpen} onOpenChange={setCreateRequirementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Requirement</DialogTitle>
            <DialogDescription>
              Create a new requirement for this pitch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newRequirement.title}
                onChange={(e) =>
                  setNewRequirement((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Requirement title..."
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <SearchableSelect
                options={REQUIREMENT_TYPE_OPTIONS}
                value={newRequirement.requirement_type}
                onValueChange={(v) =>
                  setNewRequirement((prev) => ({
                    ...prev,
                    requirement_type: (v as RequirementType) || 'task',
                  }))
                }
                placeholder="Select type..."
                searchPlaceholder="Search types..."
                emptyMessage="No types found."
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newRequirement.description}
                onChange={(e) =>
                  setNewRequirement((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRequirementDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRequirement}
              disabled={!newRequirement.title || createRequirement.isPending}
            >
              {createRequirement.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create Requirement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
