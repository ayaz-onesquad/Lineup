import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePhaseMutations } from '@/hooks'
import { useProjects } from '@/hooks'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { URGENCY_OPTIONS, IMPORTANCE_OPTIONS } from '@/lib/utils'
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

const phaseSchema = z.object({
  project_id: z.string().min(1, 'Project is required'),
  name: z.string().min(1, 'Phase name is required'),
  description: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  notes: z.string().optional(),
})

type PhaseFormData = z.infer<typeof phaseSchema>

interface PhaseFormProps {
  defaultValues?: Partial<PhaseFormData>
  onSuccess?: () => void
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
]

export function PhaseForm({ defaultValues, onSuccess }: PhaseFormProps) {
  const { createPhase } = usePhaseMutations()
  const { data: projects } = useProjects()
  const { data: users } = useTenantUsers()

  const form = useForm<PhaseFormData>({
    resolver: zodResolver(phaseSchema),
    defaultValues: {
      project_id: defaultValues?.project_id || '',
      name: '',
      description: '',
      status: 'not_started',
      urgency: 'medium',
      importance: 'medium',
      expected_start_date: '',
      expected_end_date: '',
      lead_id: '',
      secondary_lead_id: '',
      notes: '',
    },
  })

  // Build options
  const projectOptions = useMemo(
    () =>
      projects?.map((p) => ({
        value: p.id,
        label: p.name,
        description: `${p.project_code} • ${p.clients?.name || ''}`,
      })) || [],
    [projects]
  )

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

  // Initialize project_id from defaultValues
  useEffect(() => {
    if (defaultValues?.project_id) {
      form.setValue('project_id', defaultValues.project_id)
    }
  }, [defaultValues?.project_id, form])

  const onSubmit = async (data: PhaseFormData) => {
    await createPhase.mutateAsync({
      project_id: data.project_id,
      name: data.name,
      description: data.description || undefined,
      status: data.status,
      urgency: data.urgency,
      importance: data.importance,
      expected_start_date: data.expected_start_date || undefined,
      expected_end_date: data.expected_end_date || undefined,
      lead_id: data.lead_id || undefined,
      secondary_lead_id: data.secondary_lead_id || undefined,
      notes: data.notes || undefined,
    })
    form.reset()
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Project */}
        <FormField
          control={form.control}
          name="project_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Project <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <SearchableSelect
                  options={projectOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select project..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Phase Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phase Name <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g., Discovery, Design, Development" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe the phase objectives and deliverables..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status */}
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
                  onChange={field.onChange}
                  placeholder="Select status..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Priority (Urgency + Importance) */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="urgency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Urgency</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={URGENCY_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  How soon must this be done?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="importance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Importance</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={IMPORTANCE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  How critical to goals?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expected_start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expected_end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Team */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="lead_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lead</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Select lead..."
                    clearable
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="secondary_lead_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Secondary Lead</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Select secondary lead..."
                    clearable
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes about this phase..."
                  rows={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onSuccess}>
            Cancel
          </Button>
          <Button type="submit" disabled={createPhase.isPending}>
            {createPhase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Phase
          </Button>
        </div>
      </form>
    </Form>
  )
}
