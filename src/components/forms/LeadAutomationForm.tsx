import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLeadAutomationMutations } from '@/hooks/useLeadAutomations'
import { useScrollToError } from '@/hooks/useScrollToError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'
import type { LeadAutomation } from '@/services/api/leadAutomations'

const FREQUENCY_OPTIONS = [
  { value: 'manual', label: 'Manual Only', description: 'Run when I press Run Now' },
  { value: 'daily', label: 'Daily', description: 'Runs once per day automatically' },
  { value: 'weekly', label: 'Weekly', description: 'Runs once per week automatically' },
  { value: 'monthly', label: 'Monthly', description: 'Runs once per month automatically' },
]

const leadAutomationFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    search_query: z.string().min(1, 'Search query is required'),
    location: z.string().min(1, 'Location is required'),
    filter_no_website: z.boolean().default(false),
    filter_category: z.string().optional().nullable(),
    filter_min_rating: z.coerce.number().min(0).max(5).optional().nullable(),
    max_leads: z.coerce.number().int().min(1).max(500).default(50),
    frequency: z.enum(['manual', 'daily', 'weekly', 'monthly']).default('manual'),
  })

type LeadAutomationFormData = z.infer<typeof leadAutomationFormSchema>

interface LeadAutomationFormProps {
  onSuccess?: () => void
  editingAutomation?: LeadAutomation | null
}

export function LeadAutomationForm({ onSuccess, editingAutomation }: LeadAutomationFormProps) {
  const { createAutomation, updateAutomation } = useLeadAutomationMutations()
  const isEditing = !!editingAutomation

  const form = useForm<LeadAutomationFormData>({
    resolver: zodResolver(leadAutomationFormSchema),
    defaultValues: {
      name: editingAutomation?.name || '',
      search_query: editingAutomation?.search_query || '',
      location: editingAutomation?.location || '',
      filter_no_website: editingAutomation?.filter_no_website ?? false,
      filter_category: editingAutomation?.filter_category || '',
      filter_min_rating: editingAutomation?.filter_min_rating || undefined,
      max_leads: editingAutomation?.max_leads || 50,
      frequency: editingAutomation?.frequency || 'manual',
    },
  })

  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: LeadAutomationFormData) => {
    const payload = {
      name: data.name,
      search_query: data.search_query,
      location: data.location,
      filter_no_website: data.filter_no_website,
      filter_category: data.filter_category?.trim() || null,
      filter_min_rating: data.filter_min_rating || null,
      max_leads: data.max_leads,
      frequency: data.frequency,
    }

    if (isEditing) {
      await updateAutomation.mutateAsync({ id: editingAutomation.id, ...payload })
    } else {
      await createAutomation.mutateAsync(payload)
    }

    form.reset()
    onSuccess?.()
  }

  const isPending = createAutomation.isPending || updateAutomation.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-6">
        {/* Automation Identity */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Automation Identity</h4>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Automation Name</FormLabel>
                <FormControl>
                  <Input placeholder="Dental Clinics – Munster IN" {...field} />
                </FormControl>
                <FormDescription>A label for this search rule</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* What to Search For */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">What to Search For</h4>
          <FormField
            control={form.control}
            name="search_query"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Search Query</FormLabel>
                <FormControl>
                  <Input placeholder="dental clinics" {...field} />
                </FormControl>
                <FormDescription>
                  Type of business (e.g. "plumbers", "dental office", "law firm"). Be specific for
                  better results.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Munster, IN" {...field} />
                </FormControl>
                <FormDescription>City and state, or full address</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Filters</h4>

          <FormField
            control={form.control}
            name="filter_no_website"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Only businesses WITHOUT a website</FormLabel>
                  <FormDescription>
                    Perfect for finding web design and SEO leads — businesses that need your
                    services most
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="filter_category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="dentist"
                    value={field.value || ''}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>Narrow to a specific Google Maps category</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="filter_min_rating"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Rating (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    placeholder="0 = no minimum"
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Volume & Schedule */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Volume & Schedule</h4>

          <FormField
            control={form.control}
            name="max_leads"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Max Leads per Run</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 50)}
                  />
                </FormControl>
                <FormDescription>Maximum leads to fetch per run (1-500)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Frequency</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={FREQUENCY_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || 'manual')}
                    placeholder="Select frequency..."
                    searchPlaceholder="Search frequencies..."
                    emptyMessage="No frequencies found."
                    clearable={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Automation'}
        </Button>
      </form>
    </Form>
  )
}
