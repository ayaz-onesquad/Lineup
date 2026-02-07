import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useContact, useContacts, useContactMutations } from '@/hooks/useContacts'
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
  ArrowLeft,
  User,
  Users,
  Edit,
  X,
  Save,
  Loader2,
  Star,
  Building2,
} from 'lucide-react'
import { formatDate, CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import type { ContactRole } from '@/types/database'

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

export function ContactDetailPage() {
  const { contactId } = useParams<{ contactId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const safeContactId = contactId ?? ''

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const { data: contact, isLoading: contactLoading } = useContact(safeContactId)
  const { data: clientContacts, isLoading: clientContactsLoading } = useContacts(
    contact?.client_id ?? ''
  )
  const { updateContact, setPrimaryContact } = useContactMutations(contact?.client_id ?? '')

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Contact form
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      first_name: contact?.first_name || '',
      last_name: contact?.last_name || '',
      email: contact?.email || '',
      phone: contact?.phone || '',
      role: contact?.role || '',
      relationship: contact?.relationship || '',
      is_primary: contact?.is_primary || false,
    },
  })

  // Reset form when contact data loads
  useEffect(() => {
    if (contact && !isEditing) {
      form.reset({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || '',
        phone: contact.phone || '',
        role: contact.role || '',
        relationship: contact.relationship || '',
        is_primary: contact.is_primary,
      })
    }
  }, [contact?.id, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && contact && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, contact])

  const handleSaveContact = async (data: ContactFormValues) => {
    if (!safeContactId) return
    setIsSaving(true)
    try {
      await updateContact.mutateAsync({
        id: safeContactId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        role: (data.role as ContactRole) || undefined,
        relationship: data.relationship || undefined,
        is_primary: data.is_primary,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      first_name: contact?.first_name || '',
      last_name: contact?.last_name || '',
      email: contact?.email || '',
      phone: contact?.phone || '',
      role: contact?.role || '',
      relationship: contact?.relationship || '',
      is_primary: contact?.is_primary || false,
    })
    setIsEditing(false)
  }

  const handleSetPrimary = async (otherContactId: string) => {
    if (!contact?.client_id) return
    await setPrimaryContact.mutateAsync({
      id: otherContactId,
      clientId: contact.client_id,
    })
  }

  // Other contacts for the same client (excluding current contact)
  const otherContacts = clientContacts?.filter((c) => c.id !== safeContactId) || []

  if (contactLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contact not found</p>
        <Link to="/contacts">
          <Button variant="link">Back to Contacts</Button>
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
          {
            label: contact.clients?.name || 'Client',
            href: contact.client_id ? `/clients/${contact.client_id}` : undefined,
          },
          { label: 'Contacts', href: '/contacts' },
          { label: `${contact.first_name} ${contact.last_name}`, displayId: contact.display_id },
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
              {isEditing
                ? `${form.watch('first_name')} ${form.watch('last_name')}`
                : `${contact.first_name} ${contact.last_name}`}
              {contact.display_id && (
                <span className="text-muted-foreground"> | ID: {contact.display_id}</span>
              )}
            </h1>
            {contact.is_primary && (
              <Badge variant="default" className="gap-1">
                <Star className="h-3 w-3 fill-current" />
                Primary
              </Badge>
            )}
            {contact.role && (
              <Badge variant="outline">
                {CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label || contact.role}
              </Badge>
            )}
          </div>
          <Link
            to={`/clients/${contact.client_id}`}
            className="text-muted-foreground hover:underline flex items-center gap-1"
          >
            <Building2 className="h-3 w-3" />
            {contact.clients?.name}
          </Link>
        </div>
      </div>

      {/* Contact Info Card */}
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
                  onClick={form.handleSubmit(handleSaveContact)}
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

          {/* Fields with consistent layout */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <ViewEditField
                type="text"
                label="First Name"
                required
                isEditing={isEditing}
                value={form.watch('first_name')}
                onChange={(v) => form.setValue('first_name', v)}
                error={form.formState.errors.first_name?.message}
              />
              <ViewEditField
                type="text"
                label="Last Name"
                required
                isEditing={isEditing}
                value={form.watch('last_name')}
                onChange={(v) => form.setValue('last_name', v)}
                error={form.formState.errors.last_name?.message}
              />
              <ViewEditField
                type="select"
                label="Role"
                isEditing={isEditing}
                value={form.watch('role') || ''}
                onChange={(v) => form.setValue('role', v)}
                options={CONTACT_ROLE_OPTIONS}
                placeholder="Select role"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <ViewEditField
                type="email"
                label="Email"
                isEditing={isEditing}
                value={form.watch('email') || ''}
                onChange={(v) => form.setValue('email', v)}
                error={form.formState.errors.email?.message}
              />
              <ViewEditField
                type="tel"
                label="Phone"
                isEditing={isEditing}
                value={form.watch('phone') || ''}
                onChange={(v) => form.setValue('phone', v)}
              />
              <ViewEditField
                type="switch"
                label="Primary Contact"
                isEditing={isEditing}
                value={form.watch('is_primary')}
                onChange={(v) => form.setValue('is_primary', v)}
                description="Main point of contact for client"
              />
            </div>

            <ViewEditField
              type="textarea"
              label="Relationship Notes"
              isEditing={isEditing}
              value={form.watch('relationship') || ''}
              onChange={(v) => form.setValue('relationship', v)}
              placeholder="Notes about this contact's relationship with the organization..."
              rows={3}
            />

            {/* Client info (read-only) */}
            {!isEditing && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Client</p>
                  <Link
                    to={`/clients/${contact.client_id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.clients?.name}
                  </Link>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Created</p>
                  <p>{formatDate(contact.created_at)}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <User className="h-4 w-4" />
            Contact Details
          </TabsTrigger>
          <TabsTrigger value="client-contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Client Contacts
            {otherContacts.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {otherContacts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Contact Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                    <p className="font-medium">
                      {contact.first_name} {contact.last_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                    <p>
                      {contact.role
                        ? CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label ||
                          contact.role
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Primary Contact</p>
                    <Badge variant={contact.is_primary ? 'default' : 'secondary'}>
                      {contact.is_primary ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <p>{contact.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <p>{contact.phone || '—'}</p>
                  </div>
                </div>
                {contact.relationship && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Relationship Notes</p>
                    <p className="mt-1 whitespace-pre-wrap">{contact.relationship}</p>
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t">
                <AuditTrail
                  created_at={contact.created_at}
                  created_by={contact.created_by}
                  updated_at={contact.updated_at}
                  updated_by={contact.updated_by}
                  creator={contact.creator}
                  updater={contact.updater}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Client Contacts Tab */}
        <TabsContent value="client-contacts" className="mt-6">
          {clientContactsLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px] text-center">Primary</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3].map((i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-8 mx-auto" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : otherContacts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No other contacts for this client</p>
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
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherContacts.map((otherContact) => (
                      <TableRow
                        key={otherContact.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/contacts/${otherContact.id}`)}
                      >
                        <TableCell className="font-medium">
                          {otherContact.first_name} {otherContact.last_name}
                        </TableCell>
                        <TableCell className="text-center">
                          {otherContact.is_primary ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mx-auto" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSetPrimary(otherContact.id)
                              }}
                              title="Set as primary"
                            >
                              <Star className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {otherContact.role ? (
                            <Badge variant="outline">
                              {CONTACT_ROLE_OPTIONS.find((o) => o.value === otherContact.role)
                                ?.label || otherContact.role}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{otherContact.email || '—'}</TableCell>
                        <TableCell>{otherContact.phone || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
