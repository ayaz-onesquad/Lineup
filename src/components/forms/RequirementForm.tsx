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
import { useParentContext } from '@/hooks/useParentContext'
import { isParentLocked, withLockedOption } from '@/lib/parentContext'
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

  // Contextual creation (docs/DESIGN-SYSTEM.md section 9). Creating from a
  // Set's tab supplies only `set_id`; this resolves the set's phase, project
  // and client too, and marks the whole chain locked so no cascade reset can
  // clear it. That clearing is what previously dropped the set link.
  const { values: parentValues, locked: lockedParents } = useParentContext(defaultValues)
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

      if (currentProject && !isParentLocked('project_id', lockedParents)) {
        const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
        if (!projectStillValid) {
          form.setValue('project_id', '')
          if (!isParentLocked('phase_id', lockedParents)) form.setValue('phase_id', '')
          if (!isParentLocked('set_id', lockedParents)) form.setValue('set_id', '')
          if (!isParentLocked('pitch_id', lockedParents)) form.setValue('pitch_id', '')
        }
      }

      // A locked set must never be cleared here. `filteredSets` is built from
      // three async queries, so it is briefly empty or stale right after the
      // client/project are derived — and clearing on that transient state is
      // exactly how the pre-filled set used to disappear.
      if (currentSet && !isParentLocked('set_id', lockedParents)) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
          if (!isParentLocked('pitch_id', lockedParents)) form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedClientId, filteredProjects, filteredSets, form, lockedParents])

  useEffect(() => {
    if (selectedProjectId) {
      // Reset phase and set when project changes
      const currentPhase = form.getValues('phase_id')
      const currentSet = form.getValues('set_id')
      if (currentPhase && !isParentLocked('phase_id', lockedParents)) {
        const phaseStillValid = projectPhases?.some((p) => p.id === currentPhase)
        if (!phaseStillValid) {
          form.setValue('phase_id', '')
        }
      }
      if (currentSet && !isParentLocked('set_id', lockedParents)) {
        const setStillValid = filteredSets.some((s) => s.id === currentSet)
        if (!setStillValid) {
          form.setValue('set_id', '')
          if (!isParentLocked('pitch_id', lockedParents)) form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedProjectId, projectPhases, filteredSets, form, lockedParents])

  // Reset pitch when set changes
  useEffect(() => {
    if (selectedSetId) {
      const currentPitch = form.getValues('pitch_id')
      if (currentPitch && !isParentLocked('pitch_id', lockedParents)) {
        const pitchStillValid = setPitches?.some((p) => p.id === currentPitch)
        if (!pitchStillValid) {
          form.setValue('pitch_id', '')
        }
      }
    }
  }, [selectedSetId, setPitches, form, lockedParents])

  // Apply the resolved parent chain.
  //
  // This replaces four separate effects that each derived one ancestor from
  // `defaultValues` and raced each other. `useParentContext` resolves the whole
  // chain in one place, so there is a single write per field and no ordering
  // dependency between them.
  useEffect(() => {
    for (const field of ['client_id', 'project_id', 'phase_id', 'set_id', 'pitch_id'] as const) {
      const value = parentValues[field]
      if (value && form.getValues(field) !== value) {
        form.setValue(field, value, { shouldDirty: false })
      }
    }
  }, [parentValues, form])

  // Scroll to first error on validation failure
  const { scrollToFirstError } = useScrollToError(form.formState.errors)

  const onSubmit = async (data: RequirementFormData) => {
    // Validate client_id is required (even though it's just a filter field)
    if (!data.client_id) {
      form.setError('client_id', { message: 'Client is required' })
      return
    }
    // `project_id` and `phase_id` are cascade FILTER fields only. The
    // requirements table has no phase_id column: a requirement's phase is
    // derived through its set. So both are destructured out here deliberately,
    // and `set_id` is the link that must survive.
    const { project_id: _projectFilter, phase_id: _phaseFilter, client_id, ...rest } = data
    void _projectFilter
    void _phaseFilter
    const requirementData = {
      ...rest,
      client_id: client_id as string,
      // Empty string is "not set"; these are nullable uuid columns.
      set_id: rest.set_id || undefined,
      pitch_id: rest.pitch_id || undefined,
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Client</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={withLockedOption(clientOptions, lockedParents.has('client_id') ? field.value : undefined, 'Selected client')}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select client..."
                    searchPlaceholder="Search clients..."
                    emptyMessage="No clients found."
                    disabled={lockedParents.has('client_id')}
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
                    options={withLockedOption(projectOptions, lockedParents.has('project_id') ? field.value : undefined, 'Selected project')}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="All projects"
                    searchPlaceholder="Search projects..."
                    emptyMessage="No projects found."
                    clearable
                    disabled={lockedParents.has('project_id') || projectOptions.length === 0}
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
                    options={withLockedOption(phaseOptions, lockedParents.has('phase_id') ? field.value : undefined, 'Selected phase')}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select phase (optional)"
                    searchPlaceholder="Search phases..."
                    emptyMessage={selectedProjectId ? "No phases found." : "Select a project first."}
                    clearable
                    disabled={lockedParents.has('phase_id') || !selectedProjectId || phaseOptions.length === 0}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            control={form.control}
            name="set_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Set</FormLabel>
                {lockedParents.has('set_id') && (
                  <FormDescription>
                    Set from where you started. Create from the Requirements page
                    to choose a different one.
                  </FormDescription>
                )}
                <FormControl>
                  <SearchableSelect
                    options={withLockedOption(setOptions, lockedParents.has('set_id') ? field.value : undefined, 'Selected set')}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select set (optional)"
                    searchPlaceholder="Search sets..."
                    emptyMessage="No sets found."
                    clearable
                    disabled={lockedParents.has('set_id') || setOptions.length === 0}
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
                    options={withLockedOption(pitchOptions, lockedParents.has('pitch_id') ? field.value : undefined, 'Selected pitch')}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value || '')}
                    placeholder="Select pitch (optional)"
                    searchPlaceholder="Search pitches..."
                    emptyMessage={selectedSetId ? "No pitches found." : "Select a set first."}
                    clearable
                    disabled={lockedParents.has('pitch_id') || !selectedSetId || pitchOptions.length === 0}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
