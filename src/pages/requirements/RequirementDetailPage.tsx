import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRequirement, useRequirementMutations } from '@/hooks/useRequirements'
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
} from 'lucide-react'
import { formatDate, getStatusColor, URGENCY_OPTIONS, IMPORTANCE_OPTIONS, calculateEisenhowerPriority, getPriorityLabel, getPriorityColor } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DiscussionsPanel, DocumentUpload, NotesPanel } from '@/components/shared'
import type {
  RequirementStatus,
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

// Requirement form schema - using new date field names
const requirementFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']),
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
})

type RequirementFormValues = z.infer<typeof requirementFormSchema>

export function RequirementDetailPage() {
  const { requirementId } = useParams<{ requirementId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: requirement, isLoading } = useRequirement(requirementId!)
  const { data: tenantUsers } = useTenantUsers()
  const { updateRequirement } = useRequirementMutations()

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Requirement form
  const form = useForm<RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: {
      title: requirement?.title || '',
      description: requirement?.description || '',
      status: requirement?.status || 'open',
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
    },
  })

  // Reset form when requirement data loads
  useEffect(() => {
    if (requirement && !isEditing) {
      form.reset({
        title: requirement.title,
        description: requirement.description || '',
        status: requirement.status,
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
      })
    }
  }, [requirement?.id, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && requirement && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, requirement])

  const handleSaveRequirement = async (data: RequirementFormValues) => {
    if (!requirementId) return
    setIsSaving(true)
    try {
      await updateRequirement.mutateAsync({
        id: requirementId,
        title: data.title,
        description: data.description,
        status: data.status as RequirementStatus,
        requirement_type: data.requirement_type as RequirementType,
        is_task: data.is_task,
        urgency: data.urgency as UrgencyLevel,
        importance: data.importance as ImportanceLevel,
        requires_document: data.requires_document,
        requires_review: data.requires_review,
        review_status: data.review_status as ReviewStatus,
        assigned_to_id: data.assigned_to_id || undefined,
        reviewer_id: data.reviewer_id || undefined,
        expected_due_date: data.expected_due_date || undefined,
        actual_due_date: data.actual_due_date || undefined,
        completed_date: data.completed_date || undefined,
        estimated_hours: data.estimated_hours,
        actual_hours: data.actual_hours,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      title: requirement?.title || '',
      description: requirement?.description || '',
      status: requirement?.status || 'open',
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
      {/* Breadcrumbs: Client > Project > Set > Requirement */}
      <Breadcrumbs
        items={[
          {
            label: requirement.sets?.projects?.clients?.name || 'Client',
            href: requirement.sets?.projects?.clients?.id
              ? `/clients/${requirement.sets.projects.clients.id}`
              : '/clients',
          },
          {
            label: requirement.sets?.projects?.name || 'Project',
            href: requirement.sets?.project_id
              ? `/projects/${requirement.sets.project_id}`
              : undefined,
          },
          {
            label: requirement.sets?.name || 'Set',
            href: requirement.set_id ? `/sets/${requirement.set_id}` : undefined,
          },
          {
            label: requirement.title,
            displayId: requirement.display_id,
          },
        ]}
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
            <Badge className={getStatusColor(requirement.status)}>{requirement.status}</Badge>
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
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={form.watch('status')}
              onChange={(v) => form.setValue('status', v as RequirementStatus)}
              options={[
                { value: 'open', label: 'Open', variant: 'secondary' },
                { value: 'in_progress', label: 'In Progress', variant: 'default' },
                { value: 'blocked', label: 'Blocked', variant: 'outline' },
                { value: 'completed', label: 'Completed', variant: 'default' },
                { value: 'cancelled', label: 'Cancelled', variant: 'secondary' },
              ]}
            />
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
          {/* Parent Info Section */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-muted-foreground" />
                Requirement Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Set</p>
                  <Link
                    to={`/sets/${requirement.set_id}`}
                    className="font-medium hover:underline flex items-center gap-1"
                  >
                    <Layers className="h-3 w-3" />
                    {requirement.sets?.name || '—'}
                  </Link>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Project</p>
                  <Link
                    to={`/projects/${requirement.sets?.project_id}`}
                    className="font-medium hover:underline flex items-center gap-1"
                  >
                    <FolderKanban className="h-3 w-3" />
                    {requirement.sets?.projects?.name || '—'}
                  </Link>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Client</p>
                  <Link
                    to={`/clients/${requirement.sets?.projects?.clients?.id}`}
                    className="font-medium hover:underline flex items-center gap-1"
                  >
                    <Building2 className="h-3 w-3" />
                    {requirement.sets?.projects?.clients?.name || '—'}
                  </Link>
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
          <DocumentUpload
            entityType="requirement"
            entityId={requirementId!}
            title="Requirement Documents"
            description="Upload files and attachments"
            allowMultiple={true}
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
