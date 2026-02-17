import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useContact, useContactClients, useContactMutations } from '@/hooks/useContacts'
import { useAuth } from '@/hooks/useAuth'
import { useTenantStore } from '@/stores'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/services/api/contacts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  ArrowLeft,
  User,
  Edit,
  X,
  Save,
  Loader2,
  Star,
  Building2,
  UserPlus,
  Eye,
  EyeOff,
  Copy,
  Check,
  UserCheck,
} from 'lucide-react'
import { formatDate, CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { toast } from '@/hooks/use-toast'
import type { ContactRole } from '@/types/database'

// Contact form schema
const contactFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
  relationship: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

// Convert to client user form schema
const convertToClientUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  clientId: z.string().min(1, 'Client is required'),
})

type ConvertToClientUserValues = z.infer<typeof convertToClientUserSchema>

export function ContactDetailPage() {
  const { contactId } = useParams<{ contactId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { currentTenant } = useTenantStore()
  const currentTenantId = currentTenant?.id
  const queryClient = useQueryClient()

  const safeContactId = contactId ?? ''

  // Check for ?edit=true query param to auto-enter edit mode
  const shouldEditOnLoad = searchParams.get('edit') === 'true'

  const { data: contact, isLoading: contactLoading } = useContact(safeContactId)
  const { data: linkedClients, isLoading: linkedClientsLoading } = useContactClients(safeContactId)
  const { updateContact } = useContactMutations(contact?.client_id ?? '')

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Convert to client user state
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(true)
  const [passwordCopied, setPasswordCopied] = useState(false)

  // Check if contact already has a user account
  const { data: hasUserAccount } = useQuery({
    queryKey: ['contactHasUser', safeContactId],
    queryFn: () => contactsApi.hasUserAccount(safeContactId),
    enabled: !!safeContactId,
  })

  // Convert to client user form
  const convertForm = useForm<ConvertToClientUserValues>({
    resolver: zodResolver(convertToClientUserSchema),
    defaultValues: {
      email: contact?.email || '',
      password: '',
      clientId: linkedClients?.[0]?.client?.id || '',
    },
  })

  // Update form defaults when contact/clients load
  useEffect(() => {
    if (contact?.email && !convertForm.getValues('email')) {
      convertForm.setValue('email', contact.email)
    }
    if (linkedClients?.[0]?.client?.id && !convertForm.getValues('clientId')) {
      convertForm.setValue('clientId', linkedClients[0].client.id)
    }
  }, [contact?.email, linkedClients])

  // Copy password to clipboard
  const copyPassword = () => {
    const password = convertForm.getValues('password')
    if (password) {
      navigator.clipboard.writeText(password)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
  }

  // Convert to client user mutation
  const convertMutation = useMutation({
    mutationFn: (values: ConvertToClientUserValues) =>
      contactsApi.convertToClientUser(
        safeContactId,
        values.clientId,
        currentTenantId!,
        values.email,
        values.password,
        user!.id
      ),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contactHasUser', safeContactId] })
      toast({
        title: 'Client user created successfully',
        description: (
          <div className="space-y-2">
            <p><strong>Email:</strong> {variables.email}</p>
            <p><strong>Password:</strong> <code className="bg-muted px-1 py-0.5 rounded font-mono text-sm">{variables.password}</code></p>
            <p className="text-sm text-muted-foreground">Share these credentials with the contact to give them portal access.</p>
          </div>
        ),
        duration: 15000,
      })
      setIsConvertDialogOpen(false)
      convertForm.reset()
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create client user',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

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
    })
    setIsEditing(false)
  }

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
      {/* Breadcrumbs: Contacts > Contact Name */}
      <Breadcrumbs
        items={[
          { label: 'Contacts', href: '/contacts' },
          { label: `${contact.first_name} ${contact.last_name}`, displayId: contact.display_id },
        ]}
      />

      {/* Header - Simplified: Name, Role badge, Primary badge */}
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
            {contact.role && (
              <Badge variant="outline">
                {CONTACT_ROLE_OPTIONS.find((o) => o.value === contact.role)?.label || contact.role}
              </Badge>
            )}
          </div>
          {linkedClients && linkedClients.length > 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span>
                {linkedClients.map((lc, i) => (
                  <span key={lc.client.id}>
                    <Link
                      to={`/clients/${lc.client.id}`}
                      className="hover:underline"
                    >
                      {lc.client.name}
                    </Link>
                    {lc.is_primary && (
                      <Star className="inline h-3 w-3 ml-1 text-yellow-500 fill-yellow-500" />
                    )}
                    {i < linkedClients.length - 1 && ', '}
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">No linked clients</span>
          )}
        </div>

        {/* Convert to Client User button */}
        {linkedClients && linkedClients.length > 0 && !hasUserAccount && (
          <Button
            variant="outline"
            onClick={() => setIsConvertDialogOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Convert to Client User
          </Button>
        )}
        {hasUserAccount && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 py-1.5 px-3">
            <UserCheck className="mr-2 h-4 w-4" />
            Has Portal Access
          </Badge>
        )}
      </div>

      {/* Header Info Card - Key fields only: Name, Role, Primary */}
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

          {/* Header fields: Name and Role */}
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
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <User className="h-4 w-4" />
            Contact Details
          </TabsTrigger>
          <TabsTrigger value="linked-clients" className="gap-2">
            <Building2 className="h-4 w-4" />
            Linked Clients
            {linkedClients && linkedClients.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {linkedClients.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Contact Details Tab - Contains editable contact info */}
        <TabsContent value="details" className="mt-6 space-y-6">
          {/* Client Info Section - Read-only */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Client Information
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Client</p>
                  <Link
                    to={`/clients/${contact.client_id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.clients?.name || '—'}
                  </Link>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contact Since</p>
                  <p>{formatDate(contact.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info Section - Editable */}
          <Card className="card-carbon">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                Contact Information
              </h3>
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
              </div>
              <div className="mt-4">
                <ViewEditField
                  type="textarea"
                  label="Relationship Notes"
                  isEditing={isEditing}
                  value={form.watch('relationship') || ''}
                  onChange={(v) => form.setValue('relationship', v)}
                  placeholder="Notes about this contact's relationship with the organization..."
                  rows={3}
                />
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

        {/* Linked Clients Tab - Shows clients this contact is associated with */}
        <TabsContent value="linked-clients" className="mt-6">
          {linkedClientsLoading ? (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="w-[100px] text-center">Primary</TableHead>
                      <TableHead>Status</TableHead>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : !linkedClients || linkedClients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">This contact is not linked to any clients</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-carbon">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="w-[100px] text-center">Primary</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedClients.map((lc) => (
                      <TableRow
                        key={lc.client.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => navigate(`/clients/${lc.client.id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {lc.client.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {lc.is_primary ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lc.client.status ? (
                            <Badge variant="outline">{lc.client.status}</Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Convert to Client User Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Convert to Client User</DialogTitle>
            <DialogDescription>
              Create a portal login for {contact?.first_name} {contact?.last_name}. They will be able to access the client portal with these credentials.
            </DialogDescription>
          </DialogHeader>
          <Form {...convertForm}>
            <form onSubmit={convertForm.handleSubmit((data) => convertMutation.mutate({ ...data, password: data.password.trim() }))} className="space-y-4">
              <FormField
                control={convertForm.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Access *</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select client..."
                        options={(linkedClients || []).map((lc) => ({
                          value: lc.client.id,
                          label: lc.client.name,
                        }))}
                      />
                    </FormControl>
                    <FormDescription>
                      The client this user will have portal access to
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={convertForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      This will be used for portal login
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={convertForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporary Password *</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter temporary password"
                            className="pr-10 font-mono"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={copyPassword}
                          disabled={!field.value}
                          title="Copy password"
                        >
                          {passwordCopied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Must be at least 8 characters. Share this with the contact.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsConvertDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={convertMutation.isPending}>
                  {convertMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Portal Access
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
