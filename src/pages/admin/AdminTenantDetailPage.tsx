import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantsApi, clientsApi, projectsApi, authApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Users,
  FolderKanban,
  Briefcase,
  Calendar,
  Trash2,
  RefreshCw,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Power,
  AlertTriangle,
  Key,
} from 'lucide-react'
import { formatDate, getStatusColor, getHealthColor } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { isValidEmail } from '@/lib/security'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import type { Tenant, Client, ProjectWithRelations, TenantUserWithProfile, UserRole } from '@/types/database'

// Error message parser for user creation
function parseUserCreationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('permission denied') || message.includes('42501')) {
    return 'Permission denied. Check RLS policies or admin rights.'
  }
  if (message.includes('session') || message.includes('Session')) {
    return 'Session error. Please refresh the page and try again.'
  }
  if (message.includes('already exists') || message.includes('duplicate') || message.includes('already registered')) {
    return 'A user with this email already exists.'
  }
  if (message.includes('not added to tenant')) {
    return 'User was created but not added to this tenant. Please refresh and check the user list.'
  }
  if (message.includes('profile creation failed')) {
    return 'User was created but profile setup failed. Please refresh and check the user list.'
  }

  return message || 'An unexpected error occurred'
}

// User role options
const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Organization Admin', description: 'Full access to tenant' },
  { value: 'org_user', label: 'Organization User', description: 'Standard team member' },
  { value: 'client_user', label: 'Client User', description: 'Limited portal access' },
]

// Timezone options (common ones)
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
  { value: 'Asia/Shanghai', label: 'China Standard Time' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
]

// Form schema for creating a user
const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['org_admin', 'org_user', 'client_user'] as const),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  sendWelcomeEmail: z.boolean(),
})

type CreateUserFormData = z.infer<typeof createUserSchema>

// Reset password schema
const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function AdminTenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const queryClient = useQueryClient()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(true) // Show by default for admin
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false)
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('')
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false)
  const [selectedUserForReset, setSelectedUserForReset] = useState<TenantUserWithProfile | null>(null)
  const [showResetPassword, setShowResetPassword] = useState(true)
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false)

  // Copy password to clipboard
  const copyPassword = () => {
    const password = createUserForm.getValues('password')
    if (password) {
      navigator.clipboard.writeText(password)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
  }

  // Copy reset password to clipboard
  const copyResetPassword = () => {
    const password = resetPasswordForm.getValues('password')
    if (password) {
      navigator.clipboard.writeText(password)
      setResetPasswordCopied(true)
      setTimeout(() => setResetPasswordCopied(false), 2000)
    }
  }

  // Create user form
  const createUserForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: 'org_user',
      phone: '',
      timezone: 'America/New_York',
      sendWelcomeEmail: true,
    },
  })

  // Reset password form
  const resetPasswordForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
    },
  })

  const { data: tenant, isLoading: tenantLoading, refetch } = useQuery<Tenant | null>({
    queryKey: ['admin', 'tenants', tenantId],
    queryFn: () => tenantsApi.getById(tenantId!),
    enabled: !!tenantId,
  })

  // Get clients for this tenant
  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['admin', 'tenants', tenantId, 'clients'],
    queryFn: async () => {
      return clientsApi.getAll(tenantId!)
    },
    enabled: !!tenantId,
  })

  // Get projects for this tenant
  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithRelations[]>({
    queryKey: ['admin', 'tenants', tenantId, 'projects'],
    queryFn: async () => {
      return projectsApi.getAll(tenantId!)
    },
    enabled: !!tenantId,
  })

  // Get users for this tenant
  const { data: users, isLoading: usersLoading } = useQuery<TenantUserWithProfile[]>({
    queryKey: ['admin', 'tenants', tenantId, 'users'],
    queryFn: async () => {
      return tenantsApi.getUsers(tenantId!)
    },
    enabled: !!tenantId,
  })

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserFormData) => {
      // Pre-flight validation
      if (!tenantId) {
        throw new Error('No tenant selected. Please go back and select a tenant.')
      }
      if (!isValidEmail(data.email)) {
        throw new Error('Please enter a valid email address.')
      }
      if (data.password.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      return tenantsApi.createUser(tenantId, {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        timezone: data.timezone,
        role: data.role as UserRole,
        sendWelcomeEmail: data.sendWelcomeEmail,
      })
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', tenantId, 'users'] })
      toast({
        title: 'User created successfully',
        description: (
          <div className="space-y-2">
            <p><strong>Email:</strong> {variables.email}</p>
            <p><strong>Password:</strong> <code className="bg-muted px-1 py-0.5 rounded font-mono text-sm">{variables.password}</code></p>
            <p className="text-sm text-muted-foreground">Share these credentials with the user.</p>
          </div>
        ),
        duration: 15000, // Keep visible for 15 seconds
      })
      setIsCreateUserOpen(false)
      createUserForm.reset()
      setShowPassword(true) // Reset to show for next user
    },
    onError: (error: Error) => {
      const friendlyMessage = parseUserCreationError(error)
      toast({
        title: 'Failed to create user',
        description: friendlyMessage,
        variant: 'destructive',
      })
    },
  })

  const onCreateUser = (data: CreateUserFormData) => {
    // Final validation before submitting
    if (!tenantId) {
      toast({
        title: 'No tenant selected',
        description: 'Please go back and select a tenant.',
        variant: 'destructive',
      })
      return
    }

    createUserMutation.mutate(data)
  }

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      if (!selectedUserForReset) throw new Error('No user selected')
      await authApi.adminResetPassword(selectedUserForReset.user_id, data.password)
    },
    onSuccess: (_result, variables) => {
      toast({
        title: 'Password reset successfully',
        description: (
          <div className="space-y-2">
            <p><strong>User:</strong> {selectedUserForReset?.user_profiles?.full_name}</p>
            <p><strong>New Password:</strong> <code className="bg-muted px-1 py-0.5 rounded font-mono text-sm">{variables.password}</code></p>
            <p className="text-sm text-muted-foreground">Share this password with the user.</p>
          </div>
        ),
        duration: 15000,
      })
      setIsResetPasswordOpen(false)
      setSelectedUserForReset(null)
      resetPasswordForm.reset()
      setShowResetPassword(true)
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reset password',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const onResetPassword = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data)
  }

  const openResetPasswordDialog = (user: TenantUserWithProfile) => {
    setSelectedUserForReset(user)
    resetPasswordForm.reset()
    setShowResetPassword(true)
    setIsResetPasswordOpen(true)
  }

  // Step 1: Deactivate tenant (blocks user login)
  const handleDeactivate = async () => {
    if (!tenantId) return
    setIsDeactivating(true)
    try {
      await tenantsApi.deactivateTenant(tenantId)
      toast({
        title: 'Tenant deactivated',
        description: 'Users can no longer log in to this tenant. You can now permanently delete it if needed.',
      })
      refetch()
    } catch (error) {
      toast({
        title: 'Failed to deactivate tenant',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  // Step 2: Permanently delete tenant (requires confirmation)
  const handlePermanentDelete = async () => {
    if (!tenantId || !tenant) return
    if (deleteConfirmationName.toLowerCase() !== tenant.name.toLowerCase()) {
      toast({
        title: 'Confirmation failed',
        description: 'The tenant name you entered does not match.',
        variant: 'destructive',
      })
      return
    }
    setIsDeleting(true)
    try {
      await tenantsApi.permanentlyDeleteTenant(tenantId, deleteConfirmationName)
      toast({
        title: 'Tenant permanently deleted',
        description: 'The tenant and all associated data have been permanently removed.',
      })
      // Navigate back to admin dashboard since tenant no longer exists
      window.location.href = '/admin'
    } catch (error) {
      toast({
        title: 'Failed to delete tenant',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
      setShowPermanentDeleteDialog(false)
      setDeleteConfirmationName('')
    }
  }

  // Restore (reactivate) tenant
  const handleRestore = async () => {
    if (!tenantId) return
    try {
      await tenantsApi.activateTenant(tenantId)
      toast({
        title: 'Tenant restored',
        description: 'The tenant has been reactivated. Users can now log in.',
      })
      refetch()
    } catch (error) {
      toast({
        title: 'Failed to restore tenant',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      })
    }
  }

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Tenant not found</p>
        <Link to="/admin">
          <Button variant="link">Back to Admin Dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: tenant.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{tenant.name}</h1>
            {tenant.status === 'inactive' ? (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                Inactive
              </Badge>
            ) : tenant.deleted_at ? (
              <Badge variant="destructive">Deleted</Badge>
            ) : (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{tenant.slug}</p>
        </div>

        {/* Action buttons based on tenant status */}
        <div className="flex items-center gap-2">
          {tenant.status === 'inactive' ? (
            <>
              {/* Inactive tenant: Show Restore and Permanent Delete buttons */}
              <Button variant="outline" onClick={handleRestore}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reactivate
              </Button>
              <Dialog open={showPermanentDeleteDialog} onOpenChange={setShowPermanentDeleteDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Permanently Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Permanently Delete Tenant
                    </DialogTitle>
                    <DialogDescription className="space-y-2">
                      <p>
                        This action <strong>cannot be undone</strong>. This will permanently delete the tenant
                        <strong> "{tenant.name}"</strong> and all associated data including:
                      </p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>All clients and contacts</li>
                        <li>All projects, phases, sets, and requirements</li>
                        <li>All user associations with this tenant</li>
                        <li>All documents and activity history</li>
                      </ul>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        To confirm, type the tenant name: <strong>{tenant.name}</strong>
                      </label>
                      <Input
                        value={deleteConfirmationName}
                        onChange={(e) => setDeleteConfirmationName(e.target.value)}
                        placeholder="Enter tenant name to confirm"
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowPermanentDeleteDialog(false)
                        setDeleteConfirmationName('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handlePermanentDelete}
                      disabled={
                        isDeleting ||
                        deleteConfirmationName.toLowerCase() !== tenant.name.toLowerCase()
                      }
                    >
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete Forever
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : tenant.deleted_at ? (
            // Soft-deleted tenant: Show Restore button
            <Button variant="outline" onClick={handleRestore}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Restore Tenant
            </Button>
          ) : (
            // Active tenant: Show Deactivate button (Step 1 of deletion workflow)
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-yellow-600 border-yellow-300 hover:bg-yellow-50" disabled={isDeactivating}>
                  <Power className="mr-2 h-4 w-4" />
                  Deactivate Tenant
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate Tenant?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This will <strong>block all users</strong> from logging into this tenant.
                    </p>
                    <p>
                      After deactivation, you can either reactivate the tenant or proceed to permanent deletion.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeactivate}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    {isDeactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Deactivate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clients</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.user_count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(tenant.created_at)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed data */}
      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6">
          {clientsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : clients?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No clients found</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients?.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>
                        <div>
                          <p>{client.contact_name || '-'}</p>
                          <p className="text-sm text-muted-foreground">{client.contact_email || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{client.industry || '-'}</TableCell>
                      <TableCell>{formatDate(client.created_at)}</TableCell>
                      <TableCell>
                        {client.deleted_at ? (
                          <Badge variant="destructive">Deleted</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          {projectsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No projects found</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{project.name}</p>
                          <p className="text-sm text-muted-foreground">{project.project_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{project.clients?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(project.status)}>
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getHealthColor(project.health)}>
                          {project.health.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={project.completion_percentage} className="w-16 h-2" />
                          <span className="text-sm">{project.completion_percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(project.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Add a new user to this tenant. They will receive an email to confirm their account.
                  </DialogDescription>
                </DialogHeader>
                <Form {...createUserForm}>
                  <form onSubmit={createUserForm.handleSubmit(onCreateUser)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={createUserForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="John" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createUserForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={createUserForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john.doe@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createUserForm.control}
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
                            Must be at least 8 characters. Share this password with the user.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createUserForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>User Role *</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              options={ROLE_OPTIONS}
                              value={field.value}
                              onValueChange={(value) => field.onChange(value || 'org_user')}
                              placeholder="Select role..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={createUserForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="+1 (555) 000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createUserForm.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Timezone</FormLabel>
                            <FormControl>
                              <SearchableSelect
                                options={TIMEZONE_OPTIONS}
                                value={field.value}
                                onValueChange={(value) => field.onChange(value || '')}
                                placeholder="Select timezone..."
                                clearable
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={createUserForm.control}
                      name="sendWelcomeEmail"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Send Welcome Email</FormLabel>
                            <FormDescription>
                              Send an email with login instructions
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateUserOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createUserMutation.isPending}>
                        {createUserMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Create User
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filter out sys_admin users - they are global and not tenant-specific */}
          {(() => {
            const filteredUsers = users?.filter(u => u.role !== 'sys_admin') || []

            if (usersLoading) {
              return (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              )
            }

            if (filteredUsers.length === 0) {
              return (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No users found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a user to add them to this tenant
                    </p>
                  </CardContent>
                </Card>
              )
            }

            return (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium">
                              {user.user_profiles?.full_name
                                ?.split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase() || '?'}
                            </span>
                          </div>
                          {user.user_profiles?.full_name || 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {/* Email is not stored in user_profiles, would need auth.users */}
                        —
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.role === 'org_admin'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : user.role === 'org_user'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                          }
                        >
                          {user.role.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.status === 'active'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : user.status === 'invited'
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(user.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResetPasswordDialog(user)}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Reset Password
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            )
          })()}
        </TabsContent>
      </Tabs>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Reset User Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for {selectedUserForReset?.user_profiles?.full_name || 'this user'}.
              They will need to use this password on their next login.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetPasswordForm}>
            <form onSubmit={resetPasswordForm.handleSubmit(onResetPassword)} className="space-y-4">
              <FormField
                control={resetPasswordForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password *</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showResetPassword ? 'text' : 'password'}
                            placeholder="Enter new password"
                            className="pr-10 font-mono"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowResetPassword(!showResetPassword)}
                          >
                            {showResetPassword ? (
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
                          onClick={copyResetPassword}
                          disabled={!field.value}
                          title="Copy password"
                        >
                          {resetPasswordCopied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Must be at least 8 characters. Share this password with the user.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsResetPasswordOpen(false)
                    setSelectedUserForReset(null)
                    resetPasswordForm.reset()
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Reset Password
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
