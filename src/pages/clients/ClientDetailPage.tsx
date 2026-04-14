import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClient, useClientMutations } from '@/hooks/useClients'
import { useTenantUsers } from '@/hooks/useTenant'
import { useProjectsByClient } from '@/hooks/useProjects'
import { useContacts, useContactMutations, useUnlinkedContacts } from '@/hooks/useContacts'
import { useSetsByClient } from '@/hooks/useSets'
import { usePhasesByClient } from '@/hooks/usePhases'
import { useRequirementsByClient } from '@/hooks/useRequirements'
import { usePitchesByClient } from '@/hooks/usePitches'
import { useCompetitorsByClient } from '@/hooks/useCompetitors'
import { useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Building2,
  FolderKanban,
  Users,
  FileText,
  Edit,
  Plus,
  Star,
  Trash2,
  Loader2,
  MoreVertical,
  Save,
  X,
  ExternalLink,
  Layers,
  Link2,
  Unlink,
  ChevronDown,
  CheckSquare,
  Presentation,
  MessageSquare,
  Swords,
  ChevronUp,
  MapPin,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor, getComputedStatusColor, getComputedStatusLabel, INDUSTRY_OPTIONS, CONTACT_ROLE_OPTIONS, REFERRAL_SOURCE_OPTIONS, calculateEisenhowerPriority as calcPriority, getPriorityColor as getPrioColor } from '@/lib/utils'
import { computeDisplayStatus, computeKeyStartDate, computeKeyEndDate, STATUS_LABELS, STATUS_COLORS } from '@/utils/statusUtils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DocumentsTab, NotesPanel, DiscussionsPanel, RequirementsTabbedPanel } from '@/components/shared'
import type { Contact, CreateContactInput, UpdateContactInput, ContactRole, IndustryType, ReferralSource } from '@/types/database'

// Client form schema
const clientFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company_name: z.string().min(1, 'Company name is required'),
  overview: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(['onboarding', 'active', 'inactive', 'prospective']),
  portal_enabled: z.boolean(),
  relationship_manager_id: z.string().optional(),
  referral_source: z.string().optional(),
})

type ClientFormValues = z.infer<typeof clientFormSchema>

// Contact form schema (for editing global contact info)
const contactFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  relationship: z.string().optional(),
  // Address fields
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

// Relationship form schema (for editing client-contact relationship)
const relationshipFormSchema = z.object({
  role: z.string().optional(),
  is_primary: z.boolean(),
})

type RelationshipFormValues = z.infer<typeof relationshipFormSchema>

const THREAT_COLORS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-gray-400 text-white',
}

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Guard: clientId is required for this page
  const safeClientId = clientId ?? ''

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const { data: client, isLoading: clientLoading } = useClient(safeClientId)
  const { data: projects, isLoading: projectsLoading } = useProjectsByClient(safeClientId)
  const { data: contacts, isLoading: contactsLoading } = useContacts(safeClientId)
  const { data: clientSets, isLoading: setsLoading } = useSetsByClient(safeClientId)
  const { data: clientPhases, isLoading: phasesLoading } = usePhasesByClient(safeClientId)
  const { data: clientRequirements, isLoading: requirementsLoading } = useRequirementsByClient(safeClientId)
  const { data: clientPitches, isLoading: pitchesLoading } = usePitchesByClient(safeClientId)
  const { data: competitorsByClient, isLoading: competitorsLoading } = useCompetitorsByClient(safeClientId)
  const { data: tenantUsers } = useTenantUsers()
  const { data: unlinkedContacts, isLoading: unlinkedLoading } = useUnlinkedContacts(safeClientId)
  const { updateClient } = useClientMutations()
  const { createContact, updateContact, deleteContact, setPrimaryContact, linkToClient, unlinkFromClient, updateRelationship } = useContactMutations(safeClientId)
  const { openCreateModal } = useUIStore()

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Contact dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
  const [linkContactDialogOpen, setLinkContactDialogOpen] = useState(false)
  const [selectedContactToLink, setSelectedContactToLink] = useState<string>('')
  const [unlinkContactId, setUnlinkContactId] = useState<string | null>(null)
  const [addressSectionOpen, setAddressSectionOpen] = useState(false)

  // Relationship dialog state (for editing is_primary/role on client_contacts)
  const [relationshipDialogOpen, setRelationshipDialogOpen] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<Contact | null>(null)

  // Client form
  const clientForm = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name || '',
      company_name: client?.company_name || '',
      overview: client?.overview || '',
      industry: client?.industry || '',
      status: client?.status || 'active',
      portal_enabled: client?.portal_enabled || false,
      relationship_manager_id: client?.relationship_manager_id || '',
      referral_source: client?.referral_source || '',
    },
  })

  // Contact form (for global contact info editing)
  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      relationship: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      country: '',
      postal_code: '',
    },
  })

  // Relationship form (for editing client-contact link properties)
  const relationshipForm = useForm<RelationshipFormValues>({
    resolver: zodResolver(relationshipFormSchema),
    defaultValues: {
      role: '',
      is_primary: false,
    },
  })

  // Reset form when client data loads
  useEffect(() => {
    if (client && !isEditing) {
      clientForm.reset({
        name: client.name,
        company_name: client.company_name,
        overview: client.overview || '',
        industry: client.industry || '',
        status: client.status,
        portal_enabled: client.portal_enabled,
        relationship_manager_id: client.relationship_manager_id || '',
        referral_source: client.referral_source || '',
      })
    }
  }, [client?.id, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && client && !isEditing) {
      setIsEditing(true)
      // Clear the query param after entering edit mode
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, client])

  const handleSaveClient = async (data: ClientFormValues) => {
    if (!safeClientId) return
    setIsSaving(true)
    try {
      await updateClient.mutateAsync({
        id: safeClientId,
        name: data.name,
        company_name: data.company_name,
        overview: data.overview,
        industry: data.industry as IndustryType | undefined,
        status: data.status,
        portal_enabled: data.portal_enabled,
        relationship_manager_id: data.relationship_manager_id || undefined,
        referral_source: data.referral_source as ReferralSource | undefined,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    clientForm.reset({
      name: client?.name || '',
      company_name: client?.company_name || '',
      overview: client?.overview || '',
      industry: client?.industry || '',
      status: client?.status || 'active',
      portal_enabled: client?.portal_enabled || false,
      relationship_manager_id: client?.relationship_manager_id || '',
      referral_source: client?.referral_source || '',
    })
    setIsEditing(false)
  }

  // Open dialog for editing global contact info (name, email, phone)
  const handleOpenContactDialog = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact)
      contactForm.reset({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || '',
        phone: contact.phone || '',
        relationship: contact.relationship || '',
        address_line1: contact.address_line1 || '',
        address_line2: contact.address_line2 || '',
        city: contact.city || '',
        state: contact.state || '',
        country: contact.country || '',
        postal_code: contact.postal_code || '',
      })
    } else {
      setEditingContact(null)
      contactForm.reset({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        relationship: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        country: '',
        postal_code: '',
      })
    }
    setContactDialogOpen(true)
  }

  // Open dialog for editing client-contact relationship (role, is_primary)
  const handleOpenRelationshipDialog = (contact: Contact) => {
    setEditingRelationship(contact)
    relationshipForm.reset({
      role: contact.role || '',
      is_primary: (contact as { is_primary?: boolean }).is_primary ?? false,
    })
    setRelationshipDialogOpen(true)
  }

  // Save global contact info (updates contacts table)
  const handleSaveContact = async (data: ContactFormValues) => {
    if (editingContact) {
      const input: UpdateContactInput = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        relationship: data.relationship || undefined,
        address_line1: data.address_line1 || undefined,
        address_line2: data.address_line2 || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        country: data.country || undefined,
        postal_code: data.postal_code || undefined,
      }
      await updateContact.mutateAsync({ id: editingContact.id, ...input })
    } else {
      const input: CreateContactInput = {
        client_id: safeClientId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        relationship: data.relationship || undefined,
        is_primary: contacts?.length === 0, // First contact is primary by default
        address_line1: data.address_line1 || undefined,
        address_line2: data.address_line2 || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        country: data.country || undefined,
        postal_code: data.postal_code || undefined,
      }
      await createContact.mutateAsync(input)
    }
    setContactDialogOpen(false)
  }

  // Save relationship data (updates client_contacts table for is_primary AND role)
  // Role is now stored in client_contacts (client-specific), not in contacts table (global)
  const handleSaveRelationship = async (data: RelationshipFormValues) => {
    if (!editingRelationship) return

    // Use updateRelationship which only updates client_contacts table (not contacts)
    await updateRelationship.mutateAsync({
      contactId: editingRelationship.id,
      clientId: safeClientId,
      role: (data.role as ContactRole) || undefined,
      is_primary: data.is_primary,
    })

    setRelationshipDialogOpen(false)
  }

  const handleDeleteContact = async () => {
    if (!deleteContactId) return
    await deleteContact.mutateAsync(deleteContactId)
    setDeleteContactId(null)
  }

  const handleSetPrimary = async (contactId: string) => {
    await setPrimaryContact.mutateAsync({ id: contactId, clientId: safeClientId })
  }

  const handleLinkContact = async () => {
    if (!selectedContactToLink) return
    await linkToClient.mutateAsync({
      client_id: safeClientId,
      contact_id: selectedContactToLink,
      is_primary: contacts?.length === 0, // First contact is primary by default
    })
    setLinkContactDialogOpen(false)
    setSelectedContactToLink('')
  }

  const handleUnlinkContact = async () => {
    if (!unlinkContactId) return
    await unlinkFromClient.mutateAsync({ clientId: safeClientId, contactId: unlinkContactId })
    setUnlinkContactId(null)
  }

  const primaryContact = contacts?.find((c) => c.is_primary)

  if (clientLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Client not found</p>
        <Link to="/clients">
          <Button variant="link">Back to Clients</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Clients', href: '/clients' },
          { label: client.name, displayId: client.display_id },
        ]}
      />

      {/* Header - Title is non-editable, shows Name | ID format */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? clientForm.watch('name') : client.name}
              {client.display_id && <span className="text-muted-foreground"> | ID: {client.display_id}</span>}
            </h1>
            <Badge variant={client.status === 'active' ? 'default' : client.status === 'onboarding' ? 'info' : 'secondary'}>
              {client.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{client.company_name}</p>
        </div>
      </div>

      {/* Header Info Card - Key fields only: Name, Industry, Status, Relationship Manager */}
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
                  onClick={clientForm.handleSubmit(handleSaveClient)}
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

          {/* Header fields: Name, Industry, Status, Relationship Manager only */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ViewEditField
              type="text"
              label="Client Name"
              required
              isEditing={isEditing}
              value={clientForm.watch('name')}
              onChange={(v) => clientForm.setValue('name', v)}
              error={clientForm.formState.errors.name?.message}
            />
            <ViewEditField
              type="select"
              label="Industry"
              isEditing={isEditing}
              value={clientForm.watch('industry') || ''}
              onChange={(v) => clientForm.setValue('industry', v)}
              options={INDUSTRY_OPTIONS}
              placeholder="Select industry"
              searchable
            />
            <ViewEditField
              type="badge"
              label="Status"
              isEditing={isEditing}
              value={clientForm.watch('status')}
              onChange={(v) => clientForm.setValue('status', v as 'active' | 'inactive' | 'onboarding')}
              options={[
                { value: 'onboarding', label: 'Onboarding', variant: 'outline' },
                { value: 'active', label: 'Active', variant: 'default' },
                { value: 'inactive', label: 'Inactive', variant: 'secondary' },
                { value: 'prospective', label: 'Prospective', variant: 'outline' },
              ]}
            />
            <ViewEditField
              type="select"
              label="Relationship Manager"
              isEditing={isEditing}
              value={clientForm.watch('relationship_manager_id') || ''}
              onChange={(v) => clientForm.setValue('relationship_manager_id', v)}
              options={tenantUsers?.filter(u => u.user_profiles?.id).map((u) => ({
                value: u.user_profiles!.id,
                label: u.user_profiles!.full_name || 'Unknown User',
              })) || []}
              placeholder="Select manager"
              searchable
              clearable
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
          <TabsTrigger value="projects" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
            {projects && projects.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projects.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="phases" className="gap-2">
            <Layers className="h-4 w-4" />
            Phases
            {clientPhases && clientPhases.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {clientPhases.length}
              </Badge>
            )}
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
          <TabsTrigger value="sets" className="gap-2">
            <Layers className="h-4 w-4" />
            Sets
            {clientSets && clientSets.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {clientSets.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pitches" className="gap-2">
            <Presentation className="h-4 w-4" />
            Pitches
            {clientPitches && clientPitches.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {clientPitches.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Requirements
            {clientRequirements && clientRequirements.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {clientRequirements.length}
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
            <FileText className="h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="competitors" className="gap-2">
            <Swords className="h-4 w-4" />
            Competitors
            {competitorsByClient && competitorsByClient.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {competitorsByClient.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Details Tab - Editable sections using ViewEditField */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Primary Contact Section - Read-only summary, edit in Contacts tab */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Primary Contact
              </h3>
              {primaryContact ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Name</p>
                    <p className="font-medium">{primaryContact.first_name} {primaryContact.last_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                    <p>{primaryContact.role ? CONTACT_ROLE_OPTIONS.find(o => o.value === primaryContact.role)?.label || primaryContact.role : '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <p>{primaryContact.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <p>{primaryContact.phone || '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No primary contact set. Add a contact in the Contacts tab.</p>
              )}
            </CardContent>
          </Card>

          {/* Business Info Section - Editable fields */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Business Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <ViewEditField
                  type="text"
                  label="Company Name"
                  required
                  isEditing={isEditing}
                  value={clientForm.watch('company_name')}
                  onChange={(v) => clientForm.setValue('company_name', v)}
                  error={clientForm.formState.errors.company_name?.message}
                />
                <ViewEditField
                  type="select"
                  label="Referral Source"
                  isEditing={isEditing}
                  value={clientForm.watch('referral_source') || ''}
                  onChange={(v) => clientForm.setValue('referral_source', v)}
                  options={REFERRAL_SOURCE_OPTIONS}
                  placeholder="Select source"
                  searchable
                  clearable
                />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Client Since</p>
                  <p>{formatDate(client.created_at)}</p>
                </div>
              </div>
              <div className="mt-4">
                <ViewEditField
                  type="textarea"
                  label="Overview"
                  isEditing={isEditing}
                  value={clientForm.watch('overview') || ''}
                  onChange={(v) => clientForm.setValue('overview', v)}
                  placeholder="Brief description of the client..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Settings Section - Editable */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Settings
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <ViewEditField
                  type="switch"
                  label="Client Portal"
                  isEditing={isEditing}
                  value={clientForm.watch('portal_enabled')}
                  onChange={(v) => clientForm.setValue('portal_enabled', v)}
                  description="Allow client to access the portal"
                />
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={client.created_at}
                  created_by={client.created_by}
                  updated_at={client.updated_at}
                  updated_by={client.updated_by}
                  creator={client.creator}
                  updater={client.updater}
                />
              </div>
            </CardContent>
          </Card>
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
                <DropdownMenuItem onClick={() => handleOpenContactDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Contact
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLinkContactDialogOpen(true)}
                  disabled={!unlinkedContacts || unlinkedContacts.length === 0}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Existing Contact
                  {unlinkedContacts && unlinkedContacts.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                      {unlinkedContacts.length}
                    </Badge>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {contactsLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px] text-center">Primary</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : contacts?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No contacts yet</p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => handleOpenContactDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create New
                  </Button>
                  {unlinkedContacts && unlinkedContacts.length > 0 && (
                    <Button variant="outline" onClick={() => setLinkContactDialogOpen(true)}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Link Existing ({unlinkedContacts.length})
                    </Button>
                  )}
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
                      <TableHead className="w-[80px] text-center">Primary</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts?.map((contact) => (
                      <TableRow
                        key={contact.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/contacts/${contact.id}`)}
                      >
                        <TableCell className="font-medium">
                          {contact.first_name} {contact.last_name}
                        </TableCell>
                        <TableCell className="text-center">
                          {contact.is_primary ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mx-auto" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleSetPrimary(contact.id)}
                              title="Set as primary"
                            >
                              <Star className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.role ? (
                            <Badge variant="outline">
                              {CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label ||
                                contact.role}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{contact.phone || '-'}</TableCell>
                        <TableCell>{contact.email || '-'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/contacts/${contact.id}`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenContactDialog(contact)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Global Info
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenRelationshipDialog(contact)}>
                                <Users className="mr-2 h-4 w-4" />
                                Edit Relationship
                              </DropdownMenuItem>
                              {!contact.is_primary && (
                                <DropdownMenuItem onClick={() => handleSetPrimary(contact.id)}>
                                  <Star className="mr-2 h-4 w-4" />
                                  Set as Primary
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setUnlinkContactId(contact.id)}>
                                <Unlink className="mr-2 h-4 w-4" />
                                Unlink from Client
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteContactId(contact.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
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

        {/* Projects Tab - Data Grid */}
        <TabsContent value="projects" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('project', { client_id: safeClientId })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
          {projectsLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : projects?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No projects yet</p>
                <Button
                  className="mt-4"
                  onClick={() => openCreateModal('project', { client_id: safeClientId })}
                >
                  Create Project
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
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects?.map((project) => (
                      <TableRow
                        key={project.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/projects/${project.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {project.name}
                            {project.display_id && (
                              <Badge variant="outline" className="font-mono text-xs">
                                #{project.display_id}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{project.project_code}</TableCell>
                        <TableCell>
                          <Badge className={project.computed_status ? getComputedStatusColor(project.computed_status) : getStatusColor(project.status)} variant="outline">
                            {project.computed_status ? getComputedStatusLabel(project.computed_status) : project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getHealthColor(project.health)}>
                            {project.health.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={project.completion_percentage} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{project.completion_percentage}%</span>
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
                              <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Project
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}?edit=true`)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Project
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

        {/* Phases Tab - All phases from client's projects */}
        <TabsContent value="phases" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('phase', { client_id: safeClientId })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Phase
            </Button>
          </div>
          {phasesLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : !clientPhases || clientPhases.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No phases yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create projects and add phases to see them here
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPhases.map((phase) => {
                      const status = computeDisplayStatus(phase)
                      return (
                        <TableRow
                          key={phase.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onDoubleClick={() => navigate(`/phases/${phase.id}`)}
                        >
                          <TableCell>
                            <span className="font-mono text-xs">{phase.phase_id_display || phase.display_id}</span>
                          </TableCell>
                          <TableCell className="font-medium">
                            <button
                              className="text-left hover:underline font-medium"
                              onClick={() => navigate(`/phases/${phase.id}`)}
                            >
                              {phase.name}
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              className="text-left hover:underline text-muted-foreground"
                              onClick={() => navigate(`/projects/${phase.project_id}`)}
                            >
                              {phase.projects?.name || '—'}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                          </TableCell>
                          <TableCell>
                            {phase.lead?.full_name || '—'}
                          </TableCell>
                          <TableCell>
                            {phase.expected_end_date
                              ? formatDate(phase.expected_end_date)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/phases/${phase.id}`)}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  View Phase
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/phases/${phase.id}?edit=true`)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Phase
                                </DropdownMenuItem>
                                {phase.project_id && (
                                  <DropdownMenuItem onClick={() => navigate(`/projects/${phase.project_id}`)}>
                                    <FolderKanban className="mr-2 h-4 w-4" />
                                    View Project
                                  </DropdownMenuItem>
                                )}
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

        {/* Sets Tab - All sets from client's projects */}
        <TabsContent value="sets" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('set', { client_id: safeClientId })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Set
            </Button>
          </div>
          {setsLoading ? (
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
          ) : !clientSets || clientSets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sets yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create projects and add sets to see them here
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
                    {clientSets.map((set) => {
                      const status = computeDisplayStatus(set)
                      const priority = calcPriority(set.importance, set.urgency)
                      const keyStart = computeKeyStartDate(set)
                      const keyEnd = computeKeyEndDate(set)
                      return (
                        <TableRow
                          key={set.id}
                          className="cursor-pointer hover:bg-muted/50"
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
                                <DropdownMenuItem asChild>
                                  <Link to={`/sets/${set.id}`}>
                                    <Layers className="mr-2 h-4 w-4" />
                                    View Set
                                  </Link>
                                </DropdownMenuItem>
                                {set.project_id && (
                                  <DropdownMenuItem asChild>
                                    <Link to={`/projects/${set.project_id}`}>
                                      <FolderKanban className="mr-2 h-4 w-4" />
                                      View Project
                                    </Link>
                                  </DropdownMenuItem>
                                )}
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

        {/* Requirements Tab - Split into Open/Completed */}
        <TabsContent value="requirements" className="mt-6">
          <RequirementsTabbedPanel
            requirements={clientRequirements}
            isLoading={requirementsLoading}
            createContext={{ client_id: safeClientId }}
            showSetColumn={true}
            showProjectColumn={true}
            emptyMessage="No requirements yet. Create projects and sets to add requirements."
          />
        </TabsContent>

        {/* Pitches Tab */}
        <TabsContent value="pitches" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCreateModal('pitch', { client_id: safeClientId })}>
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
          ) : !clientPitches || clientPitches.length === 0 ? (
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
                    {clientPitches.map((pitch) => {
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

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <DocumentsTab
            entityType="client"
            entityId={clientId!}
            clientId={clientId}
            title="Client Documents"
            parentContext={{
              clientName: client?.name,
            }}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <NotesPanel
            entityType="client"
            entityId={clientId!}
            title="Client Notes"
            description="Add meeting notes and updates"
            maxHeight="500px"
          />
        </TabsContent>

        <TabsContent value="discussions" className="mt-6">
          <DiscussionsPanel
            entityType="client"
            entityId={clientId!}
            title="Client Discussions"
            description="Collaborate and discuss client matters"
            maxHeight="600px"
          />
        </TabsContent>

        {/* Competitors Tab */}
        <TabsContent value="competitors" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Linked Competitors</h3>
              <p className="text-sm text-muted-foreground">
                Competitors associated with this client
              </p>
            </div>

            {competitorsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !competitorsByClient || competitorsByClient.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Swords className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No competitors linked to this client.</p>
                <p className="text-sm mt-1">
                  Link a competitor to this client from the Competitors page.
                </p>
              </div>
            ) : (
              <Card className="card-carbon">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Threat Level</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Last Reviewed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitorsByClient.map((competitor) => (
                        <TableRow
                          key={competitor.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onDoubleClick={() => navigate(`/competitors/${competitor.id}`)}
                        >
                          <TableCell>
                            <span className="font-mono text-xs">{competitor.display_id}</span>
                          </TableCell>
                          <TableCell className="font-medium">{competitor.name}</TableCell>
                          <TableCell>{competitor.industry ?? '—'}</TableCell>
                          <TableCell>
                            {competitor.threat_level ? (
                              <Badge className={THREAT_COLORS[competitor.threat_level]}>
                                {competitor.threat_level.charAt(0).toUpperCase() +
                                  competitor.threat_level.slice(1)}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge>{competitor.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {competitor.website ? (
                              <a
                                href={competitor.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline text-sm truncate max-w-[150px] block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {competitor.website.replace(/^https?:\/\//, '')}
                              </a>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {formatDate(competitor.last_reviewed_at) || 'Never'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Contact Dialog - Edit Global Info (name, email, phone) */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Global Info' : 'Add Contact'}</DialogTitle>
            <DialogDescription>
              {editingContact
                ? 'Update contact information. These changes apply globally across all clients this contact is linked to.'
                : 'Add a new contact to this client.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...contactForm}>
            <form onSubmit={contactForm.handleSubmit(handleSaveContact)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={contactForm.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contactForm.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={contactForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship Notes</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Main point of contact for web projects" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Collapsible Address Section */}
              <Collapsible open={addressSectionOpen} onOpenChange={setAddressSectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full flex items-center justify-between px-0 hover:bg-transparent"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4" />
                      Address (Optional)
                    </span>
                    {addressSectionOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <FormField
                    control={contactForm.control}
                    name="address_line1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 1</FormLabel>
                        <FormControl>
                          <Input placeholder="Street address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={contactForm.control}
                    name="address_line2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 2</FormLabel>
                        <FormControl>
                          <Input placeholder="Apt, suite, unit, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={contactForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State / Province</FormLabel>
                          <FormControl>
                            <Input placeholder="State" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={contactForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="postal_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postal Code</FormLabel>
                          <FormControl>
                            <Input placeholder="ZIP / Postal code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createContact.isPending || updateContact.isPending}>
                  {(createContact.isPending || updateContact.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingContact ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Relationship Dialog - Edit Client-Contact Relationship (role, is_primary) */}
      <Dialog open={relationshipDialogOpen} onOpenChange={setRelationshipDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Relationship</DialogTitle>
            <DialogDescription>
              Update this contact's relationship with {client?.name}. These settings only apply to this client.
            </DialogDescription>
          </DialogHeader>
          <Form {...relationshipForm}>
            <form onSubmit={relationshipForm.handleSubmit(handleSaveRelationship)} className="space-y-4">
              <FormField
                control={relationshipForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTACT_ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={relationshipForm.control}
                name="is_primary"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Primary Contact</FormLabel>
                    <FormDescription className="!mt-0 text-xs">
                      Primary contact shown on client details
                    </FormDescription>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRelationshipDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateContact.isPending || setPrimaryContact.isPending}>
                  {(updateContact.isPending || setPrimaryContact.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation */}
      <AlertDialog open={!!deleteContactId} onOpenChange={() => setDeleteContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContact}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Existing Contact Dialog */}
      <Dialog open={linkContactDialogOpen} onOpenChange={setLinkContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Existing Contact</DialogTitle>
            <DialogDescription>
              Select an existing contact to link to this client.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedContactToLink}
              onValueChange={setSelectedContactToLink}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contact..." />
              </SelectTrigger>
              <SelectContent>
                {unlinkedLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : unlinkedContacts && unlinkedContacts.length > 0 ? (
                  unlinkedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {contact.first_name} {contact.last_name}
                        </span>
                        {contact.email && (
                          <span className="text-xs text-muted-foreground">{contact.email}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No unlinked contacts available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLinkContact}
              disabled={!selectedContactToLink || linkToClient.isPending}
            >
              {linkToClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Contact Confirmation */}
      <AlertDialog open={!!unlinkContactId} onOpenChange={() => setUnlinkContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Contact</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the contact from this client. The contact will still exist and can be linked again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlinkContact}>Unlink</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
