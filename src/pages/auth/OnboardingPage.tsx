import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTenant } from '@/hooks/useTenant'
import { useUserRole } from '@/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Building2 } from 'lucide-react'
import { generateSlug } from '@/lib/utils'

const onboardingSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
})

type OnboardingForm = z.infer<typeof onboardingSchema>

export function OnboardingPage() {
  const navigate = useNavigate()
  const { tenants, createTenant, isLoading: tenantsLoading } = useTenant()
  const { role, isLoading: roleLoading } = useUserRole()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: '',
      slug: '',
    },
  })

  // Watch name to auto-generate slug
  const watchName = form.watch('name')
  useEffect(() => {
    if (watchName) {
      form.setValue('slug', generateSlug(watchName))
    }
  }, [watchName, form])

  // Single redirect logic - handles all cases
  useEffect(() => {
    // Wait for data to load
    if (roleLoading || tenantsLoading) return
    // Don't redirect while submitting
    if (isSubmitting) return

    // Sys admin goes to admin portal
    if (role === 'sys_admin') {
      navigate('/admin', { replace: true })
      return
    }

    // User with tenants goes to dashboard
    if (tenants.length > 0) {
      navigate('/dashboard', { replace: true })
      return
    }
  }, [roleLoading, tenantsLoading, role, tenants.length, navigate, isSubmitting])

  const onSubmit = async (data: OnboardingForm) => {
    setIsSubmitting(true)
    try {
      await createTenant.mutateAsync({
        name: data.name,
        slug: data.slug,
      })
      // Navigate after successful creation
      navigate('/dashboard', { replace: true })
    } catch {
      // Error is handled by the mutation's onError
    } finally {
      // Always reset submitting state to allow retry
      setIsSubmitting(false)
    }
  }

  // Show loading while checking role and tenants
  if (tenantsLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create Your Organization</CardTitle>
          <CardDescription>
            Set up your organization to start managing projects with LineUp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Digital Agency" {...field} />
                    </FormControl>
                    <FormDescription>
                      This is how your organization will appear to team members
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization URL</FormLabel>
                    <FormControl>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                          lineup.app/
                        </span>
                        <Input
                          className="rounded-l-none"
                          placeholder="acme-digital"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      This will be your unique organization identifier
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Organization
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
