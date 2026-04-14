import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRequirementMutations } from '@/hooks/useRequirements'
import { useClients } from '@/hooks/useClients'
import { useProjects } from '@/hooks/useProjects'
import { useSets, useSetsByProject, useSetsByPhase } from '@/hooks/useSets'
import { usePhasesByProject } from '@/hooks/usePhases'
import { usePitchesBySet } from '@/hooks/usePitches'
import { useTenantUsers } from '@/hooks/useTenant'
import { useScrollToError } from '@/hooks/useScrollToError'
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
  phase_id: z.string().optional(),
  // Actual fields - Set is optional (can be assigned later), Client is required contextually
  set_id: z.string().optional(),
  pitch_id: z.string().optional(),
  is_task: z.boolean(),
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
  reviewer_id: z.string().optional(),
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
      client_id: defaultValues?.client_id || '',
      project_id: defaultValues?.project_id || '',
      phase_id: defaultValues?.phase_id || '',
      set_id: defaultValues?.set_id || '',
      pitch_id: defaultValues?.pitch_id || '',
      is_task: defaultValues?.is_task ?? false,
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
      reviewer_id: '',
      show_in_client_portal: false,
    },
  })

  // Watch filter fields for cascading
  const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
  const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })
  const selectedPhaseId = useWatch({ control: form.control, name: 'phase_id' })
  const selectedSetId = useWatch({ control: form.control, name: 'set_id' })
  const requiresReview = useWatch({ control: form.control, name: 'requires_review' })

  // Fetch phases by project, sets by project/phase, pitches by set
  const { data: projectPhases } = usePhasesByProject(selectedProjectId || '')
  const { data: projectSets } = useSetsByProject(selectedProjectId || '')
  const { data: phaseSets } = useSetsByPhase(selectedPhaseId || '')
  const { data: setPitches } = usePitchesBySet(selectedSetId || '')

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!allProjects) return []
    if (!selectedClientId) return allProjects
    return allProjects.filter((p) => p.client_id === selectedClientId)
  }, [allProjects, selectedClientId])

  // Get sets - filter by phase > project > client (cascading)
  const filteredSets = useMemo(() => {
    // Phase-specific sets take priority
    if (selectedPhaseId && phaseSets) {
      return phaseSets
    }
    // Project-specific sets
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
  }, [allSets, projectSets, phaseSets, selectedProjectId, selectedPhaseId, selectedClientId, filteredProjects])

  // Build phase options for selected project
  const phaseOptions = useMemo(() =>
    projectPhases?.map((p) => ({
      value: p.id,
      label: p.name,
      description: `Order: ${p.phase_order}`,
    })) || [],
    [projectPhases]
  )

  // Build pitch options for selected set
  const pitchOptions = useMemo(() =>
    setPitches?.map((p) => ({
      value: p.id,
      label: p.name,
    })) || [],
    [setPitches]
  )

  // Reset dependent fields when parent changes
  useEffect(() => {
    if (selectedClientId) {
      // Reset project, phase, set, pitch when client changes
      const currentProject = form.getValues('project_id')
      const currentSet = form.getValues('set_id')

      if (currentProject) {
        const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
        if (!projectStillValid) {
          form.setValue('project_id', '')
          form.setValue('phase_id', '')
          form.setValue('set_id', '')
          form.setValue('pitch_id', '')
        }
      }

      if (currentSet) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
          form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedClientId, filteredProjects, filteredSets, form])

  useEffect(() => {
    if (selectedProjectId) {
      // Reset phase and set when project changes
      const currentPhase = form.getValues('phase_id')
      const currentSet = form.getValues('set_id')
      if (currentPhase) {
        const phaseStillValid = projectPhases?.some((p) => p.id === currentPhase)
        if (!phaseStillValid) {
          form.setValue('phase_id', '')
        }
      }
      if (currentSet) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
          form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedProjectId, projectPhases, filteredSets, form])

  // Reset pitch when set changes
  useEffect(() => {
    if (selectedSetId) {
      const currentPitch = form.getValues('pitch_id')
      if (currentPitch) {
        const pitchStillValid = setPitches?.some((p) => p.id === currentPitch)
        if (!pitchStillValid) {
          form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedSetId, setPitches, form])

  // Initialize from defaultValues - client_id auto-population
  useEffect(() => {
    // If client_id is passed from context (e.g., from ClientDetailPage), pre-select it
    if (defaultValues?.client_id && !form.getValues('client_id')) {
      form.setValue('client_id', defaultValues.client_id)
    }
  }, [defaultValues?.client_id, form])

  // Initialize from defaultValues - derive client_id from project_id
  useEffect(() => {
    // If client_id is already set via defaultValues, don't override
    if (defaultValues?.client_id) return

    // If project_id is provided, derive client_id from project
    if (defaultValues?.project_id && allProjects) {
      const project = allProjects.find((p) => p.id === defaultValues.project_id)
      if (project?.client_id && !form.getValues('client_id')) {
        form.setValue('client_id', project.client_id)
      }
    }
  }, [defaultValues?.project_id, defaultValues?.client_id, allProjects, form])

  // Initialize from defaultValues - find client, project, and phase from set
  useEffect(() => {
    if (defaultValues?.set_id && allSets && allProjects) {
      const set = allSets.find((s) => s.id === defaultValues.set_id)
      if (set) {
        const project = allProjects.find((p) => p.id === set.project_id)
        if (project) {
          form.setValue('client_id', project.client_id)
          form.setValue('project_id', project.id)
        }
        // Also set phase_id if the set has one
        if (set.phase_id) {
          form.setValue('phase_id', set.phase_id)
        }
      }
    }
  }, [defaultValues?.set_id, allSets, allProjects, form])

  // Initialize phase_id directly from defaultValues
  useEffect(() => {
    if (defaultValues?.phase_id && !form.getValues('phase_id')) {
      form.setValue('phase_id', defaultValues.phase_id)
    }
  }, [defaultValues?.phase_id, form])

  // Initialize pitch_id directly from defaultValues
  useEffect(() => {
    if (defaultValues?.pitch_id && !form.getValues('pitch_id')) {
      form.setValue('pitch_id', defaultValues.pitch_id)
    }
  }, [defaultValues?.pitch_id, form])

  // Scroll to first error on validation failure
  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: RequirementFormData) => {
    // Validate client_id is required (even though it's just a filter field)
    if (!data.client_id) {
      form.setError('client_id', { message: 'Client is required' })
      return
    }
    // Extract only the fields we need (exclude filter fields, but include client_id for context)
    const { project_id, phase_id, client_id, ...rest } = data
    // Ensure client_id is passed as string (already validated above)
    const requirementData = {
      ...rest,
      client_id: client_id as string,
      set_id: rest.set_id || undefined, // Convert empty string to undefined
      pitch_id: rest.pitch_id || undefined, // Convert empty string to undefined
      is_task: rest.is_task,
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
      <form onSubmit={form.handleSubmit(onSubmit, scrollToFirstError)} className="space-y-4">
        {/* Cascading Filters - Client is required, others optional */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Client</FormLabel>
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
            name="phase_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phase</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={phaseOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select phase (optional)"
                    searchPlaceholder="Search phases..."
                    emptyMessage={selectedProjectId ? "No phases found." : "Select a project first."}
                    clearable
                    disabled={!selectedProjectId || phaseOptions.length === 0}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
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

          <FormField
            control={form.control}
            name="pitch_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pitch</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={pitchOptions}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select pitch (optional)"
                    searchPlaceholder="Search pitches..."
                    emptyMessage={selectedSetId ? "No pitches found." : "Select a set first."}
                    clearable
                    disabled={!selectedSetId || pitchOptions.length === 0}
                  />
                </FormControl>
              </FormItem>
            )}
          />

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
        </div>

        <FormField
          control={form.control}
          name="is_task"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <FormLabel>Mark as Task</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Title</FormLabel>
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

          {requiresReview && (
            <FormField
              control={form.control}
              name="reviewer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reviewer</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={userOptions}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value || '')}
                      placeholder="Select reviewer..."
                      searchPlaceholder="Search team..."
                      emptyMessage="No team members found."
                      clearable
                    />
                  </FormControl>
                  <FormDescription>
                    Person responsible for reviewing this requirement
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

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
