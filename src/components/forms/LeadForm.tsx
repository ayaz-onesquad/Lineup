import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLeadMutations } from '@/hooks/useLeads'
import { useTenantUsers } from '@/hooks/useTenant'
import { useAllContacts, useCreateContact } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { REFERRAL_SOURCE_OPTIONS, INDUSTRY_OPTIONS, CONTACT_ROLE_OPTIONS } from '@/lib/utils'
import type { LeadStatus, CompanySize, ReferralSource, ContactRole } from '@/types/database'
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

const leadSchema = z.object({
  lead_name: z.string().min(1, 'Lead name is required'),
  description: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  city: z.string().optional(),
  state: z.string().optional(),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional().or(z.literal('')),
  estimated_value: z.number().optional(),
  estimated_close_date: z.string().optional(),
  source: z.string().optional(),
  lead_owner_id: z.string().optional(),
  notes: z.string().optional(),

  // Primary contact fields
  contact_mode: z.enum(['none', 'existing', 'new']),
  existing_contact_id: z.string().optional(),
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

type LeadFormData = z.infer<typeof leadSchema>

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
]

const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '500+', label: '500+ employees' },
]

interface LeadFormProps {
  defaultValues?: Record<string, unknown>
  onSuccess?: () => void
}

export function LeadForm({ defaultValues, onSuccess }: LeadFormProps) {
  const { createLead, linkContact } = useLeadMutations()
  const { data: users } = useTenantUsers()
  const { data: contacts } = useAllContacts()
  const createContact = useCreateContact()

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      lead_name: (defaultValues?.lead_name as string) || '',
      description: '',
      status: 'new',
      industry: '',
      website: '',
      phone: '',
      email: '',
      city: '',
      state: '',
      company_size: undefined,
      estimated_value: undefined,
      estimated_close_date: '',
      source: '',
      lead_owner_id: '',
      notes: '',
      contact_mode: 'none',
      existing_contact_id: '',
      contact_first_name: '',
      contact_last_name: '',
      contact_email: '',
      contact_phone: '',
      contact_role: '',
    },
  })

  const watchContactMode = form.watch('contact_mode')

  // Build user options
  const userOptions = useMemo(
    () =>
      users
        ?.filter((u) => u.user_profiles?.id)
        .map((u) => ({
          value: u.user_profiles!.id,
          label: u.user_profiles?.full_name || 'Unknown',
        })) || [],
    [users]
  )

  // Build contact options for dropdown
  const contactOptions = useMemo(() =>
    contacts?.map((c) => ({
      value: c.id,
      label: `${c.first_name} ${c.last_name}`,
      description: c.email || undefined,
    })) || [],
    [contacts]
  )

  const onSubmit = async (data: LeadFormData) => {
    // 1. Create the lead first
    const lead = await createLead.mutateAsync({
      lead_name: data.lead_name,
      description: data.description,
      status: data.status as LeadStatus,
      industry: data.industry,
      website: data.website,
      phone: data.phone,
      email: data.email || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      company_size: (data.company_size as CompanySize) || undefined,
      estimated_value: data.estimated_value,
      estimated_close_date: data.estimated_close_date || undefined,
      source: (data.source as ReferralSource) || undefined,
      lead_owner_id: data.lead_owner_id || undefined,
      notes: data.notes,
    })

    // 2. Handle contact linking
    if (data.contact_mode === 'new' && data.contact_first_name && data.contact_last_name) {
      // Create new contact then link to lead
      const newContact = await createContact.mutateAsync({
        first_name: data.contact_first_name,
        last_name: data.contact_last_name,
        email: data.contact_email || undefined,
        phone: data.contact_phone || undefined,
        role: data.contact_role as ContactRole || undefined,
      })

      // Link the new contact to the lead as primary
      await linkContact.mutateAsync({
        lead_id: lead.id,
        contact_id: newContact.id,
        is_primary: true,
        role_at_lead: data.contact_role || undefined,
      })
    } else if (data.contact_mode === 'existing' && data.existing_contact_id) {
      // Link existing contact to lead as primary
      await linkContact.mutateAsync({
        lead_id: lead.id,
        contact_id: data.existing_contact_id,
        is_primary: true,
      })
    }

    form.reset()
    onSuccess?.()
  }

  const isSubmitting = createLead.isPending || createContact.isPending || linkContact.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Lead Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="lead_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Company or person name" {...field} />
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
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={STATUS_OPTIONS}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select status..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Brief description of the lead..." {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Company Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Company Details</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={[...INDUSTRY_OPTIONS]}
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      placeholder="Select industry..."
                      clearable
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company_size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Size</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={COMPANY_SIZE_OPTIONS}
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      placeholder="Select size..."
                      clearable
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input placeholder="https://example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Contact Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="lead@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
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
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder="State" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Sales Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Sales Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="estimated_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Value</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimated_close_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected Close Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={[...REFERRAL_SOURCE_OPTIONS]}
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      placeholder="How did they find you?"
                      clearable
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lead_owner_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Owner</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={userOptions}
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      placeholder="Assign to..."
                      clearable
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

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
                  <FormLabel>Select Contact *</FormLabel>
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
                      <FormLabel>First Name *</FormLabel>
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
                      <FormLabel>Last Name *</FormLabel>
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

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Any additional notes..." {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Lead
          </Button>
        </div>
      </form>
    </Form>
  )
}
