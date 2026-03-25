import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCompetitorMutations } from '@/hooks/useCompetitors'
import { useClients } from '@/hooks/useClients'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'

const INDUSTRY_OPTIONS = [
  { value: 'SaaS', label: 'SaaS', description: 'Software as a Service' },
  { value: 'Agency', label: 'Agency', description: 'Marketing or Creative Agency' },
  { value: 'Consulting', label: 'Consulting', description: 'Business Consulting' },
  { value: 'E-commerce', label: 'E-commerce', description: 'Online Retail' },
  { value: 'Fintech', label: 'Fintech', description: 'Financial Technology' },
  { value: 'Healthcare', label: 'Healthcare', description: 'Healthcare Services' },
  { value: 'Other', label: 'Other', description: 'Other Industry' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', description: 'Currently operating' },
  { value: 'inactive', label: 'Inactive', description: 'Not actively competing' },
  { value: 'acquired', label: 'Acquired', description: 'Acquired by another company' },
  { value: 'defunct', label: 'Defunct', description: 'No longer in business' },
]

const THREAT_LEVEL_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Minimal competitive threat' },
  { value: 'medium', label: 'Medium', description: 'Moderate competitive threat' },
  { value: 'high', label: 'High', description: 'Significant competitive threat' },
  { value: 'critical', label: 'Critical', description: 'Major competitive threat' },
]

const competitorFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  website: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(['active', 'inactive', 'acquired', 'defunct']).default('active'),
  threat_level: z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  target_market: z.string().optional(),
  pricing_model: z.string().optional(),
  client_id: z.string().optional().nullable(),
  tags: z.string().optional(), // comma-separated string, split on save
})

type CompetitorFormData = z.infer<typeof competitorFormSchema>

interface CompetitorFormProps {
  onSuccess?: () => void
}

export function CompetitorForm({ onSuccess }: CompetitorFormProps) {
  const { createCompetitor } = useCompetitorMutations()
  const { data: clients } = useClients()

  const clientOptions = (clients || []).map(c => ({
    value: c.id,
    label: c.name,
  }))

  const form = useForm<CompetitorFormData>({
    resolver: zodResolver(competitorFormSchema),
    defaultValues: {
      name: '',
      website: '',
      industry: '',
      status: 'active',
      threat_level: null,
      target_market: '',
      pricing_model: '',
      client_id: null,
      tags: '',
    },
  })

  // Scroll to first error on validation failure
  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: CompetitorFormData) => {
    // Parse comma-separated tags into array
    const tagsArray = data.tags
      ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []

    await createCompetitor.mutateAsync({
      name: data.name,
      website: data.website?.trim() || null,
      industry: data.industry || null,
      status: data.status,
      threat_level: data.threat_level || null,
      target_market: data.target_market?.trim() || null,
      pricing_model: data.pricing_model?.trim() || null,
      client_id: data.client_id || null,
      tags: tagsArray,
    })
    form.reset()
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Competitor Name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Corp" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={INDUSTRY_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select industry..."
                    searchPlaceholder="Search or type custom..."
                    emptyMessage="No industries found."
                    clearable
                  />
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
                    options={STATUS_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || 'active')}
                    placeholder="Select status..."
                    searchPlaceholder="Search statuses..."
                    emptyMessage="No statuses found."
                    clearable={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="threat_level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Threat Level</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={THREAT_LEVEL_OPTIONS}
                    value={field.value || ''}
                    onValueChange={(value) => field.onChange(value || null)}
                    placeholder="Select threat level..."
                    searchPlaceholder="Search levels..."
                    emptyMessage="No levels found."
                    clearable
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pricing_model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pricing Model</FormLabel>
                <FormControl>
                  <Input placeholder="Subscription, Per-seat, etc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="target_market"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target Market</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Who do they serve?"
                  className="resize-none"
                  rows={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="client_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Also a Client (optional)</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={clientOptions}
                  value={field.value || ''}
                  onValueChange={(value) => field.onChange(value || null)}
                  placeholder="Link to existing client..."
                  searchPlaceholder="Search clients..."
                  emptyMessage="No clients found."
                  clearable
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <Input placeholder="tag1, tag2, tag3 (comma-separated)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createCompetitor.isPending}>
          {createCompetitor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Competitor
        </Button>
      </form>
    </Form>
  )
}
