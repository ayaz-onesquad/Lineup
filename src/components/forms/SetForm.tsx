import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSetMutations } from '@/hooks/useSets'
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

const setSchema = z.object({
  // Filter field (not persisted)
  client_id: z.string().optional(),
  // Actual fields
  project_id: z.string().min(1, 'Project is required'),
  phase_id: z.string().optional(),
  name: z.string().min(1, 'Set name is required'),
  description: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  due_date: z.string().optional(),
  owner_id: z.string().optional(),
  lead_id: z.string().optional(),
  secondary_lead_id: z.string().optional(),
  pm_id: z.string().optional(),
  show_in_client_portal: z.boolean(),
})

type SetFormData = z.infer<typeof setSchema>

interface SetFormProps {
  defaultValues?: Partial<SetFormData>
  onSuccess?: () => void
}

export function SetForm({ defaultValues, onSuccess }: SetFormProps) {
  const { createSet } = useSetMutations()
  const { data: clients } = useClients()
  const { data: allProjects } = useProjects()
  const { data: users } = useTenantUsers()

  const form = useForm<SetFormData>({
    resolver: zodResolver(setSchema),
    defaultValues: {
      client_id: '',
      project_id: defaultValues?.project_id || '',
      phase_id: defaultValues?.phase_id || '',
      name: '',
      description: '',
      urgency: 'medium',
      importance: 'medium',
      due_date: '',
      owner_id: '',
      lead_id: '',
      secondary_lead_id: '',
      pm_id: '',
      show_in_client_portal: false,
    },
  })

  // Watch filter fields for cascading
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Reset project when client changes if current project is not valid
  useEffect(() => {
    if (selectedClientId) {
      const currentProject = form.getValues('project_id')
      if (currentProject) {
        const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
        if (!projectStillValid) {
          form.setValue('project_id', '')
        }
      }
    }
  }, [selectedClientId, filteredProjects, form])

  // Initialize from defaultValues - find client from project
  useEffect(() => {
    if (defaultValues?.project_id && allProjects) {
      const project = allProjects.find((p) => p.id === defaultValues.project_id)
      if (project) {
        form.setValue('client_id', project.client_id)
      }
    }
  }, [defaultValues?.project_id, allProjects, form])

  const onSubmit = async (data: SetFormData) => {
    // Extract only the fields we need (exclude filter fields)
    const { client_id, ...setData } = data
    await createSet.mutateAsync(setData)
    form.reset()
    onSuccess?.()
  }

  // Build options for selects
  const clientOptions = useMemo(() =>
    clients?.map((c) => ({ value: c.id, label: c.name })) || [],
    [clients]
  )

  const projectOptions = useMemo(() =>
    filteredProjects.map((p) => ({
      value: p.id,
      label: p.name,
      description: `${p.project_code} • ${p.clients?.name || ''}`,
    })),
    [filteredProjects]
  )

  const userOptions = useMemo(() =>
    users?.map((u) => ({
      value: u.user_id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Cascading Filters */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={clientOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="All clients"
                    searchPlaceholder="Search clients..."
                    emptyMessage="No clients found."
                    clearable
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="project_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project *</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={projectOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select project..."
                    searchPlaceholder="Search projects..."
                    emptyMessage="No projects found."
                    disabled={projectOptions.length === 0}
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
              <FormLabel>Set Name *</FormLabel>
              <FormControl>
                <Input placeholder="Create Mockups" {...field} />
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
                  placeholder="Describe this set..."
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

        <FormField
          control={form.control}
          name="due_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Team Assignment */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="owner_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select owner"
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
        </div>

        <div className="grid grid-cols-2 gap-4">
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

          <FormField
            control={form.control}
            name="pm_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project Manager</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select PM"
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
                <FormDescription>
                  Make this set visible to the client
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={createSet.isPending}>
          {createSet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Set
        </Button>
      </form>
    </Form>
  )
}
