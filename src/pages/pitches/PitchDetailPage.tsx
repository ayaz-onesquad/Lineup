import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePitch, usePitchMutations } from '@/hooks/usePitches'
import { useRequirementsBySet } from '@/hooks/useRequirements'
import { useTenantUsers } from '@/hooks/useTenant'
import { useAuthStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  MoreVertical,
  ExternalLink,
  Check,
  XCircle,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import {
  formatDate,
  getStatusColor,
  URGENCY_OPTIONS,
  IMPORTANCE_OPTIONS,
  calculateEisenhowerPriority,
  getPriorityLabel,
  getPriorityColor,
} from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { PitchStatus, UrgencyLevel, ImportanceLevel } from '@/types/database'

// Pitch form schema
const pitchFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked', 'on_hold']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  notes: z.string().optional(),
  show_in_client_portal: z.boolean(),
})

type PitchFormValues = z.infer<typeof pitchFormSchema>

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', variant: 'secondary' as const },
  { value: 'in_progress', label: 'In Progress', variant: 'default' as const },
  { value: 'completed', label: 'Completed', variant: 'default' as const },
  { value: 'blocked', label: 'Blocked', variant: 'outline' as const },
  { value: 'on_hold', label: 'On Hold', variant: 'secondary' as const },
]

export function PitchDetailPage() {
  const { pitchId } = useParams<{ pitchId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { data: pitch, isLoading } = usePitch(pitchId!)
  const { data: users } = useTenantUsers()
  const { updatePitch, approvePitch, rejectPitch } = usePitchMutations()

  // Get requirements for this pitch's set (filtering by pitch_id would need API update)
  const { data: setRequirements } = useRequirementsBySet(pitch?.set_id || '')

  // Filter requirements that belong to this pitch
  const pitchRequirements = useMemo(
    () => setRequirements?.filter((r) => (r as any).pitch_id === pitchId) || [],
    [setRequirements, pitchId]
  )

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)

  const form = useForm<PitchFormValues>({
    resolver: zodResolver(pitchFormSchema),
    defaultValues: {
      name: pitch?.name || '',
      description: pitch?.description || '',
      status: pitch?.status || 'not_started',
      urgency: pitch?.urgency || 'medium',
      importance: pitch?.importance || 'medium',
      expected_start_date: pitch?.expected_start_date?.split('T')[0] || '',
      expected_end_date: pitch?.expected_end_date?.split('T')[0] || '',
      actual_start_date: pitch?.actual_start_date?.split('T')[0] || '',
      actual_end_date: pitch?.actual_end_date?.split('T')[0] || '',
      lead_id: pitch?.lead_id || '',
      secondary_lead_id: pitch?.secondary_lead_id || '',
      notes: pitch?.notes || '',
      show_in_client_portal: pitch?.show_in_client_portal ?? false,
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

  // Reset form when pitch data loads
  useEffect(() => {
    if (pitch && !isEditing) {
      form.reset({
        name: pitch.name,
        description: pitch.description || '',
        status: pitch.status,
        urgency: pitch.urgency,
        importance: pitch.importance,
        expected_start_date: pitch.expected_start_date?.split('T')[0] || '',
        expected_end_date: pitch.expected_end_date?.split('T')[0] || '',
        actual_start_date: pitch.actual_start_date?.split('T')[0] || '',
        actual_end_date: pitch.actual_end_date?.split('T')[0] || '',
        lead_id: pitch.lead_id || '',
        secondary_lead_id: pitch.secondary_lead_id || '',
        notes: pitch.notes || '',
        show_in_client_portal: pitch.show_in_client_portal,
      })
    }
  }, [pitch?.id, isEditing])

  // Auto-enter edit mode
  useEffect(() => {
    if (shouldEditOnLoad && pitch && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, pitch])

  const handleSave = async (data: PitchFormValues) => {
    if (!pitchId) return
    setIsSaving(true)
    try {
      await updatePitch.mutateAsync({
        id: pitchId,
        name: data.name,
        description: data.description,
        status: data.status as PitchStatus,
        urgency: data.urgency as UrgencyLevel,
        importance: data.importance as ImportanceLevel,
        expected_start_date: data.expected_start_date || undefined,
        expected_end_date: data.expected_end_date || undefined,
        actual_start_date: data.actual_start_date || undefined,
        actual_end_date: data.actual_end_date || undefined,
        lead_id: data.lead_id || undefined,
        secondary_lead_id: data.secondary_lead_id || undefined,
        notes: data.notes,
        show_in_client_portal: data.show_in_client_portal,
      })
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
        status: pitch.status,
        urgency: pitch.urgency,
        importance: pitch.importance,
        expected_start_date: pitch.expected_start_date?.split('T')[0] || '',
        expected_end_date: pitch.expected_end_date?.split('T')[0] || '',
        actual_start_date: pitch.actual_start_date?.split('T')[0] || '',
        actual_end_date: pitch.actual_end_date?.split('T')[0] || '',
        lead_id: pitch.lead_id || '',
        secondary_lead_id: pitch.secondary_lead_id || '',
        notes: pitch.notes || '',
        show_in_client_portal: pitch.show_in_client_portal,
      })
    }
    setIsEditing(false)
  }

  const handleApprove = async () => {
    if (!pitchId || !user) return
    // Find the current user's profile ID
    const currentUserProfile = users?.find((u) => u.user_id === user.id)?.user_profiles
    if (!currentUserProfile) return

    await approvePitch.mutateAsync({
      id: pitchId,
      approvedById: currentUserProfile.id,
    })
    setApproveDialogOpen(false)
  }

  const handleReject = async () => {
    if (!pitchId) return
    await rejectPitch.mutateAsync(pitchId)
    setRejectDialogOpen(false)
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
            <Badge className={getStatusColor(pitch.status)}>{pitch.status.replace('_', ' ')}</Badge>
            {pitch.is_approved ? (
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Approved
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Pending Approval
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {set?.name}
            {project && ` • ${project.name}`}
          </p>
        </div>
        {/* Approval Actions */}
        {!pitch.is_approved && (
          <Button variant="default" onClick={() => setApproveDialogOpen(true)}>
            <Check className="mr-2 h-4 w-4" />
            Approve
          </Button>
        )}
        {pitch.is_approved && (
          <Button variant="outline" onClick={() => setRejectDialogOpen(true)}>
            <XCircle className="mr-2 h-4 w-4" />
            Remove Approval
          </Button>
        )}
      </div>

      {/* Approval Banner */}
      {pitch.is_approved && pitch.approved_by && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800">This pitch has been approved</p>
            <p className="text-sm text-green-700">
              Approved by {pitch.approved_by.full_name} on{' '}
              {pitch.approved_at && formatDate(pitch.approved_at)}
            </p>
          </div>
        </div>
      )}

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

          {/* Progress section */}
          <div className="space-y-3 mb-6 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion</p>
                <p className="text-2xl font-bold">{pitch.completion_percentage}%</p>
              </div>
              {pitch.expected_end_date && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Expected End</p>
                  <p className="font-medium">{formatDate(pitch.expected_end_date)}</p>
                </div>
              )}
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
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={form.watch('status')}
              onChange={(v) => form.setValue('status', v as PitchStatus)}
              options={STATUS_OPTIONS}
            />
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

        {/* Requirements Tab */}
        <TabsContent value="requirements" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              onClick={() =>
                navigate(`/requirements/new?setId=${pitch.set_id}&pitchId=${pitchId}`)
              }
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              Add Requirement
            </Button>
          </div>
          {pitchRequirements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No requirements linked to this pitch</p>
                <Button
                  className="mt-4"
                  onClick={() =>
                    navigate(`/requirements/new?setId=${pitch.set_id}&pitchId=${pitchId}`)
                  }
                >
                  Create First Requirement
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
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pitchRequirements.map((req) => (
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
                          <Badge variant="outline">{req.requirement_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(req.status)} variant="outline">
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{req.assigned_to?.full_name || '—'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/requirements/${req.id}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
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

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Pitch</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this pitch? This will mark it as reviewed and
              approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approvePitch.isPending}>
              {approvePitch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve Pitch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Approval</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the approval from this pitch? It will require
              re-approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectPitch.isPending}>
              {rejectPitch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
