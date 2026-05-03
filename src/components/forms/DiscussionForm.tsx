import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/stores'
import { useTenantUsers } from '@/hooks/useTenant'
import { useDiscussionMutations } from '@/hooks/useDiscussions'
import { useClients, useProjects, usePhases, useSets, usePitches, useRequirements } from '@/hooks'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { X, Loader2 } from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import type { EntityType } from '@/types/database'

const formSchema = z.object({
  subject: z.string().max(255).optional(),
  content: z.string().min(1, 'Message is required'),
  is_internal: z.boolean().default(true),
  participant_ids: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof formSchema>

interface DiscussionFormProps {
  defaultValues?: {
    client_id?: string
    project_id?: string
    phase_id?: string
    set_id?: string
    pitch_id?: string
    requirement_id?: string
  }
  onSuccess?: () => void
}

export function DiscussionForm({ defaultValues, onSuccess }: DiscussionFormProps) {
  const userId = useAuthStore(s => s.user?.id)
  const { data: tenantUsers, isLoading: loadingUsers } = useTenantUsers()
  const { createDiscussion } = useDiscussionMutations()

  // Entity selection state - cascading hierarchy
  const [selectedClientId, setSelectedClientId] = useState<string>(defaultValues?.client_id || '')
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultValues?.project_id || '')
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(defaultValues?.phase_id || '')
  const [selectedSetId, setSelectedSetId] = useState<string>(defaultValues?.set_id || '')
  const [selectedPitchId, setSelectedPitchId] = useState<string>(defaultValues?.pitch_id || '')
  const [selectedRequirementId, setSelectedRequirementId] = useState<string>(defaultValues?.requirement_id || '')

  // Fetch entity data
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { data: phases } = usePhases()
  const { data: sets } = useSets()
  const { data: pitches } = usePitches()
  const { data: requirements } = useRequirements()

  // Helper: Get parent chain from a requirement
  const getRequirementParents = (reqId: string) => {
    const req = requirements?.find(r => r.id === reqId)
    if (!req) return {}

    let clientId = req.client_id || ''
    let setId = req.set_id || ''
    let pitchId = req.pitch_id || ''
    let projectId = ''
    let phaseId = ''

    // Get set's parents
    if (setId) {
      const set = sets?.find(s => s.id === setId)
      if (set) {
        clientId = set.client_id || clientId
        projectId = set.project_id || ''
        phaseId = set.phase_id || ''
      }
    }

    // Get pitch's set if we found a pitch
    if (pitchId && !setId) {
      const pitch = pitches?.find(p => p.id === pitchId)
      if (pitch) {
        setId = pitch.set_id || ''
        const set = sets?.find(s => s.id === setId)
        if (set) {
          clientId = set.client_id || clientId
          projectId = set.project_id || ''
          phaseId = set.phase_id || ''
        }
      }
    }

    return { clientId, projectId, phaseId, setId, pitchId }
  }

  // Helper: Get parent chain from a pitch
  const getPitchParents = (pitchId: string) => {
    const pitch = pitches?.find(p => p.id === pitchId)
    if (!pitch) return {}

    const setId = pitch.set_id || ''
    const set = sets?.find(s => s.id === setId)

    return {
      clientId: set?.client_id || '',
      projectId: set?.project_id || '',
      phaseId: set?.phase_id || '',
      setId,
    }
  }

  // Helper: Get parent chain from a set
  const getSetParents = (setId: string) => {
    const set = sets?.find(s => s.id === setId)
    if (!set) return {}

    return {
      clientId: set.client_id || '',
      projectId: set.project_id || '',
      phaseId: set.phase_id || '',
    }
  }

  // Helper: Get parent chain from a phase
  const getPhaseParents = (phaseId: string) => {
    const phase = phases?.find(p => p.id === phaseId)
    if (!phase) return {}

    const project = projects?.find(p => p.id === phase.project_id)
    return {
      clientId: project?.client_id || '',
      projectId: phase.project_id || '',
    }
  }

  // Helper: Get parent chain from a project
  const getProjectParents = (projectId: string) => {
    const project = projects?.find(p => p.id === projectId)
    return { clientId: project?.client_id || '' }
  }

  // Handle selection changes with cascading logic
  const handleClientChange = (clientId: string | undefined) => {
    setSelectedClientId(clientId || '')
    // Clear all children when parent changes
    setSelectedProjectId('')
    setSelectedPhaseId('')
    setSelectedSetId('')
    setSelectedPitchId('')
    setSelectedRequirementId('')
  }

  const handleProjectChange = (projectId: string | undefined) => {
    if (projectId) {
      // Auto-populate parent
      const parents = getProjectParents(projectId)
      setSelectedClientId(parents.clientId || '')
    }
    setSelectedProjectId(projectId || '')
    // Clear children
    setSelectedPhaseId('')
    setSelectedSetId('')
    setSelectedPitchId('')
    setSelectedRequirementId('')
  }

  const handlePhaseChange = (phaseId: string | undefined) => {
    if (phaseId) {
      // Auto-populate parents
      const parents = getPhaseParents(phaseId)
      setSelectedClientId(parents.clientId || '')
      setSelectedProjectId(parents.projectId || '')
    }
    setSelectedPhaseId(phaseId || '')
    // Clear children
    setSelectedSetId('')
    setSelectedPitchId('')
    setSelectedRequirementId('')
  }

  const handleSetChange = (setId: string | undefined) => {
    if (setId) {
      // Auto-populate parents
      const parents = getSetParents(setId)
      setSelectedClientId(parents.clientId || '')
      setSelectedProjectId(parents.projectId || '')
      setSelectedPhaseId(parents.phaseId || '')
    }
    setSelectedSetId(setId || '')
    // Clear children
    setSelectedPitchId('')
    setSelectedRequirementId('')
  }

  const handlePitchChange = (pitchId: string | undefined) => {
    if (pitchId) {
      // Auto-populate parents
      const parents = getPitchParents(pitchId)
      setSelectedClientId(parents.clientId || '')
      setSelectedProjectId(parents.projectId || '')
      setSelectedPhaseId(parents.phaseId || '')
      setSelectedSetId(parents.setId || '')
    }
    setSelectedPitchId(pitchId || '')
    // Clear children
    setSelectedRequirementId('')
  }

  const handleRequirementChange = (requirementId: string | undefined) => {
    if (requirementId) {
      // Auto-populate all parents
      const parents = getRequirementParents(requirementId)
      setSelectedClientId(parents.clientId || '')
      setSelectedProjectId(parents.projectId || '')
      setSelectedPhaseId(parents.phaseId || '')
      setSelectedSetId(parents.setId || '')
      setSelectedPitchId(parents.pitchId || '')
    }
    setSelectedRequirementId(requirementId || '')
  }

  // Filtered options based on selected parents
  const clientOptions = useMemo(() => {
    return clients?.map(c => ({ value: c.id, label: c.name })) ?? []
  }, [clients])

  const projectOptions = useMemo(() => {
    if (!projects) return []
    const filtered = selectedClientId
      ? projects.filter(p => p.client_id === selectedClientId)
      : projects
    return filtered.map(p => ({ value: p.id, label: p.name }))
  }, [projects, selectedClientId])

  const phaseOptions = useMemo(() => {
    if (!phases) return []
    const filtered = selectedProjectId
      ? phases.filter(p => p.project_id === selectedProjectId)
      : phases
    return filtered.map(p => ({ value: p.id, label: p.name }))
  }, [phases, selectedProjectId])

  const setOptions = useMemo(() => {
    if (!sets) return []
    let filtered = sets
    if (selectedClientId) {
      filtered = filtered.filter(s => s.client_id === selectedClientId)
    }
    if (selectedPhaseId) {
      filtered = filtered.filter(s => s.phase_id === selectedPhaseId)
    } else if (selectedProjectId) {
      filtered = filtered.filter(s => s.project_id === selectedProjectId)
    }
    return filtered.map(s => ({ value: s.id, label: s.name }))
  }, [sets, selectedClientId, selectedProjectId, selectedPhaseId])

  const pitchOptions = useMemo(() => {
    if (!pitches) return []
    const filtered = selectedSetId
      ? pitches.filter(p => p.set_id === selectedSetId)
      : pitches
    return filtered.map(p => ({ value: p.id, label: p.name }))
  }, [pitches, selectedSetId])

  const requirementOptions = useMemo(() => {
    if (!requirements) return []
    let filtered = requirements
    if (selectedPitchId) {
      filtered = filtered.filter(r => r.pitch_id === selectedPitchId)
    } else if (selectedSetId) {
      filtered = filtered.filter(r => r.set_id === selectedSetId)
    } else if (selectedClientId) {
      filtered = filtered.filter(r => r.client_id === selectedClientId)
    }
    return filtered.map(r => ({ value: r.id, label: r.title || 'Untitled' }))
  }, [requirements, selectedClientId, selectedSetId, selectedPitchId])

  // Determine the most specific entity selected for the discussion
  const getSelectedEntity = (): { entityType: EntityType; entityId: string } | null => {
    if (selectedRequirementId) return { entityType: 'requirement', entityId: selectedRequirementId }
    if (selectedPitchId) return { entityType: 'pitch', entityId: selectedPitchId }
    if (selectedSetId) return { entityType: 'set', entityId: selectedSetId }
    if (selectedPhaseId) return { entityType: 'phase', entityId: selectedPhaseId }
    if (selectedProjectId) return { entityType: 'project', entityId: selectedProjectId }
    if (selectedClientId) return { entityType: 'client', entityId: selectedClientId }
    return null
  }

  const selectedEntity = getSelectedEntity()

  // Participant management
  const [searchQuery, setSearchQuery] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: '',
      content: '',
      is_internal: true,
      participant_ids: [],
    },
  })

  const filteredUsers = useMemo(() => {
    if (!tenantUsers) return []
    return tenantUsers
      .filter(tu => tu.user_id !== userId)
      .filter(tu => {
        if (!searchQuery) return true
        const name = tu.user_profiles?.full_name?.toLowerCase() || ''
        return name.includes(searchQuery.toLowerCase())
      })
  }, [tenantUsers, userId, searchQuery])

  const selectedParticipants = form.watch('participant_ids')

  const handleToggleParticipant = (userId: string) => {
    const current = form.getValues('participant_ids')
    if (current.includes(userId)) {
      form.setValue('participant_ids', current.filter(id => id !== userId))
    } else {
      form.setValue('participant_ids', [...current, userId])
    }
  }

  const handleRemoveParticipant = (userId: string) => {
    const current = form.getValues('participant_ids')
    form.setValue('participant_ids', current.filter(id => id !== userId))
  }

  const getParticipantName = (userId: string) => {
    const tenantUser = tenantUsers?.find(tu => tu.user_id === userId)
    return tenantUser?.user_profiles?.full_name || 'Unknown'
  }

  const currentUserName = useMemo(() => {
    const tu = tenantUsers?.find(t => t.user_id === userId)
    return tu?.user_profiles?.full_name || 'You'
  }, [tenantUsers, userId])

  const handleSubmit = async (values: FormValues) => {
    if (!selectedEntity) return

    await createDiscussion.mutateAsync({
      entity_type: selectedEntity.entityType,
      entity_id: selectedEntity.entityId,
      subject: values.subject || undefined,
      content: values.content,
      is_internal: values.is_internal,
      participant_ids: values.participant_ids,
    })

    form.reset()
    setSearchQuery('')
    onSuccess?.()
  }

  const canSubmit = !!selectedEntity && !createDiscussion.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Entity Selection - Cascading Dropdowns */}
        <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Select where to start this discussion
          </p>

          {/* Client */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Client</FormLabel>
            <SearchableSelect
              options={clientOptions}
              value={selectedClientId}
              onValueChange={handleClientChange}
              placeholder="Select client..."
              searchPlaceholder="Search clients..."
              emptyMessage="No clients found"
              clearable
            />
          </FormItem>

          {/* Project */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Project</FormLabel>
            <SearchableSelect
              options={projectOptions}
              value={selectedProjectId}
              onValueChange={handleProjectChange}
              placeholder="Select project..."
              searchPlaceholder="Search projects..."
              emptyMessage="No projects found"
              clearable
            />
          </FormItem>

          {/* Phase */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Phase</FormLabel>
            <SearchableSelect
              options={phaseOptions}
              value={selectedPhaseId}
              onValueChange={handlePhaseChange}
              placeholder="Select phase..."
              searchPlaceholder="Search phases..."
              emptyMessage="No phases found"
              clearable
            />
          </FormItem>

          {/* Set */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Set</FormLabel>
            <SearchableSelect
              options={setOptions}
              value={selectedSetId}
              onValueChange={handleSetChange}
              placeholder="Select set..."
              searchPlaceholder="Search sets..."
              emptyMessage="No sets found"
              clearable
            />
          </FormItem>

          {/* Pitch */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Pitch</FormLabel>
            <SearchableSelect
              options={pitchOptions}
              value={selectedPitchId}
              onValueChange={handlePitchChange}
              placeholder="Select pitch..."
              searchPlaceholder="Search pitches..."
              emptyMessage="No pitches found"
              clearable
            />
          </FormItem>

          {/* Requirement */}
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">Requirement</FormLabel>
            <SearchableSelect
              options={requirementOptions}
              value={selectedRequirementId}
              onValueChange={handleRequirementChange}
              placeholder="Select requirement..."
              searchPlaceholder="Search requirements..."
              emptyMessage="No requirements found"
              clearable
            />
          </FormItem>

          {/* Selected entity indicator */}
          {selectedEntity && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Discussion will be attached to:{' '}
                <Badge variant="secondary" className="ml-1 text-xs capitalize">
                  {selectedEntity.entityType}
                </Badge>
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Subject */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="Optional subject line..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Message */}
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                First Message <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Start the discussion..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Participants */}
        <FormItem>
          <FormLabel>Participants</FormLabel>
          <div className="flex flex-wrap gap-2 mb-2">
            <Badge variant="secondary" className="gap-1 pr-1">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[10px]">
                  {getInitials(currentUserName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{currentUserName} (you)</span>
            </Badge>
            {selectedParticipants.map(userId => (
              <Badge key={userId} variant="outline" className="gap-1 pr-1">
                <Avatar className="h-4 w-4">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(getParticipantName(userId))}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs">{getParticipantName(userId)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveParticipant(userId)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="border rounded-md">
            <div className="p-2 border-b">
              <Input
                placeholder="Search team members..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <ScrollArea className="h-[120px]">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  {searchQuery ? 'No matching team members' : 'No other team members'}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredUsers.map(tu => {
                    const isSelected = selectedParticipants.includes(tu.user_id)
                    return (
                      <div
                        key={tu.user_id}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50',
                          isSelected && 'bg-muted'
                        )}
                        onClick={() => handleToggleParticipant(tu.user_id)}
                      >
                        <div
                          className="flex items-center justify-center h-4 w-4 rounded border border-primary"
                          aria-checked={isSelected}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3 text-primary" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={tu.user_profiles?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(tu.user_profiles?.full_name || '')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {tu.user_profiles?.full_name || 'Unknown'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </FormItem>

        {/* Internal toggle */}
        <FormField
          control={form.control}
          name="is_internal"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Internal only</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Not visible to clients
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {createDiscussion.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Start Discussion
        </Button>
      </form>
    </Form>
  )
}
