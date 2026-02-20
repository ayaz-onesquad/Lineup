import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePhaseById, usePhaseMutations } from '@/hooks'
import { useSetsByPhase } from '@/hooks'
import { useTenantUsers } from '@/hooks'
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
  Save,
  Loader2,
  Calendar,
  Users,
  ListOrdered,
  Building2,
  MoreHorizontal,
  FileText,
  MessageSquare,
} from 'lucide-react'
import { getStatusColor, URGENCY_OPTIONS, IMPORTANCE_OPTIONS, getPriorityLabel, getPriorityColor, formatDate, type PriorityScore } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel, DiscussionsPanel } from '@/components/shared'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { PhaseStatus, UrgencyLevel, ImportanceLevel } from '@/types/database'

// Phase form schema
const phaseFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  project_id: z.string().min(1, 'Project is required'),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  notes: z.string().optional(),
})

type PhaseFormValues = z.infer<typeof phaseFormSchema>

const PHASE_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
]

export function PhaseDetailPage() {
  const { phaseId } = useParams<{ phaseId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: phase, isLoading } = usePhaseById(phaseId!)
  const { data: sets, isLoading: setsLoading } = useSetsByPhase(phaseId!)
  const { data: users } = useTenantUsers()
  const { updatePhase } = usePhaseMutations()
  const { openDetailPanel, openCreateModal } = useUIStore()

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Phase form
  const form = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseFormSchema),
    defaultValues: {
      name: phase?.name || '',
      description: phase?.description || '',
      project_id: phase?.project_id || '',
      status: phase?.status || 'not_started',
      urgency: phase?.urgency || 'medium',
      importance: phase?.importance || 'medium',
      expected_start_date: phase?.expected_start_date?.split('T')[0] || '',
      expected_end_date: phase?.expected_end_date?.split('T')[0] || '',
      actual_start_date: phase?.actual_start_date?.split('T')[0] || '',
      actual_end_date: phase?.actual_end_date?.split('T')[0] || '',
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

  // Reset form when phase data loads
  useEffect(() => {
    if (phase && !isEditing) {
      form.reset({
        name: phase.name,
        description: phase.description || '',
        project_id: phase.project_id,
        status: phase.status,
        urgency: phase.urgency || 'medium',
        importance: phase.importance || 'medium',
        expected_start_date: phase.expected_start_date?.split('T')[0] || '',
        expected_end_date: phase.expected_end_date?.split('T')[0] || '',
        actual_start_date: phase.actual_start_date?.split('T')[0] || '',
        actual_end_date: phase.actual_end_date?.split('T')[0] || '',
        lead_id: phase.lead_id || '',
        secondary_lead_id: phase.secondary_lead_id || '',
        notes: phase.notes || '',
      })
    }
  }, [phase?.id, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && phase && !isEditing) {
      setIsEditing(true)
      // Clear the query param after entering edit mode
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, phase])

  const handleSavePhase = async (data: PhaseFormValues) => {
    if (!phaseId) return
    setIsSaving(true)
    try {
      await updatePhase.mutateAsync({
        id: phaseId,
        data: {
          name: data.name,
          description: data.description,
          project_id: data.project_id,
          status: data.status,
          urgency: data.urgency as UrgencyLevel,
          importance: data.importance as ImportanceLevel,
          expected_start_date: data.expected_start_date || undefined,
          expected_end_date: data.expected_end_date || undefined,
          actual_start_date: data.actual_start_date || undefined,
          actual_end_date: data.actual_end_date || undefined,
          lead_id: data.lead_id || undefined,
          secondary_lead_id: data.secondary_lead_id || undefined,
          notes: data.notes || undefined,
        },
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save phase:', error)
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
            <Badge className={getStatusColor(phase.status)}>{phase.status.replace(/_/g, ' ')}</Badge>
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
                <Button
                  size="sm"
                  onClick={form.handleSubmit(handleSavePhase)}
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
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={form.watch('status')}
              onChange={(v) => form.setValue('status', v as PhaseStatus)}
              options={PHASE_STATUS_OPTIONS.map(opt => ({
                value: opt.value,
                label: opt.label,
                variant: opt.value === 'completed' ? 'default' : opt.value === 'blocked' ? 'outline' : 'secondary'
              }))}
            />
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
      <Tabs defaultValue="details">
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
          <TabsTrigger value="notes" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="discussions" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Discussions
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
                  {phase.expected_end_date && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Due Date</p>
                      <p className="font-medium">{formatDate(phase.expected_end_date)}</p>
                    </div>
                  )}
                </div>
                <Progress value={sets?.length ? (sets.filter((s) => s.status === 'completed').length / sets.length) * 100 : 0} className="h-3" />
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
          <div className="flex justify-end mb-4">
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
          ) : !sets || sets.length === 0 ? (
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
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sets.map((set) => (
                      <TableRow
                        key={set.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetailPanel('set', set.id)}
                        onDoubleClick={() => navigate(`/sets/${set.id}`)}
                      >
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
                          <Badge className={getStatusColor(set.status)} variant="outline">
                            {set.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              set.urgency === 'high' && set.importance === 'high'
                                ? 'border-red-500 text-red-700'
                                : ''
                            }
                          >
                            U:{set.urgency?.[0].toUpperCase()} I:{set.importance?.[0].toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {set.lead?.full_name || set.owner?.full_name || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={set.completion_percentage} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">
                              {set.completion_percentage}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <DocumentUpload
            entityType="phase"
            entityId={phaseId!}
            title="Phase Documents"
            description="Upload and manage files for this phase"
            maxHeight="500px"
            allowMultiple
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
