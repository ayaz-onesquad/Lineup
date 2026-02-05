import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClientMutations } from '@/hooks/useClients'
import { useContactMutations } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { INDUSTRY_OPTIONS, CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import type { IndustryType, ContactRole } from '@/types/database'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2, User } from 'lucide-react'

const clientSchema = z.object({
  // Client fields
  name: z.string().min(1, 'Client name is required'),
  industry: z.string().optional(),
  overview: z.string().optional(),
  location: z.string().optional(),
  portal_enabled: z.boolean(),
  // Primary contact fields (all optional)
  contact_first_name: z.string().optional(),
  contact_last_name: z.string().optional(),
  contact_email: z.string().email('Invalid email format').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  contact_role: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientFormProps {
  onSuccess?: () => void
}

export function ClientForm({ onSuccess }: ClientFormProps) {
  const { createClient } = useClientMutations()
  const { createContact } = useContactMutations()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      industry: '',
      overview: '',
      location: '',
      portal_enabled: true,
      contact_first_name: '',
      contact_last_name: '',
      contact_email: '',
      contact_phone: '',
      contact_role: '',
    },
  })

  const onSubmit = async (data: ClientFormData) => {
    // Create the client
    const client = await createClient.mutateAsync({
      name: data.name,
      company_name: data.name, // Use name as company_name
      industry: data.industry ? (data.industry as IndustryType) : undefined,
      overview: data.overview,
      location: data.location,
      portal_enabled: data.portal_enabled,
    })

    // If contact info provided, create primary contact
    if (data.contact_first_name || data.contact_last_name || data.contact_email) {
      try {
        await createContact.mutateAsync({
          client_id: client.id,
          first_name: data.contact_first_name || '',
          last_name: data.contact_last_name || '',
          email: data.contact_email || undefined,
          phone: data.contact_phone || undefined,
          role: data.contact_role ? (data.contact_role as ContactRole) : undefined,
          is_primary: true,
        })
      } catch (error) {
        // Contact creation failed, but client was created successfully
        console.error('Failed to create primary contact:', error)
      }
    }

    form.reset()
    onSuccess?.()
  }

  const industryOptions = INDUSTRY_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
  }))

  const roleOptions = CONTACT_ROLE_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
  }))

  const isSubmitting = createClient.isPending || createContact.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Client Information Section */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Acme Corporation" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={industryOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select industry..."
                    searchPlaceholder="Search industries..."
                    emptyMessage="No industry found."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="overview"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Overview</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Brief description of the client, their business, and key information..."
                    className="resize-none"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="City, State/Country" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Primary Contact Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-t pt-4">
            <User className="h-4 w-4" />
            Primary Contact
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="contact_first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="john.doe@company.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+1 (555) 000-0000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contact_role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={roleOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select role..."
                    searchPlaceholder="Search roles..."
                    emptyMessage="No role found."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Settings Section */}
        <FormField
          control={form.control}
          name="portal_enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Client Portal</FormLabel>
                <FormDescription>
                  Allow this client to access the client portal
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Client
        </Button>
      </form>
    </Form>
  )
}
