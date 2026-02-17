import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePhaseById, usePhaseMutations } from '@/hooks'
import { useSetsByPhase } from '@/hooks'
import { useProjects } from '@/hooks'
import { useTenantUsers } from '@/hooks'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import { getStatusColor, URGENCY_OPTIONS, IMPORTANCE_OPTIONS, getPriorityLabel, getPriorityColor, type PriorityScore } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel, DiscussionsPanel } from '@/components/shared'
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
  const { data: allProjects } = useProjects()
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

  // Build options for selects
  const projectOptions = useMemo(() =>
    allProjects?.map((p) => ({
      value: p.id,
      label: p.name,
      description: `${p.project_code} • ${p.clients?.name || ''}`,
    })) || [],
    [allProjects]
  )

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

  // Build breadcrumbs
  const breadcrumbs = [
    { label: phase.projects?.clients?.name || 'Client', href: `/clients/${phase.projects?.client_id}` },
    { label: phase.projects?.name || 'Project', href: `/projects/${phase.project_id}` },
    { label: phase.name },
  ]

  return (
    <div className="space-y-6">
      {/* Back button and breadcrumbs */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Breadcrumbs items={breadcrumbs} />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{phase.name}</h1>
            <Badge className={getStatusColor(phase.status)} variant="outline">
              {phase.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {phase.phase_id_display || `PH-${phase.display_id}`}
          </p>
        </div>

        {/* Actions */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(handleSavePhase)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        ) : (
          <Button onClick={() => setIsEditing(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">
            <ListOrdered className="mr-2 h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="sets">
            <Layers className="mr-2 h-4 w-4" />
            Sets ({sets?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
          </TabsTrigger>
          <TabsTrigger value="discussions">
            Discussions
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Phase Information */}
            <Card className="page-carbon">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5" />
                  Phase Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ViewEditField
                  type="text"
                  label="Phase Name"
                  value={form.watch('name')}
                  onChange={(value: string) => form.setValue('name', value)}
                  isEditing={isEditing}
                  required
                />
                <ViewEditField
                  label="Description"
                  value={form.watch('description') || ''}
                  onChange={(value) => form.setValue('description', value)}
                  isEditing={isEditing}
                  type="textarea"
                />
                <ViewEditField
                  label="Project"
                  value={form.watch('project_id')}
                  onChange={(value) => form.setValue('project_id', value)}
                  isEditing={isEditing}
                  type="select"
                  options={projectOptions}
                  searchable
                  required
                />
                <ViewEditField
                  label="Status"
                  value={form.watch('status')}
                  onChange={(value) => form.setValue('status', value as PhaseStatus)}
                  isEditing={isEditing}
                  type="select"
                  options={PHASE_STATUS_OPTIONS}
                  required
                />
                <ViewEditField
                  label="Notes"
                  value={form.watch('notes') || ''}
                  onChange={(value) => form.setValue('notes', value)}
                  isEditing={isEditing}
                  type="textarea"
                />
              </CardContent>
            </Card>

            {/* Team */}
            <Card className="page-carbon">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ViewEditField
                  label="Lead"
                  value={form.watch('lead_id') || ''}
                  onChange={(value) => form.setValue('lead_id', value)}
                  isEditing={isEditing}
                  type="select"
                  options={userOptions}
                  searchable
                  clearable
                />
                <ViewEditField
                  label="Secondary Lead"
                  value={form.watch('secondary_lead_id') || ''}
                  onChange={(value) => form.setValue('secondary_lead_id', value)}
                  isEditing={isEditing}
                  type="select"
                  options={userOptions}
                  searchable
                  clearable
                />
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card className="page-carbon">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ViewEditField
                  label="Expected Start Date"
                  value={form.watch('expected_start_date') || ''}
                  onChange={(value) => form.setValue('expected_start_date', value)}
                  isEditing={isEditing}
                  type="date"
                />
                <ViewEditField
                  label="Expected End Date"
                  value={form.watch('expected_end_date') || ''}
                  onChange={(value) => form.setValue('expected_end_date', value)}
                  isEditing={isEditing}
                  type="date"
                />
                <ViewEditField
                  label="Actual Start Date"
                  value={form.watch('actual_start_date') || ''}
                  onChange={(value) => form.setValue('actual_start_date', value)}
                  isEditing={isEditing}
                  type="date"
                />
                <ViewEditField
                  label="Actual End Date"
                  value={form.watch('actual_end_date') || ''}
                  onChange={(value) => form.setValue('actual_end_date', value)}
                  isEditing={isEditing}
                  type="date"
                />
              </CardContent>
            </Card>

            {/* Priority */}
            {(phase.urgency || phase.importance) && (
              <Card className="page-carbon">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Priority (Eisenhower Matrix)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ViewEditField
                    label="Urgency"
                    value={form.watch('urgency') || 'medium'}
                    onChange={(value) => form.setValue('urgency', value as UrgencyLevel)}
                    isEditing={isEditing}
                    type="select"
                    options={URGENCY_OPTIONS}
                  />
                  <ViewEditField
                    label="Importance"
                    value={form.watch('importance') || 'medium'}
                    onChange={(value) => form.setValue('importance', value as ImportanceLevel)}
                    isEditing={isEditing}
                    type="select"
                    options={IMPORTANCE_OPTIONS}
                  />
                  {phase.priority && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Calculated Priority</label>
                      <Badge className={getPriorityColor(phase.priority as PriorityScore)}>
                        {getPriorityLabel(phase.priority as PriorityScore)}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Audit Trail */}
          <AuditTrail
            created_at={phase.created_at}
            updated_at={phase.updated_at}
            creator={phase.creator}
            updater={phase.updater}
          />
        </TabsContent>

        {/* Sets Tab */}
        <TabsContent value="sets" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Sets</h3>
            <Button size="sm" onClick={() => openCreateModal('set', {
              phase_id: phaseId,
              project_id: phase.project_id,
              client_id: phase.projects?.client_id,
            })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Set
            </Button>
          </div>

          {setsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sets && sets.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
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
                      <TableCell className="font-medium">{set.name}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(set.status)} variant="outline">
                          {set.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {set.lead?.full_name || set.owner?.full_name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${set.completion_percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {set.completion_percentage}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                No sets found for this phase.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <DocumentUpload
            entityType="phase"
            entityId={phaseId!}
            title="Phase Documents"
            description="Upload and manage documents for this phase"
          />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <NotesPanel
            entityType="phase"
            entityId={phaseId!}
            title="Phase Notes"
            description="Add notes and updates for this phase"
          />
        </TabsContent>

        {/* Discussions Tab */}
        <TabsContent value="discussions">
          <DiscussionsPanel
            entityType="phase"
            entityId={phaseId!}
            title="Phase Discussions"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
