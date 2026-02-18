import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTenantUsers } from '@/hooks/useTenant'
import { useTenantStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { tenantsApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Plus, Users, Loader2, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react'
import { getInitials, formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { isValidEmail } from '@/lib/security'
import type { UserRole } from '@/types/database'

// Error message parser for user creation
function parseUserCreationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('permission denied') || message.includes('42501')) {
    return 'Permission denied. You may not have admin rights for this tenant.'
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

// Form schema for creating a user
// OrgAdmins can only create org_user - role is hardcoded
const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.literal('org_user'), // Hardcoded - OrgAdmins cannot select roles
  phone: z.string().optional(),
  sendWelcomeEmail: z.boolean(),
})

type CreateUserFormData = z.infer<typeof createUserSchema>

export function TeamPage() {
  const navigate = useNavigate()
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(true)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const { data: users, isLoading, refetch: refetchUsers } = useTenantUsers()
  const { role: currentUserRole, isLoading: roleLoading } = useUserRole()
  const { currentTenant } = useTenantStore()
  const currentTenantId = currentTenant?.id
  const queryClient = useQueryClient()

  const isAdmin = currentUserRole === 'org_admin' || currentUserRole === 'sys_admin'

  // Route protection: redirect non-admins to dashboard
  useEffect(() => {
    if (roleLoading) return // Wait for role to load
    if (!isAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAdmin, roleLoading, navigate])

  // Email existence checking state
  const [emailExists, setEmailExists] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const emailCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced email check function
  const checkEmailExists = useCallback(async (email: string) => {
    // Clear any pending check
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current)
    }

    // Reset state if email is empty or invalid
    if (!email || !isValidEmail(email)) {
      setEmailExists(false)
      setIsCheckingEmail(false)
      return
    }

    setIsCheckingEmail(true)

    // Debounce the API call
    emailCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const exists = await tenantsApi.checkEmailExists(email)
        setEmailExists(exists)
      } catch (error) {
        console.error('Error checking email:', error)
        setEmailExists(false)
      } finally {
        setIsCheckingEmail(false)
      }
    }, 500) // 500ms debounce
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (emailCheckTimeoutRef.current) {
        clearTimeout(emailCheckTimeoutRef.current)
      }
    }
  }, [])

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
      sendWelcomeEmail: true,
    },
  })

  // Copy password to clipboard
  const copyPassword = () => {
    const password = createUserForm.getValues('password')
    if (password) {
      navigator.clipboard.writeText(password)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
  }

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      // Pre-flight validation
      if (!currentTenantId) {
        throw new Error('No tenant selected. Please refresh and try again.')
      }
      if (!isAdmin) {
        throw new Error('You do not have permission to create users.')
      }
      if (!isValidEmail(data.email)) {
        throw new Error('Please enter a valid email address.')
      }
      if (data.password.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      // Backup check: verify email doesn't exist before committing
      const exists = await tenantsApi.checkEmailExists(data.email)
      if (exists) {
        throw new Error('A user with this email already exists.')
      }

      return tenantsApi.createUser(currentTenantId, {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role as UserRole,
        sendWelcomeEmail: data.sendWelcomeEmail,
      })
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tenantUsers'] })
      // Force immediate refetch to show the new user
      refetchUsers()
      toast({
        title: 'User created successfully',
        description: (
          <div className="space-y-2">
            <p><strong>Email:</strong> {variables.email}</p>
            <p><strong>Password:</strong> <code className="bg-muted px-1 py-0.5 rounded font-mono text-sm">{variables.password}</code></p>
            <p className="text-sm text-muted-foreground">Share these credentials with the user.</p>
          </div>
        ),
        duration: 15000,
      })
      setCreateUserOpen(false)
      createUserForm.reset()
      setShowPassword(true)
      setEmailExists(false)
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
    if (!currentTenantId) {
      toast({
        title: 'No tenant selected',
        description: 'Please refresh the page and try again.',
        variant: 'destructive',
      })
      return
    }

    if (!isAdmin) {
      toast({
        title: 'Permission denied',
        description: 'You do not have permission to create users.',
        variant: 'destructive',
      })
      return
    }

    createUserMutation.mutate(data)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'sys_admin':
        return 'bg-red-100 text-red-800'
      case 'org_admin':
        return 'bg-purple-100 text-purple-800'
      case 'org_user':
        return 'bg-blue-100 text-blue-800'
      case 'client_user':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Show loading while checking role
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Don't render anything if not admin (redirect will happen)
  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground">Manage team members and access</p>
        </div>
        {isAdmin && (
          <Dialog open={createUserOpen} onOpenChange={(open) => {
            setCreateUserOpen(open)
            if (!open) {
              setEmailExists(false)
              setIsCheckingEmail(false)
            }
          }}>
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
                  Add a new team member to your organization
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
                          <div className="relative">
                            <Input
                              type="email"
                              placeholder="john.doe@example.com"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e)
                                checkEmailExists(e.target.value)
                              }}
                              className={emailExists ? 'border-destructive pr-10' : ''}
                            />
                            {isCheckingEmail && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            {!isCheckingEmail && emailExists && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              </div>
                            )}
                          </div>
                        </FormControl>
                        {emailExists && (
                          <p className="text-sm font-medium text-destructive">
                            A user with this email already exists
                          </p>
                        )}
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

                  {/* Role is hardcoded to org_user - OrgAdmins cannot select roles */}
                  {/* Only SysAdmins can change roles via Admin Portal */}
                  <FormField
                    control={createUserForm.control}
                    name="role"
                    render={() => (
                      <FormItem>
                        <FormLabel>User Role</FormLabel>
                        <div className="flex items-center gap-2 h-10">
                          <Badge className="bg-blue-100 text-blue-800">Team Member</Badge>
                          <span className="text-xs text-muted-foreground">
                            (Role assigned automatically)
                          </span>
                        </div>
                        <FormDescription>
                          Contact a System Administrator to change user roles.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

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
                      onClick={() => {
                        setCreateUserOpen(false)
                        setEmailExists(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createUserMutation.isPending || emailExists || isCheckingEmail}
                    >
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
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            {users?.length || 0} members in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8">
                    <p className="text-muted-foreground">No team members yet</p>
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {getInitials(user.user_profiles?.full_name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {user.user_profiles?.full_name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {user.role.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.status === 'active' ? 'success' : 'secondary'}
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
