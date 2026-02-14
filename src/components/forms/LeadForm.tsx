import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLeadMutations } from '@/hooks/useLeads'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { REFERRAL_SOURCE_OPTIONS, INDUSTRY_OPTIONS } from '@/lib/utils'
import type { LeadStatus, CompanySize, ReferralSource } from '@/types/database'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'

const leadSchema = z.object({
  lead_name: z.string().min(1, 'Lead name is required'),
  description: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional().or(z.literal('')),
  estimated_value: z.number().optional(),
  estimated_close_date: z.string().optional(),
  source: z.string().optional(),
  lead_owner_id: z.string().optional(),
  notes: z.string().optional(),
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
  const { createLead } = useLeadMutations()
  const { data: users } = useTenantUsers()

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
      company_size: undefined,
      estimated_value: undefined,
      estimated_close_date: '',
      source: '',
      lead_owner_id: '',
      notes: '',
    },
  })

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

  const onSubmit = async (data: LeadFormData) => {
    await createLead.mutateAsync({
      lead_name: data.lead_name,
      description: data.description,
      status: data.status as LeadStatus,
      industry: data.industry,
      website: data.website,
      phone: data.phone,
      email: data.email || undefined,
      company_size: (data.company_size as CompanySize) || undefined,
      estimated_value: data.estimated_value,
      estimated_close_date: data.estimated_close_date || undefined,
      source: (data.source as ReferralSource) || undefined,
      lead_owner_id: data.lead_owner_id || undefined,
      notes: data.notes,
    })

    form.reset()
    onSuccess?.()
  }

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
          <Button type="submit" disabled={createLead.isPending}>
            {createLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Lead
          </Button>
        </div>
      </form>
    </Form>
  )
}
