import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClient, useClientMutations } from '@/hooks/useClients'
import { useProjectsByClient } from '@/hooks/useProjects'
import { useContacts, useContactMutations } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Mail,
  Phone,
  Calendar,
  FolderKanban,
  Users,
  FileText,
  Edit,
  Plus,
  Star,
  Trash2,
  Loader2,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor, INDUSTRY_OPTIONS, CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditToggle } from '@/components/shared/ViewEditToggle'
import type { Contact, CreateContactInput, UpdateContactInput, ContactRole, IndustryType } from '@/types/database'

// Client form schema
const clientFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company_name: z.string().min(1, 'Company name is required'),
  overview: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(['active', 'inactive', 'onboarding']),
  portal_enabled: z.boolean(),
})

type ClientFormValues = z.infer<typeof clientFormSchema>

// Contact form schema
const contactFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
  relationship: z.string().optional(),
  is_primary: z.boolean(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()

  // Guard: clientId is required for this page
  const safeClientId = clientId ?? ''

  const { data: client, isLoading: clientLoading } = useClient(safeClientId)
  const { data: projects, isLoading: projectsLoading } = useProjectsByClient(safeClientId)
  const { data: contacts, isLoading: contactsLoading } = useContacts(safeClientId)
  const { updateClient } = useClientMutations()
  const { createContact, updateContact, deleteContact, setPrimaryContact } = useContactMutations(safeClientId)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Contact dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)

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
    },
  })

  // Contact form
  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: '',
      relationship: '',
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
      })
    }
  }, [client?.id, isEditing])

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
    })
    setIsEditing(false)
  }

  const handleOpenContactDialog = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact)
      contactForm.reset({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || '',
        phone: contact.phone || '',
        role: contact.role || '',
        relationship: contact.relationship || '',
        is_primary: contact.is_primary,
      })
    } else {
      setEditingContact(null)
      contactForm.reset({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role: '',
        relationship: '',
        is_primary: contacts?.length === 0, // First contact is primary by default
      })
    }
    setContactDialogOpen(true)
  }

  const handleSaveContact = async (data: ContactFormValues) => {
    if (editingContact) {
      const input: UpdateContactInput = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        role: (data.role as ContactRole) || undefined,
        relationship: data.relationship || undefined,
        is_primary: data.is_primary,
      }
      await updateContact.mutateAsync({ id: editingContact.id, ...input })
    } else {
      const input: CreateContactInput = {
        client_id: safeClientId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        role: (data.role as ContactRole) || undefined,
        relationship: data.relationship || undefined,
        is_primary: data.is_primary,
      }
      await createContact.mutateAsync(input)
    }
    setContactDialogOpen(false)
  }

  const handleDeleteContact = async () => {
    if (!deleteContactId) return
    await deleteContact.mutateAsync(deleteContactId)
    setDeleteContactId(null)
  }

  const handleSetPrimary = async (contactId: string) => {
    await setPrimaryContact.mutateAsync({ id: contactId, clientId: safeClientId })
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <Input
                {...clientForm.register('name')}
                className="text-3xl font-bold h-auto py-1 px-2 max-w-md"
              />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            )}
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {client.status}
            </Badge>
            {client.display_id && (
              <Badge variant="outline" className="font-mono">
                #{client.display_id}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{client.company_name}</p>
        </div>
      </div>

      {/* Client Info Card */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          <ViewEditToggle
            isEditing={isEditing}
            isSaving={isSaving}
            onEdit={() => setIsEditing(true)}
            onCancel={handleCancelEdit}
            onSave={clientForm.handleSubmit(handleSaveClient)}
          >
            {{
              view: (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="font-medium">{client.company_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">
                          {INDUSTRY_OPTIONS.find((o) => o.value === client.industry)?.label || '-'}
                        </p>
                      </div>
                    </div>
                    {primaryContact && (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-muted">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Primary Contact</p>
                            <p className="font-medium">
                              {primaryContact.first_name} {primaryContact.last_name}
                            </p>
                            {primaryContact.email && (
                              <p className="text-sm text-muted-foreground">{primaryContact.email}</p>
                            )}
                          </div>
                        </div>
                        {primaryContact.phone && (
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-muted">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Phone</p>
                              <p className="font-medium">{primaryContact.phone}</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Client Since</p>
                        <p className="font-medium">{formatDate(client.created_at)}</p>
                      </div>
                    </div>
                  </div>
                  {client.overview && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Overview</p>
                      <p className="text-sm">{client.overview}</p>
                    </div>
                  )}
                </div>
              ),
              edit: (
                <Form {...clientForm}>
                  <form className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <FormField
                      control={clientForm.control}
                      name="company_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clientForm.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INDUSTRY_OPTIONS.map((opt) => (
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
                      control={clientForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="onboarding">Onboarding</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="col-span-full">
                      <FormField
                        control={clientForm.control}
                        name="overview"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Overview</FormLabel>
                            <FormControl>
                              <Textarea {...field} rows={3} placeholder="Brief description of the client..." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={clientForm.control}
                      name="portal_enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0">Client Portal Enabled</FormLabel>
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              ),
            }}
          </ViewEditToggle>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Building2 className="h-4 w-4" />
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
          <TabsTrigger value="projects" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
            {projects && projects.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {projects.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Client Portal</p>
                    <p>{client.portal_enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                      {client.status}
                    </Badge>
                  </div>
                </div>
              </div>
              <AuditTrail
                created_at={client.created_at}
                created_by={client.created_by}
                updated_at={client.updated_at}
                updated_by={client.updated_by}
                creator={client.creator}
                updater={client.updater}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => handleOpenContactDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
          {contactsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : contacts?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No contacts yet</p>
                <Button className="mt-4" onClick={() => handleOpenContactDialog()}>
                  Add First Contact
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {contacts?.map((contact) => (
                <Card key={contact.id} className={contact.is_primary ? 'border-primary' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {contact.first_name[0]}
                            {contact.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {contact.first_name} {contact.last_name}
                            </p>
                            {contact.is_primary && (
                              <Badge variant="default" className="gap-1">
                                <Star className="h-3 w-3" />
                                Primary
                              </Badge>
                            )}
                            {contact.role && (
                              <Badge variant="outline">
                                {CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label ||
                                  contact.role}
                              </Badge>
                            )}
                          </div>
                          {contact.email && (
                            <p className="text-sm text-muted-foreground">{contact.email}</p>
                          )}
                          {contact.phone && (
                            <p className="text-sm text-muted-foreground">{contact.phone}</p>
                          )}
                          {contact.relationship && (
                            <p className="text-sm text-muted-foreground mt-1">{contact.relationship}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!contact.is_primary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(contact.id)}
                          >
                            <Star className="h-4 w-4 mr-1" />
                            Set Primary
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenContactDialog(contact)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteContactId(contact.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => navigate(`/projects/new?clientId=${safeClientId}`)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
          {projectsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No projects yet</p>
                <Button
                  className="mt-4"
                  onClick={() => navigate(`/projects/new?clientId=${safeClientId}`)}
                >
                  Create Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {projects?.map((project) => (
                <Link key={project.id} to={`/projects/${project.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{project.name}</CardTitle>
                          {project.display_id && (
                            <Badge variant="outline" className="font-mono">
                              #{project.display_id}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                          <Badge variant="outline" className={getHealthColor(project.health)}>
                            {project.health.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription>{project.project_code}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Progress value={project.completion_percentage} className="h-2 flex-1" />
                        <span className="text-sm text-muted-foreground">
                          {project.completion_percentage}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents yet</p>
              <Button className="mt-4">Upload Document</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Contact Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            <DialogDescription>
              {editingContact
                ? 'Update contact information.'
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
              <FormField
                control={contactForm.control}
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
    </div>
  )
}
