import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLead, useLeadContacts, useLeadMutations } from '@/hooks/useLeads'
import { useAllContacts, useCreateContact } from '@/hooks/useContacts'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuSeparator,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  ArrowLeft,
  Edit,
  X,
  Save,
  Loader2,
  Target,
  Users,
  FileText,
  MessageSquare,
  DollarSign,
  Calendar,
  Building2,
  Phone,
  Plus,
  MoreVertical,
  Star,
  UserCheck,
  Trash2,
  ArrowRightCircle,
  ChevronDown,
  Link as LinkIcon,
  UserPlus,
} from 'lucide-react'
import { formatDate, formatCurrency, REFERRAL_SOURCE_OPTIONS, INDUSTRY_OPTIONS } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentUpload, NotesPanel } from '@/components/shared'
import type { LeadStatus, CompanySize, ContactRole } from '@/types/database'
import { CONTACT_ROLE_OPTIONS } from '@/lib/utils'

// Lead form schema
const leadFormSchema = z.object({
  lead_name: z.string().min(1, 'Lead name is required'),
  description: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional(),
  estimated_value: z.number().optional(),
  estimated_close_date: z.string().optional(),
  source: z.string().optional(),
  lead_owner_id: z.string().optional(),
  notes: z.string().optional(),
})

type LeadFormValues = z.infer<typeof leadFormSchema>

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', variant: 'secondary' as const },
  { value: 'contacted', label: 'Contacted', variant: 'secondary' as const },
  { value: 'qualified', label: 'Qualified', variant: 'default' as const },
  { value: 'proposal', label: 'Proposal', variant: 'default' as const },
  { value: 'negotiation', label: 'Negotiation', variant: 'outline' as const },
  { value: 'won', label: 'Won', variant: 'default' as const },
  { value: 'lost', label: 'Lost', variant: 'secondary' as const },
]

const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '500+', label: '500+ employees' },
]

export function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: lead, isLoading } = useLead(leadId!)
  const { data: contacts, isLoading: contactsLoading } = useLeadContacts(leadId!)
  const { data: allContacts } = useAllContacts()
  const { data: users } = useTenantUsers()
  const { updateLead, linkContact, unlinkContact, setPrimaryContact, convertToClient } =
    useLeadMutations()
  const createContact = useCreateContact()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [linkContactDialogOpen, setLinkContactDialogOpen] = useState(false)
  const [createContactDialogOpen, setCreateContactDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [newContact, setNewContact] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role_at_lead: '',
    is_decision_maker: false,
  })
  const [convertOptions, setConvertOptions] = useState({
    client_name: '',
    relationship_manager_id: '',
    copy_contacts: true,
    copy_documents: true,
  })

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      lead_name: lead?.lead_name || '',
      description: lead?.description || '',
      status: lead?.status || 'new',
      industry: lead?.industry || '',
      website: lead?.website || '',
      phone: lead?.phone || '',
      email: lead?.email || '',
      company_size: lead?.company_size as CompanySize | undefined,
      estimated_value: lead?.estimated_value || undefined,
      estimated_close_date: lead?.estimated_close_date?.split('T')[0] || '',
      source: lead?.source || '',
      lead_owner_id: lead?.lead_owner_id || '',
      notes: lead?.notes || '',
    },
  })

  // Build user options
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

  // Build contact options for linking
  const availableContactOptions = useMemo(() => {
    const linkedIds = new Set(contacts?.map((c) => c.contact_id) || [])
    return (
      allContacts
        ?.filter((c) => !linkedIds.has(c.id))
        .map((c) => ({
          value: c.id,
          label: `${c.first_name} ${c.last_name}`,
          description: c.email || c.phone || undefined,
        })) || []
    )
  }, [allContacts, contacts])

  // Reset form when lead data loads
  useEffect(() => {
    if (lead && !isEditing) {
      form.reset({
        lead_name: lead.lead_name,
        description: lead.description || '',
        status: lead.status,
        industry: lead.industry || '',
        website: lead.website || '',
        phone: lead.phone || '',
        email: lead.email || '',
        company_size: lead.company_size as CompanySize | undefined,
        estimated_value: lead.estimated_value || undefined,
        estimated_close_date: lead.estimated_close_date?.split('T')[0] || '',
        source: lead.source || '',
        lead_owner_id: lead.lead_owner_id || '',
        notes: lead.notes || '',
      })
      setConvertOptions((prev) => ({
        ...prev,
        client_name: lead.lead_name,
      }))
    }
  }, [lead?.id, isEditing])

  // Auto-enter edit mode
  useEffect(() => {
    if (shouldEditOnLoad && lead && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, lead])

  const handleSave = async (data: LeadFormValues) => {
    if (!leadId) return
    setIsSaving(true)
    try {
      await updateLead.mutateAsync({
        id: leadId,
        lead_name: data.lead_name,
        description: data.description,
        status: data.status as LeadStatus,
        industry: data.industry,
        website: data.website,
        phone: data.phone,
        email: data.email || undefined,
        company_size: data.company_size as CompanySize | undefined,
        estimated_value: data.estimated_value,
        estimated_close_date: data.estimated_close_date || undefined,
        source: data.source as any,
        lead_owner_id: data.lead_owner_id || undefined,
        notes: data.notes,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (lead) {
      form.reset({
        lead_name: lead.lead_name,
        description: lead.description || '',
        status: lead.status,
        industry: lead.industry || '',
        website: lead.website || '',
        phone: lead.phone || '',
        email: lead.email || '',
        company_size: lead.company_size as CompanySize | undefined,
        estimated_value: lead.estimated_value || undefined,
        estimated_close_date: lead.estimated_close_date?.split('T')[0] || '',
        source: lead.source || '',
        lead_owner_id: lead.lead_owner_id || '',
        notes: lead.notes || '',
      })
    }
    setIsEditing(false)
  }

  const handleLinkContact = async () => {
    if (!selectedContactId || !leadId) return
    await linkContact.mutateAsync({
      lead_id: leadId,
      contact_id: selectedContactId,
    })
    setLinkContactDialogOpen(false)
    setSelectedContactId('')
  }

  const handleCreateAndLinkContact = async () => {
    if (!newContact.first_name || !newContact.last_name || !leadId) return

    try {
      // Create the contact first
      const createdContact = await createContact.mutateAsync({
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || undefined,
        phone: newContact.phone || undefined,
        role: newContact.role_at_lead as ContactRole || undefined,
      })

      // Link the contact to this lead
      // Set as primary if this is the first contact
      const isFirstContact = !contacts || contacts.length === 0
      await linkContact.mutateAsync({
        lead_id: leadId,
        contact_id: createdContact.id,
        is_primary: isFirstContact,
        is_decision_maker: newContact.is_decision_maker,
        role_at_lead: newContact.role_at_lead || undefined,
      })

      // Reset form and close dialog
      setCreateContactDialogOpen(false)
      setNewContact({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role_at_lead: '',
        is_decision_maker: false,
      })
    } catch {
      // Error handling is done by the mutations
    }
  }

  const handleConvertToClient = async () => {
    if (!leadId) return
    try {
      const result = await convertToClient.mutateAsync({
        leadId,
        options: convertOptions,
      })
      setConvertDialogOpen(false)
      // Navigate to the converted client using the returned data
      // result contains the new client_id from the mutation
      if (result?.client_id) {
        navigate(`/clients/${result.client_id}`)
      } else {
        navigate('/clients')
      }
    } catch {
      // Error handled by mutation onError
    }
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

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="link" onClick={() => navigate('/leads')}>
          Back to Pipeline
        </Button>
      </div>
    )
  }

  const isConverted = lead.status === 'won' && lead.converted_to_client_id
  const canConvert = lead.status === 'won' && !lead.converted_to_client_id

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Sales Pipeline', href: '/leads' },
          { label: lead.lead_name, displayId: lead.lead_id_display || lead.display_id },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('lead_name') : lead.lead_name}
              {lead.lead_id_display && (
                <span className="text-muted-foreground"> | {lead.lead_id_display}</span>
              )}
            </h1>
            <Badge
              variant={
                STATUS_OPTIONS.find((s) => s.value === lead.status)?.variant || 'secondary'
              }
            >
              {lead.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {lead.estimated_value && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(lead.estimated_value)}
              </span>
            )}
            {lead.estimated_close_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Expected: {formatDate(lead.estimated_close_date)}
              </span>
            )}
            {lead.lead_owner && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {lead.lead_owner.full_name}
              </span>
            )}
          </div>
        </div>
        {canConvert && (
          <Button onClick={() => setConvertDialogOpen(true)}>
            <ArrowRightCircle className="mr-2 h-4 w-4" />
            Convert to Client
          </Button>
        )}
        {isConverted && (
          <Button variant="outline" onClick={() => navigate(`/clients/${lead.converted_to_client_id}`)}>
            <Building2 className="mr-2 h-4 w-4" />
            View Client
          </Button>
        )}
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

          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ViewEditField
              type="text"
              label="Lead Name"
              required
              isEditing={isEditing}
              value={form.watch('lead_name')}
              onChange={(v) => form.setValue('lead_name', v)}
              error={form.formState.errors.lead_name?.message}
            />
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={form.watch('status')}
              onChange={(v) => form.setValue('status', v as LeadStatus)}
              options={STATUS_OPTIONS}
            />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Estimated Value</p>
              {isEditing ? (
                <Input
                  type="number"
                  value={form.watch('estimated_value') ?? ''}
                  onChange={(e) =>
                    form.setValue('estimated_value', e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              ) : (
                <p className="font-medium">
                  {lead.estimated_value ? formatCurrency(lead.estimated_value) : '—'}
                </p>
              )}
            </div>
            <ViewEditField
              type="date"
              label="Expected Close"
              isEditing={isEditing}
              value={form.watch('estimated_close_date') || ''}
              onChange={(v) => form.setValue('estimated_close_date', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Target className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Contacts
            {contacts && contacts.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {contacts.length}
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
          {/* Company Info */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Company Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <ViewEditField
                  type="select"
                  label="Industry"
                  isEditing={isEditing}
                  value={form.watch('industry') || ''}
                  onChange={(v) => form.setValue('industry', v)}
                  options={[...INDUSTRY_OPTIONS]}
                  searchable
                  clearable
                />
                <ViewEditField
                  type="select"
                  label="Company Size"
                  isEditing={isEditing}
                  value={form.watch('company_size') || ''}
                  onChange={(v) => form.setValue('company_size', v as CompanySize)}
                  options={COMPANY_SIZE_OPTIONS}
                  searchable
                  clearable
                />
                <ViewEditField
                  type="text"
                  label="Website"
                  isEditing={isEditing}
                  value={form.watch('website') || ''}
                  onChange={(v) => form.setValue('website', v)}
                />
                <ViewEditField
                  type="select"
                  label="Source"
                  isEditing={isEditing}
                  value={form.watch('source') || ''}
                  onChange={(v) => form.setValue('source', v)}
                  options={[...REFERRAL_SOURCE_OPTIONS]}
                  searchable
                  clearable
                />
              </div>
            </CardContent>
          </Card>

          {/* Primary Contact */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Primary Contact
              </h3>
              {(() => {
                const primaryContact = contacts?.find((c) => c.is_primary)?.contacts
                if (primaryContact) {
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Name</p>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {primaryContact.first_name?.[0]}
                              {primaryContact.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {primaryContact.first_name} {primaryContact.last_name}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                        <p className="font-medium">{primaryContact.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Phone</p>
                        <p className="font-medium">{primaryContact.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Role</p>
                        <p className="font-medium capitalize">
                          {contacts?.find((c) => c.is_primary)?.role_at_lead || primaryContact.role || '—'}
                        </p>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No primary contact linked</p>
                    <Button
                      variant="link"
                      className="mt-2"
                      onClick={() => setLinkContactDialogOpen(true)}
                    >
                      Link a contact
                    </Button>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Direct Contact Info (fallback) */}
          {(form.watch('phone') || form.watch('email')) && (
            <Card className="card-carbon">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  Direct Contact (Lead-specific)
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <ViewEditField
                    type="text"
                    label="Phone"
                    isEditing={isEditing}
                    value={form.watch('phone') || ''}
                    onChange={(v) => form.setValue('phone', v)}
                  />
                  <ViewEditField
                    type="text"
                    label="Email"
                    isEditing={isEditing}
                    value={form.watch('email') || ''}
                    onChange={(v) => form.setValue('email', v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Owner & Notes */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Assignment & Notes
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Lead Owner</p>
                  {isEditing ? (
                    <SearchableSelect
                      options={userOptions}
                      value={form.watch('lead_owner_id') || ''}
                      onValueChange={(v) => form.setValue('lead_owner_id', v || '')}
                      placeholder="Select owner..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  ) : lead.lead_owner ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={lead.lead_owner.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {lead.lead_owner.full_name
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span>{lead.lead_owner.full_name}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
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
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={lead.created_at}
                  created_by={lead.created_by || ''}
                  updated_at={lead.updated_at}
                  updated_by={lead.updated_by}
                  creator={lead.creator}
                  updater={lead.updater}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lost Info (if applicable) */}
          {lead.status === 'lost' && (
            <Card className="card-carbon border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4 text-red-700">Lost Details</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lost Reason</p>
                    <p className="capitalize">{lead.lost_reason?.replace('_', ' ') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Notes</p>
                    <p>{lead.lost_reason_notes || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-6">
          <div className="flex justify-end mb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Contact
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateContactDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create New Contact
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLinkContactDialogOpen(true)}>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Link Existing Contact
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {contactsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !contacts || contacts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No contacts linked yet</p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => setCreateContactDialogOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Contact
                  </Button>
                  <Button variant="outline" onClick={() => setLinkContactDialogOpen(true)}>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Link Existing
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((lc) => (
                      <TableRow key={lc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {lc.contacts?.first_name?.[0]}
                                {lc.contacts?.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {lc.contacts?.first_name} {lc.contacts?.last_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{lc.contacts?.email || '—'}</TableCell>
                        <TableCell>{lc.contacts?.phone || '—'}</TableCell>
                        <TableCell className="capitalize">
                          {lc.role_at_lead || lc.contacts?.role || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {lc.is_primary && (
                              <Badge variant="default" className="text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                            {lc.is_decision_maker && (
                              <Badge variant="secondary" className="text-xs">
                                <UserCheck className="h-3 w-3 mr-1" />
                                Decision Maker
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!lc.is_primary && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPrimaryContact.mutate({
                                      leadId: leadId!,
                                      contactId: lc.contact_id,
                                    })
                                  }
                                >
                                  <Star className="mr-2 h-4 w-4" />
                                  Set as Primary
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  unlinkContact.mutate({ id: lc.id, leadId: leadId! })
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Unlink
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
            entityType="lead"
            entityId={leadId!}
            title="Lead Documents"
            description="Upload and manage files for this lead"
            maxHeight="500px"
            allowMultiple
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <NotesPanel
            entityType="lead"
            entityId={leadId!}
            title="Lead Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>
      </Tabs>

      {/* Create Contact Dialog */}
      <Dialog open={createContactDialogOpen} onOpenChange={setCreateContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Contact</DialogTitle>
            <DialogDescription>
              Create a new contact and link them to this lead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={newContact.first_name}
                  onChange={(e) =>
                    setNewContact((prev) => ({ ...prev, first_name: e.target.value }))
                  }
                  placeholder="First name..."
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={newContact.last_name}
                  onChange={(e) =>
                    setNewContact((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                  placeholder="Last name..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newContact.phone}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Role at Lead</Label>
              <SearchableSelect
                options={[...CONTACT_ROLE_OPTIONS]}
                value={newContact.role_at_lead}
                onValueChange={(v) =>
                  setNewContact((prev) => ({ ...prev, role_at_lead: v || '' }))
                }
                placeholder="Select role..."
                searchPlaceholder="Search roles..."
                emptyMessage="No roles found."
                clearable
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_decision_maker"
                checked={newContact.is_decision_maker}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, is_decision_maker: e.target.checked }))
                }
                className="h-4 w-4"
              />
              <Label htmlFor="is_decision_maker" className="cursor-pointer">
                Decision Maker
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateAndLinkContact}
              disabled={
                !newContact.first_name ||
                !newContact.last_name ||
                createContact.isPending ||
                linkContact.isPending
              }
            >
              {(createContact.isPending || linkContact.isPending) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create & Link Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Contact Dialog */}
      <Dialog open={linkContactDialogOpen} onOpenChange={setLinkContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Contact to Lead</DialogTitle>
            <DialogDescription>Select an existing contact to link to this lead.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Contact</Label>
            <SearchableSelect
              options={availableContactOptions}
              value={selectedContactId}
              onValueChange={(v) => setSelectedContactId(v || '')}
              placeholder="Select contact..."
              searchPlaceholder="Search contacts..."
              emptyMessage="No available contacts."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkContact} disabled={!selectedContactId || linkContact.isPending}>
              {linkContact.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Link Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Client Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Client</DialogTitle>
            <DialogDescription>
              Convert this won lead into a client. This will create a new client record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input
                value={convertOptions.client_name}
                onChange={(e) =>
                  setConvertOptions((prev) => ({ ...prev, client_name: e.target.value }))
                }
                placeholder="Client name..."
              />
            </div>
            <div className="space-y-2">
              <Label>Relationship Manager</Label>
              <SearchableSelect
                options={userOptions}
                value={convertOptions.relationship_manager_id}
                onValueChange={(v) =>
                  setConvertOptions((prev) => ({ ...prev, relationship_manager_id: v || '' }))
                }
                placeholder="Select manager..."
                searchPlaceholder="Search team..."
                emptyMessage="No team members found."
                clearable
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={convertOptions.copy_contacts}
                  onChange={(e) =>
                    setConvertOptions((prev) => ({ ...prev, copy_contacts: e.target.checked }))
                  }
                />
                Copy contacts
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={convertOptions.copy_documents}
                  onChange={(e) =>
                    setConvertOptions((prev) => ({ ...prev, copy_documents: e.target.checked }))
                  }
                />
                Copy documents
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToClient} disabled={convertToClient.isPending}>
              {convertToClient.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Convert to Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
