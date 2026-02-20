import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreateClientWithContact, useCreateClient } from '@/hooks/useClients'
import { useAllContacts, useLinkContactToClient } from '@/hooks/useContacts'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { INDUSTRY_OPTIONS, CONTACT_ROLE_OPTIONS, REFERRAL_SOURCE_OPTIONS, CLIENT_STATUS_OPTIONS } from '@/lib/utils'
import type { IndustryType, ClientStatus, ContactRole, ReferralSource } from '@/types/database'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2, Plus, User } from 'lucide-react'

const clientSchema = z.object({
  // Client fields
  name: z.string().min(1, 'Client name is required'),
  status: z.enum(['active', 'inactive', 'onboarding', 'prospective']),
  industry: z.string().min(1, 'Industry is required'),
  industry_other: z.string().optional(),
  location: z.string().optional(),
  overview: z.string().optional(),
  portal_enabled: z.boolean(),
  referral_source: z.string().optional(),

  // Contact mode: 'none' (skip), 'existing', or 'new'
  contact_mode: z.enum(['none', 'existing', 'new']),

  // Existing contact selection
  existing_contact_id: z.string().optional(),

  // New contact fields (only required when contact_mode is 'new')
  contact_first_name: z.string().optional(),
  contact_last_name: z.string().optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  contact_role: z.string().optional(),
}).refine((data) => {
  // If creating new contact, first and last name are required
  if (data.contact_mode === 'new') {
    return data.contact_first_name && data.contact_first_name.length > 0 &&
           data.contact_last_name && data.contact_last_name.length > 0
  }
  // If selecting existing, contact ID is required
  if (data.contact_mode === 'existing') {
    return data.existing_contact_id && data.existing_contact_id.length > 0
  }
  return true
}, {
  message: 'Please select an existing contact or fill in the new contact details',
  path: ['contact_mode'],
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientFormProps {
  onSuccess?: () => void
}

export function ClientForm({ onSuccess }: ClientFormProps) {
  const createClientWithContact = useCreateClientWithContact()
  const createClient = useCreateClient()
  const linkContactToClient = useLinkContactToClient()
  const { data: contacts } = useAllContacts()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      status: 'onboarding',
      industry: '',
      industry_other: '',
      location: '',
      overview: '',
      portal_enabled: true,
      referral_source: '',
      contact_mode: 'new',
      existing_contact_id: '',
      contact_first_name: '',
      contact_last_name: '',
      contact_email: '',
      contact_phone: '',
      contact_role: '',
    },
  })

  const watchIndustry = form.watch('industry')
  const watchContactMode = form.watch('contact_mode')

  // Scroll to first error on validation failure
  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  // Build contact options for dropdown
  const contactOptions = useMemo(() =>
    contacts?.map((c) => ({
      value: c.id,
      label: `${c.first_name} ${c.last_name}`,
      description: c.email || undefined,
    })) || [],
    [contacts]
  )

  const onSubmit = async (data: ClientFormData) => {
    // Determine final industry value
    const finalIndustry = data.industry === 'other' && data.industry_other
      ? data.industry_other
      : data.industry

    if (data.contact_mode === 'new') {
      // Create the client with new primary contact
      await createClientWithContact.mutateAsync({
        client: {
          name: data.name,
          company_name: data.name,
          status: data.status as ClientStatus,
          industry: finalIndustry as IndustryType,
          location: data.location,
          overview: data.overview,
          portal_enabled: data.portal_enabled,
          referral_source: data.referral_source as ReferralSource || undefined,
        },
        contact: {
          first_name: data.contact_first_name!,
          last_name: data.contact_last_name!,
          email: data.contact_email || undefined,
          phone: data.contact_phone || undefined,
          role: data.contact_role as ContactRole || undefined,
        },
      })
    } else if (data.contact_mode === 'existing') {
      // Create client first, then link existing contact
      const client = await createClient.mutateAsync({
        name: data.name,
        company_name: data.name,
        status: data.status as ClientStatus,
        industry: finalIndustry as IndustryType,
        location: data.location,
        overview: data.overview,
        portal_enabled: data.portal_enabled,
        referral_source: data.referral_source as ReferralSource || undefined,
      })

      // Link the existing contact as primary
      await linkContactToClient.mutateAsync({
        client_id: client.id,
        contact_id: data.existing_contact_id!,
        is_primary: true,
      })
    } else {
      // Skip contact - create client without primary contact
      await createClient.mutateAsync({
        name: data.name,
        company_name: data.name,
        status: data.status as ClientStatus,
        industry: finalIndustry as IndustryType,
        location: data.location,
        overview: data.overview,
        portal_enabled: data.portal_enabled,
        referral_source: data.referral_source as ReferralSource || undefined,
      })
    }

    form.reset()
    onSuccess?.()
  }

  const industryOptions = INDUSTRY_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
  }))

  const isSubmitting = createClientWithContact.isPending || createClient.isPending || linkContactToClient.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-6">
        {/* Client Information Section */}
        <div className="space-y-4">
          {/* Top Row: Name and Status */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Status</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={CLIENT_STATUS_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                        description: o.description,
                      }))}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value || 'onboarding')}
                      placeholder="Select status..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Middle Row: Industry and Location */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Industry</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={industryOptions}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value || '')}
                      placeholder="Select industry..."
                      searchPlaceholder="Search industries..."
                      emptyMessage="No industry found."
                      clearable={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referral_source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referral Source</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={REFERRAL_SOURCE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value || '')}
                      placeholder="How did they find us?"
                      searchPlaceholder="Search sources..."
                      emptyMessage="No source found."
                      clearable
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Location Row */}
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="City, Country" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Conditional: Other Industry */}
          {watchIndustry === 'other' && (
            <FormField
              control={form.control}
              name="industry_other"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Specify Industry</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter custom industry" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Overview - full width */}
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

        {/* Primary Contact Section */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-medium">Primary Contact</h3>

          {/* Contact Mode Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={watchContactMode === 'none' ? 'default' : 'outline'}
              size="sm"
              onClick={() => form.setValue('contact_mode', 'none')}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              type="button"
              variant={watchContactMode === 'existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => form.setValue('contact_mode', 'existing')}
              className="flex-1"
            >
              <User className="mr-2 h-4 w-4" />
              Select Existing
            </Button>
            <Button
              type="button"
              variant={watchContactMode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => form.setValue('contact_mode', 'new')}
              className="flex-1"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New
            </Button>
          </div>

          {/* Existing Contact Selection */}
          {watchContactMode === 'existing' && (
            <FormField
              control={form.control}
              name="existing_contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Select Contact</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={contactOptions}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value || '')}
                      placeholder="Search contacts..."
                      searchPlaceholder="Search by name or email..."
                      emptyMessage="No contacts found."
                    />
                  </FormControl>
                  <FormDescription>
                    Choose from your existing contacts
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* New Contact Fields */}
          {watchContactMode === 'new' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contact_first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="John" />
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
                      <FormLabel required>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Doe" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="john@example.com" />
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
                        <Input {...field} placeholder="+1 (555) 123-4567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="contact_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={CONTACT_ROLE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        value={field.value}
                        onValueChange={(value) => field.onChange(value || '')}
                        placeholder="Select role..."
                        searchPlaceholder="Search roles..."
                        emptyMessage="No role found."
                        clearable
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Client
        </Button>
      </form>
    </Form>
  )
}
