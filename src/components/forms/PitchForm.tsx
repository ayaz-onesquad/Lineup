import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePitchMutations } from '@/hooks/usePitches'
import { useSets } from '@/hooks/useSets'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { useTenantUsers } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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

const pitchSchema = z.object({
  // Set is required - pitches always belong to a set
  set_id: z.string().min(1, 'Set is required'),
  // Client and Project are helpers for filtering
  client_id: z.string().optional(),
  project_id: z.string().optional(),
  name: z.string().min(1, 'Pitch name is required'),
  description: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  show_in_client_portal: z.boolean(),
})

type PitchFormData = z.infer<typeof pitchSchema>

interface PitchFormProps {
  defaultValues?: Partial<PitchFormData>
  onSuccess?: () => void
}

export function PitchForm({ defaultValues, onSuccess }: PitchFormProps) {
  const { createPitch } = usePitchMutations()
  const { data: clients } = useClients()
  const { data: allProjects } = useProjects()
  const { data: allSets } = useSets()
  const { data: users } = useTenantUsers()

  const form = useForm<PitchFormData>({
    resolver: zodResolver(pitchSchema),
    defaultValues: {
      set_id: defaultValues?.set_id || '',
      client_id: defaultValues?.client_id || '',
      project_id: defaultValues?.project_id || '',
      name: '',
      description: '',
      urgency: 'medium',
      importance: 'medium',
      expected_start_date: '',
      expected_end_date: '',
      lead_id: '',
      secondary_lead_id: '',
      show_in_client_portal: false,
    },
  })

  // Watch filter fields for cascading
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
  const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Filter sets by selected client and project
  const filteredSets = useMemo(() => {
    if (!allSets) return []
    let filtered = allSets
    if (selectedClientId) {
      filtered = filtered.filter((s) => s.client_id === selectedClientId)
    }
    if (selectedProjectId) {
      filtered = filtered.filter((s) => s.project_id === selectedProjectId)
    }
    return filtered
  }, [allSets, selectedClientId, selectedProjectId])

  // Reset cascading fields when parent changes
  useEffect(() => {
    if (selectedClientId) {
      const currentProject = form.getValues('project_id')
      if (currentProject) {
        const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
        if (!projectStillValid) {
          form.setValue('project_id', '')
          form.setValue('set_id', '')
        }
      }
      // Reset set if not valid for new client
      const currentSet = form.getValues('set_id')
      if (currentSet) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
        }
      }
    }
  }, [selectedClientId, filteredProjects, filteredSets, form])

  // Initialize from defaultValues - derive client/project from set if provided
  useEffect(() => {
    if (defaultValues?.set_id && allSets) {
      const set = allSets.find((s) => s.id === defaultValues.set_id)
      if (set) {
        if (set.client_id && !form.getValues('client_id')) {
          form.setValue('client_id', set.client_id)
        }
        if (set.project_id && !form.getValues('project_id')) {
          form.setValue('project_id', set.project_id)
        }
      }
    }
  }, [defaultValues?.set_id, allSets, form])

  const onSubmit = async (data: PitchFormData) => {
    await createPitch.mutateAsync({
      set_id: data.set_id,
      name: data.name,
      description: data.description,
      urgency: data.urgency,
      importance: data.importance,
      expected_start_date: data.expected_start_date || undefined,
      expected_end_date: data.expected_end_date || undefined,
      lead_id: data.lead_id || undefined,
      secondary_lead_id: data.secondary_lead_id || undefined,
      show_in_client_portal: data.show_in_client_portal,
    })
    form.reset()
    onSuccess?.()
  }

  // Build options for selects
  const clientOptions = useMemo(
    () => clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  const projectOptions = useMemo(
    () =>
      filteredProjects.map((p) => ({
        value: p.id,
        label: p.name,
        description: `${p.project_code} - ${p.clients?.name || ''}`,
      })),
    [filteredProjects]
  )

  const setOptions = useMemo(
    () =>
      filteredSets.map((s) => ({
        value: s.id,
        label: s.name,
        description: s.projects?.name || s.clients?.name || '',
      })),
    [filteredSets]
  )

  // IMPORTANT: Use user_profiles.id (not user_id) because FK references user_profiles table
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Filter dropdowns to help find the right set */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Filter by Client</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={clientOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="All clients..."
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
            name="project_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Filter by Project</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={projectOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="All projects..."
                    searchPlaceholder="Search projects..."
                    emptyMessage="No projects found."
                    clearable
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="set_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Set *</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={setOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select set..."
                    searchPlaceholder="Search sets..."
                    emptyMessage="No sets found."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pitch Name *</FormLabel>
              <FormControl>
                <Input placeholder="MVP Features" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe this pitch..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="urgency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Urgency</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={URGENCY_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                      description: o.description,
                    }))}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || 'medium')}
                    placeholder="Select urgency"
                  />
                </FormControl>
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
                    options={IMPORTANCE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                      description: o.description,
                    }))}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || 'medium')}
                    placeholder="Select importance"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Schedule Section */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expected_start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Start</FormLabel>
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
                <FormLabel>Expected End</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Team Assignment */}
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
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select lead"
                    searchPlaceholder="Search team..."
                    emptyMessage="No team members found."
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
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select secondary lead"
                    searchPlaceholder="Search team..."
                    emptyMessage="No team members found."
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
          name="show_in_client_portal"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Show in Client Portal</FormLabel>
                <FormDescription>Make this pitch visible to the client</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createPitch.isPending}>
          {createPitch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Pitch
        </Button>
      </form>
    </Form>
  )
}
