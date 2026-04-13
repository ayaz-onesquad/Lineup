import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore, useTenantStore } from '@/stores'
import { authApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Building2, Shield, ChevronRight, Key, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
})

type ProfileForm = z.infer<typeof profileSchema>

export function SettingsPage() {
  const { user, profile, role, setProfile } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
    },
  })

  // Reset form when profile loads/changes
  useEffect(() => {
    if (profile) {
      form.reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      })
    }
  }, [profile?.id, form])

  const onSubmit = async (data: ProfileForm) => {
    if (!user?.id || !profile) return

    setIsSaving(true)
    try {
      const firstName = data.first_name.trim()
      const lastName = data.last_name.trim()
      const fullName = `${firstName} ${lastName}`.trim()

      const updatedProfile = await authApi.updateUserProfile(user.id, {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      })

      // Update authStore so rest of app reflects change immediately
      setProfile({
        ...profile,
        ...updatedProfile,
      })

      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved successfully.',
      })
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast({
        title: 'Failed to update profile',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Your personal information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
              )}
              <AvatarFallback className="text-lg">
                {getInitials(
                  profile?.first_name && profile?.last_name
                    ? `${profile.first_name} ${profile.last_name}`
                    : profile?.full_name || 'User'
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button variant="outline" size="sm">
                Change Avatar
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG or GIF. Max 2MB.
              </p>
            </div>
          </div>

          <Separator />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Jane" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Smith" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <FormLabel>Email</FormLabel>
                <Input value={user?.email || ''} disabled className="mt-2 bg-muted cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">
                  Email address cannot be changed here.
                </p>
              </div>

              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Organization Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
          <CardDescription>
            Your current organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-medium">Organization Name</p>
              <p className="text-muted-foreground">{currentTenant?.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Organization Slug</p>
              <p className="text-muted-foreground font-mono">{currentTenant?.slug}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Plan</p>
              <p className="text-muted-foreground capitalize">{currentTenant?.plan_tier}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your Role
          </CardTitle>
          <CardDescription>
            Your permissions in this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium capitalize">{role?.replace('_', ' ')}</p>
              <p className="text-sm text-muted-foreground">
                {role === 'org_admin' && 'Full access to manage organization'}
                {role === 'org_user' && 'Can manage projects and requirements'}
                {role === 'client_user' && 'Read-only access to client portal'}
                {role === 'sys_admin' && 'System administrator access'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your account security settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/settings/security">
            <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Change Password</p>
                  <p className="text-sm text-muted-foreground">
                    Update your password to keep your account secure
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
