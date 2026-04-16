import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePhaseById, usePhaseMutations } from '@/hooks'
import { useSetsByPhase } from '@/hooks'
import { useTenantUsers } from '@/hooks'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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
  Edit,
  X,
  Calendar,
  Users,
  ListOrdered,
  Building2,
  MoreHorizontal,
  FileText,
  MessageSquare,
  Link2,
} from 'lucide-react'
import { URGENCY_OPTIONS, IMPORTANCE_OPTIONS, getPriorityLabel, getPriorityColor, formatDate, type PriorityScore } from '@/lib/utils'
import { computeDisplayStatus, computeKeyStartDate, computeKeyEndDate, getStatusLabel, getStatusColor, STATUS_LABELS, STATUS_COLORS } from '@/utils/statusUtils'
import { calculateEisenhowerPriority as calcPriority, getPriorityColor as getPrioColor } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentsTab, NotesPanel, DiscussionsPanel, SaveSplitButton, getNextRecordId, StatusFilterBar } from '@/components/shared'
import { useStatusFilter } from '@/hooks/useStatusFilter'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { UrgencyLevel, ImportanceLevel } from '@/types/database'

// Phase form schema - status removed since it's now computed/read-only
const phaseFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  // client_id is form-only for filtering projects — not saved to DB directly
  client_id: z.string().optional(),
  project_id: z.string().min(1, 'Project is required'),
  // Status is now computed from dates, not editable
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  // Completion tracking - sets completed_date to mark as "Completed"
  completed_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  notes: z.string().optional(),
})

type PhaseFormValues = z.infer<typeof phaseFormSchema>

export function PhaseDetailPage() {
  const { phaseId } = useParams<{ phaseId: string }>()
  const navigate = useNavigate()

  // Calculate next record ID for Save & Next functionality
  const nextRecordId = phaseId ? getNextRecordId(phaseId) : null
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: phase, isLoading } = usePhaseById(phaseId!)
  const { data: sets, isLoading: setsLoading } = useSetsByPhase(phaseId!)

  // Status filter for sets tab (default: show active only)
  const { filter: setsFilter, setFilter: setSetsFilter, filtered: filteredSets, counts: setsCounts } = useStatusFilter(sets)
  const { data: users } = useTenantUsers()
  const { data: allClients } = useClients()
  const { data: allProjects } = useProjects()
  const { updatePhase } = usePhaseMutations()
  const { openDetailPanel, openCreateModal } = useUIStore()

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  // URL-persisted tab state (survives page refresh)
  const activeTab = searchParams.get('tab') || 'details'
  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev)
      newParams.set('tab', value)
      return newParams
    }, { replace: true })
  }

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Phase form - status is computed and not editable
  const form = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseFormSchema),
    defaultValues: {
      name: phase?.name || '',
      description: phase?.description || '',
      client_id: phase?.projects?.client_id || '',
      project_id: phase?.project_id || '',
      urgency: phase?.urgency || 'medium',
      importance: phase?.importance || 'medium',
      expected_start_date: phase?.expected_start_date?.split('T')[0] || '',
      expected_end_date: phase?.expected_end_date?.split('T')[0] || '',
      actual_start_date: phase?.actual_start_date?.split('T')[0] || '',
      actual_end_date: phase?.actual_end_date?.split('T')[0] || '',
      completed_date: phase?.completed_date?.split('T')[0] || '',
      lead_id: phase?.lead_id || '',
      secondary_lead_id: phase?.secondary_lead_id || '',
      notes: phase?.notes || '',
    },
  })

  // User options for team member dropdowns - use user_profiles.id
  const userOptions = useMemo(() =>
    users?.filter((u) => u.user_profiles?.id).map((u) => ({
      value: u.user_profiles!.id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  // Client options for dropdown
  const clientOptions = useMemo(() =>
    allClients?.map(c => ({ value: c.id, label: c.name })) ?? [],
    [allClients]
  )

  // Watch client selection to filter projects
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })

  // Filtered project options based on selected client
  const filteredProjectOptions = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects.map(p => ({ value: p.id, label: p.name }))
    return allProjects
      .filter(p => p.client_id === selectedClientId)
      .map(p => ({ value: p.id, label: p.name }))
  }, [allProjects, selectedClientId])

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
      completed_date: phase?.completed_date || null,
      actual_start_date: phase?.actual_start_date || null,
      expected_start_date: phase?.expected_start_date || null,
      actual_end_date: phase?.actual_end_date || null,
      expected_end_date: phase?.expected_end_date || null,
    })
  }, [
    isEditing,
    watchedCompletedDate,
    watchedActualStartDate,
    watchedExpectedStartDate,
    watchedActualEndDate,
    watchedExpectedEndDate,
    phase?.completed_date,
    phase?.actual_start_date,
    phase?.expected_start_date,
    phase?.actual_end_date,
    phase?.expected_end_date,
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
      actual_start_date: phase?.actual_start_date || null,
      expected_start_date: phase?.expected_start_date || null,
    })
  }, [isEditing, watchedActualStartDate, watchedExpectedStartDate, phase?.actual_start_date, phase?.expected_start_date])

  const reactiveKeyEndDate = useMemo(() => {
    if (isEditing) {
      return computeKeyEndDate({
        actual_end_date: watchedActualEndDate || null,
        expected_end_date: watchedExpectedEndDate || null,
      })
    }
    return computeKeyEndDate({
      actual_end_date: phase?.actual_end_date || null,
      expected_end_date: phase?.expected_end_date || null,
    })
  }, [isEditing, watchedActualEndDate, watchedExpectedEndDate, phase?.actual_end_date, phase?.expected_end_date])

  // Reset form when phase data loads - status is computed
  useEffect(() => {
    if (phase && !isEditing) {
      form.reset({
        name: phase.name,
        description: phase.description || '',
        client_id: phase.projects?.client_id || '',
        project_id: phase.project_id,
        urgency: phase.urgency || 'medium',
        importance: phase.importance || 'medium',
        expected_start_date: phase.expected_start_date?.split('T')[0] || '',
        expected_end_date: phase.expected_end_date?.split('T')[0] || '',
        actual_start_date: phase.actual_start_date?.split('T')[0] || '',
        actual_end_date: phase.actual_end_date?.split('T')[0] || '',
        completed_date: phase.completed_date?.split('T')[0] || '',
        lead_id: phase.lead_id || '',
        secondary_lead_id: phase.secondary_lead_id || '',
        notes: phase.notes || '',
      })
    }
  }, [phase?.id, phase?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && phase && !isEditing) {
      setIsEditing(true)
      // Clear edit param but preserve tab
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev)
        newParams.delete('edit')
        return newParams
      }, { replace: true })
    }
  }, [shouldEditOnLoad, phase])

  // BEFORE_COMMIT: Supabase DATE columns reject empty strings silently.
  // Must convert '' to null so the DB column is actually cleared.
  // Type assertion needed because mutation types expect undefined, but Supabase needs null.
  const toNullableDate = (val: string | undefined | null): string | undefined =>
    val?.trim() ? val.trim() : (null as unknown as undefined)

  // Core save logic - returns true on success for Save & Next navigation
  const executeSave = async (data: PhaseFormValues): Promise<boolean> => {
    if (!phaseId) return false
    try {
      // Status is computed from dates, not editable
      // completed_date triggers auto-fill of completed_by via database trigger
      await updatePhase.mutateAsync({
        id: phaseId,
        data: {
          name: data.name,
          description: data.description,
          project_id: data.project_id,
          urgency: data.urgency as UrgencyLevel,
          importance: data.importance as ImportanceLevel,
          expected_start_date: toNullableDate(data.expected_start_date),
          expected_end_date: toNullableDate(data.expected_end_date),
          actual_start_date: toNullableDate(data.actual_start_date),
          actual_end_date: toNullableDate(data.actual_end_date),
          completed_date: toNullableDate(data.completed_date),
          lead_id: data.lead_id || undefined,
          secondary_lead_id: data.secondary_lead_id || undefined,
          notes: data.notes || undefined,
        },
      })
      // AFTER_COMMIT: Do NOT reset form here - let the useEffect that watches
      // record?.updated_at handle form reset when fresh data arrives from query cache
      setIsEditing(false)
      return true
    } catch (error) {
      console.error('Failed to save phase:', error)
      return false
    }
  }

  // Save & Close handler
  const handleSaveAndClose = async (data: PhaseFormValues) => {
    setIsSaving(true)
    try {
      await executeSave(data)
    } finally {
      setIsSaving(false)
    }
  }

  // Save & Next handler
  const handleSaveAndNext = async (data: PhaseFormValues) => {
    if (!nextRecordId) return
    setIsSaving(true)
    try {
      const success = await executeSave(data)
      if (success) {
        navigate(`/phases/${nextRecordId}?edit=true`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    form.reset()
    setIsEditing(false)
  }

  // Show skeleton only while loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  // Show error message if phase not found (404 case)
  if (!phase) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card className="page-carbon">
          <CardContent className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Phase Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The phase you're looking for doesn't exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/phases')}>
              View All Phases
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs: Client > Project > Phase */}
      <Breadcrumbs
        items={[
          {
            label: phase.projects?.clients?.name || 'Client',
            href: phase.projects?.client_id ? `/clients/${phase.projects.client_id}` : '/clients',
          },
          {
            label: phase.projects?.name || 'Project',
            href: `/projects/${phase.project_id}`,
          },
          { label: phase.name, displayId: phase.display_id },
        ]}
      />

      {/* Header - Project Name first, then Phase Name, Status */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : phase.name}
              {phase.display_id && <span className="text-muted-foreground"> | ID: {phase.display_id}</span>}
            </h1>
            <Badge className={getStatusColor(reactiveStatus)}>
              {getStatusLabel(reactiveStatus)}
            </Badge>
            {phase.priority && (
              <Badge variant="outline" className={getPriorityColor(phase.priority as PriorityScore)}>
                {getPriorityLabel(phase.priority as PriorityScore)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Phase Info Card - Key fields: Project (1st), Phase Name, Status */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons and Actions menu */}
          <div className="flex justify-end gap-2 mb-4">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <SaveSplitButton
                  onSaveClose={form.handleSubmit(handleSaveAndClose)}
                  onSaveNext={form.handleSubmit(handleSaveAndNext)}
                  isSaving={isSaving}
                  hasNext={!!nextRecordId}
                />
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
                    <DropdownMenuItem onClick={() => openCreateModal('set', {
                      phase_id: phaseId,
                      project_id: phase.project_id,
                      client_id: phase.projects?.client_id,
                    })}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Set
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Delete Phase
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Header fields: Project (1st), Phase Name, Status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Project</p>
              <Link
                to={`/projects/${phase.project_id}`}
                className="font-medium hover:underline"
              >
                {phase.projects?.name || '—'}
              </Link>
            </div>
            <ViewEditField
              type="text"
              label="Phase Name"
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
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Client</p>
              <Link
                to={`/clients/${phase.projects?.client_id}`}
                className="font-medium hover:underline"
              >
                {phase.projects?.clients?.name || '—'}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Building2 className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="sets" className="gap-2">
            <Layers className="h-4 w-4" />
            Sets
            {sets && sets.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {sets.length}
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
          <TabsTrigger value="notes" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        {/* Details Tab - Organized sections matching Project pattern */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Progress Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Progress
              </h3>
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Sets in Phase</p>
                    <p className="text-2xl font-bold">{sets?.length || 0}</p>
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
                <Progress value={sets?.length ? (sets.filter((s) => s.status === 'completed').length / sets.length) * 100 : 0} className="h-3" />
              </div>
            </CardContent>
          </Card>

          {/* Parent Records Section — hierarchy order: Client → Project */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-muted-foreground" />
                Parent Records
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Client — first in hierarchy */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Client</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={clientOptions}
                      value={form.watch('client_id') || ''}
                      onValueChange={(value) => {
                        form.setValue('client_id', value || '')
                        // Reset project if it no longer belongs to new client
                        const currentProject = form.getValues('project_id')
                        if (currentProject && value) {
                          const valid = allProjects?.find(
                            p => p.id === currentProject && p.client_id === value
                          )
                          if (!valid) form.setValue('project_id', '')
                        }
                      }}
                      placeholder="Select client..."
                      clearable
                    />
                  ) : (
                    <p className="font-medium">
                      {phase.projects?.clients?.name ?? '—'}
                    </p>
                  )}
                </div>

                {/* 2. Project — second in hierarchy, filtered by client */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Project <span className="text-destructive">*</span>
                  </p>
                  {isEditing ? (
                    <SearchableSelect
                      options={filteredProjectOptions}
                      value={form.watch('project_id') || ''}
                      onValueChange={(value) => form.setValue('project_id', value || '')}
                      placeholder="Select project..."
                      clearable
                    />
                  ) : (
                    <p className="font-medium">
                      {phase.projects?.name ?? '—'}
                    </p>
                  )}
                  {form.formState.errors.project_id && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.project_id.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Phase Info Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-muted-foreground" />
                Phase Information
              </h3>
              <ViewEditField
                type="textarea"
                label="Description"
                isEditing={isEditing}
                value={form.watch('description') || ''}
                onChange={(v) => form.setValue('description', v)}
                placeholder="Phase description..."
                rows={3}
              />
              <div className="mt-4">
                <ViewEditField
                  type="textarea"
                  label="Notes"
                  isEditing={isEditing}
                  value={form.watch('notes') || ''}
                  onChange={(v) => form.setValue('notes', v)}
                  placeholder="Internal notes..."
                  rows={2}
                />
              </div>
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

          {/* Priority Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                Priority (Eisenhower Matrix)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <ViewEditField
                  type="select"
                  label="Urgency"
                  isEditing={isEditing}
                  value={form.watch('urgency') || 'medium'}
                  onChange={(v) => form.setValue('urgency', v as UrgencyLevel)}
                  options={URGENCY_OPTIONS}
                />
                <ViewEditField
                  type="select"
                  label="Importance"
                  isEditing={isEditing}
                  value={form.watch('importance') || 'medium'}
                  onChange={(v) => form.setValue('importance', v as ImportanceLevel)}
                  options={IMPORTANCE_OPTIONS}
                />
                {phase.priority && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Calculated Priority</p>
                    <Badge className={getPriorityColor(phase.priority as PriorityScore)}>
                      {getPriorityLabel(phase.priority as PriorityScore)}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Team Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Team
              </h3>
              <div className="grid grid-cols-2 gap-6">
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
                  ) : phase.lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {phase.lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{phase.lead.full_name}</span>
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
                  ) : phase.secondary_lead ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {phase.secondary_lead.full_name?.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{phase.secondary_lead.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={phase.created_at}
                  created_by={phase.created_by}
                  updated_at={phase.updated_at}
                  updated_by={phase.updated_by}
                  creator={phase.creator}
                  updater={phase.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sets Tab */}
        <TabsContent value="sets" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <StatusFilterBar
              value={setsFilter}
              onChange={setSetsFilter}
              counts={setsCounts}
            />
            <Button
              variant="outline"
              onClick={() => openCreateModal('set', {
                phase_id: phaseId,
                project_id: phase.project_id,
                client_id: phase.projects?.client_id,
              })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Set
            </Button>
          </div>

          {setsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !filteredSets || filteredSets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sets yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('set', {
                    phase_id: phaseId,
                    project_id: phase.project_id,
                    client_id: phase.projects?.client_id,
                  })}
                >
                  Create First Set
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSets.map((set) => {
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
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {set.name}
                              {set.display_id && (
                                <Badge variant="outline" className="font-mono text-xs">
                                  #{set.display_id}
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
                            {set.lead?.full_name || set.owner?.full_name || '—'}
                          </TableCell>
                          <TableCell>
                            {keyStart ? formatDate(keyStart.toISOString()) : '—'}
                          </TableCell>
                          <TableCell>
                            {keyEnd ? formatDate(keyEnd.toISOString()) : '—'}
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

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <DocumentsTab
            entityType="phase"
            entityId={phaseId!}
            phaseId={phaseId}
            projectId={phase?.project_id}
            clientId={phase?.projects?.client_id}
            title="Phase Documents"
            parentContext={{
              clientName: phase?.projects?.clients?.name,
              projectName: phase?.projects?.name,
              phaseName: phase?.name,
            }}
          />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6">
          <NotesPanel
            entityType="phase"
            entityId={phaseId!}
            title="Phase Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        {/* Discussions Tab */}
        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="phase"
            entityId={phaseId!}
            title="Phase Discussions"
            description="Collaborate on phase matters"
            maxHeight="600px"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
