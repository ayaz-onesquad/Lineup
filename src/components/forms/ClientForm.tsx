import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClientMutations } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INDUSTRY_OPTIONS } from '@/lib/utils'
import type { IndustryType, ClientStatus } from '@/types/database'
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

const clientSchema = z.object({
  // Client fields
  name: z.string().min(1, 'Client name is required'),
  status: z.enum(['active', 'inactive']),
  industry: z.string().min(1, 'Industry is required'),
  industry_other: z.string().optional(),
  location: z.string().optional(),
  overview: z.string().optional(),
  portal_enabled: z.boolean(),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientFormProps {
  onSuccess?: () => void
}

export function ClientForm({ onSuccess }: ClientFormProps) {
  const { createClient } = useClientMutations()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      status: 'active',
      industry: '',
      industry_other: '',
      location: '',
      overview: '',
      portal_enabled: true,
    },
  })

  const watchIndustry = form.watch('industry')

  const onSubmit = async (data: ClientFormData) => {
    // Determine final industry value
    const finalIndustry = data.industry === 'other' && data.industry_other
      ? (data.industry_other as IndustryType)
      : (data.industry as IndustryType)

    // Create the client
    await createClient.mutateAsync({
      name: data.name,
      company_name: data.name, // Use name as company_name
      status: data.status as ClientStatus,
      industry: finalIndustry,
      location: data.location,
      overview: data.overview,
      portal_enabled: data.portal_enabled,
    })

    form.reset()
    onSuccess?.()
  }

  const industryOptions = INDUSTRY_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
  }))

  const isSubmitting = createClient.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Client Information Section */}
        <div className="space-y-4">
          {/* Top Row: Name and Status */}
          <div className="grid grid-cols-2 gap-4">
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <FormLabel>Industry *</FormLabel>
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
          </div>

          {/* Conditional: Other Industry */}
          {watchIndustry === 'other' && (
            <FormField
              control={form.control}
              name="industry_other"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specify Industry *</FormLabel>
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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Client
        </Button>
      </form>
    </Form>
  )
}
