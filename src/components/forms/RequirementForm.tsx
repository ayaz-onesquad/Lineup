import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRequirementMutations } from '@/hooks/useRequirements'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { useSets, useSetsByProject } from '@/hooks/useSets'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const requirementSchema = z.object({
  // Filter fields (not persisted)
  client_id: z.string().optional(),
  project_id: z.string().optional(),
  // Actual fields - Set is optional (can be assigned later), Client is required contextually
  set_id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  requirement_type: z.enum([
    'task',
    'open_item',
    'technical',
    'support',
    'internal_deliverable',
    'client_deliverable',
  ]),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  importance: z.enum(['low', 'medium', 'high']),
  // Date fields: expected_due_date, actual_due_date, completed_date (due_date removed)
  expected_due_date: z.string().optional(),
  actual_due_date: z.string().optional(),
  completed_date: z.string().optional(),
  estimated_hours: z.coerce.number().optional(),
  assigned_to_id: z.string().optional(),
  requires_document: z.boolean(),
  requires_review: z.boolean(),
  show_in_client_portal: z.boolean(),
})

type RequirementFormData = z.infer<typeof requirementSchema>

interface RequirementFormProps {
  defaultValues?: Partial<RequirementFormData>
  onSuccess?: () => void
}

export function RequirementForm({ defaultValues, onSuccess }: RequirementFormProps) {
  const { createRequirement } = useRequirementMutations()
  const { data: clients } = useClients()
  const { data: allProjects } = useProjects()
  const { data: allSets } = useSets()
  const { data: users } = useTenantUsers()

  const form = useForm<RequirementFormData>({
    resolver: zodResolver(requirementSchema),
    defaultValues: {
      client_id: '',
      project_id: '',
      set_id: defaultValues?.set_id || '',
      title: '',
      description: '',
      requirement_type: 'task',
      urgency: 'medium',
      importance: 'medium',
      expected_due_date: '',
      actual_due_date: '',
      completed_date: '',
      estimated_hours: undefined,
      assigned_to_id: '',
      requires_document: false,
      requires_review: false,
      show_in_client_portal: false,
    },
  })

  // Watch filter fields for cascading
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
  const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })

  // Fetch sets by project when project is selected
  const { data: projectSets } = useSetsByProject(selectedProjectId || '')

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Get sets - either from project-specific query or filter all sets
  const filteredSets = useMemo(() => {
    if (selectedProjectId && projectSets) {
      return projectSets
    }
    if (!allSets) return []
    if (selectedProjectId) {
      return allSets.filter((s) => s.project_id === selectedProjectId)
    }
    if (selectedClientId) {
      const projectIds = filteredProjects.map((p) => p.id)
      return allSets.filter((s) => s.project_id && projectIds.includes(s.project_id))
    }
    return allSets
  }, [allSets, projectSets, selectedProjectId, selectedClientId, filteredProjects])

  // Reset dependent fields when parent changes
  useEffect(() => {
    if (selectedClientId) {
      // Reset project and set when client changes
      const currentProject = form.getValues('project_id')
      const currentSet = form.getValues('set_id')

      if (currentProject) {
        const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
        if (!projectStillValid) {
          form.setValue('project_id', '')
          form.setValue('set_id', '')
        }
      }

      if (currentSet) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
        }
      }
    }
  }, [selectedClientId, filteredProjects, filteredSets, form])

  useEffect(() => {
    if (selectedProjectId) {
      const currentSet = form.getValues('set_id')
      if (currentSet) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
        }
      }
    }
  }, [selectedProjectId, filteredSets, form])

  // Initialize from defaultValues - client_id auto-population
  useEffect(() => {
    // If client_id is passed from context (e.g., from ClientDetailPage), pre-select it
    if (defaultValues?.client_id && !form.getValues('client_id')) {
      form.setValue('client_id', defaultValues.client_id)
    }
  }, [defaultValues?.client_id, form])

  // Initialize from defaultValues - find client and project from set
  useEffect(() => {
    if (defaultValues?.set_id && allSets && allProjects) {
      const set = allSets.find((s) => s.id === defaultValues.set_id)
      if (set) {
        const project = allProjects.find((p) => p.id === set.project_id)
        if (project) {
          form.setValue('client_id', project.client_id)
          form.setValue('project_id', project.id)
        }
      }
    }
  }, [defaultValues?.set_id, allSets, allProjects, form])

  const onSubmit = async (data: RequirementFormData) => {
    // Validate client_id is required (even though it's just a filter field)
    if (!data.client_id) {
      form.setError('client_id', { message: 'Client is required' })
      return
    }
    // Extract only the fields we need (exclude filter fields, but include client_id for context)
    const { project_id, client_id, ...rest } = data
    // Ensure client_id is passed as string (already validated above)
    const requirementData = {
      ...rest,
      client_id: client_id as string,
      set_id: rest.set_id || undefined, // Convert empty string to undefined
    }
    await createRequirement.mutateAsync(requirementData)
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
      description: p.project_code,
    })),
    [filteredProjects]
  )

  const setOptions = useMemo(() =>
    filteredSets.map((s) => ({
      value: s.id,
      label: s.name,
      description: s.projects?.name,
    })),
    [filteredSets]
  )

  // IMPORTANT: Use user_profiles.id (not user_id) because FK references user_profiles table
  const userOptions = useMemo(() =>
    users?.filter((u) => u.user_profiles?.id).map((u) => ({
      value: u.user_profiles!.id,
      label: u.user_profiles?.full_name || 'Unknown',
    })) || [],
    [users]
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Cascading Filters - Client is required, Set/Project are optional */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client *</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={clientOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select client..."
                    searchPlaceholder="Search clients..."
                    emptyMessage="No clients found."
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
                <FormLabel>Project</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={projectOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="All projects"
                    searchPlaceholder="Search projects..."
                    emptyMessage="No projects found."
                    clearable
                    disabled={projectOptions.length === 0}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="set_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Set</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={setOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select set (optional)"
                    searchPlaceholder="Search sets..."
                    emptyMessage="No sets found."
                    clearable
                    disabled={setOptions.length === 0}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input placeholder="Create homepage mockup" {...field} />
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
                  placeholder="Describe the requirement..."
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
            name="requirement_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="open_item">Open Item</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="internal_deliverable">Internal Deliverable</SelectItem>
                    <SelectItem value="client_deliverable">Client Deliverable</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assigned_to_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assign To</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select assignee"
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

        {/* Schedule Section - due_date removed, using expected/actual due dates */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expected_due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Due Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="actual_due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Actual Due Date</FormLabel>
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
            name="completed_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Completed Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimated_hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Hours</FormLabel>
                <FormControl>
                  <Input type="number" step="0.5" placeholder="4" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-3">
          <FormField
            control={form.control}
            name="requires_document"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Requires Document</FormLabel>
                  <FormDescription>
                    A document must be attached to complete this requirement
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
            name="requires_review"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Requires Review</FormLabel>
                  <FormDescription>
                    This requirement needs to be reviewed before completion
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
            name="show_in_client_portal"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Show in Client Portal</FormLabel>
                  <FormDescription>
                    Make this requirement visible to the client
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={createRequirement.isPending}>
          {createRequirement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Requirement
        </Button>
      </form>
    </Form>
  )
}
