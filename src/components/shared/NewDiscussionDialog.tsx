import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/stores'
import { useTenantUsers } from '@/hooks/useTenant'
import { useDiscussionMutations } from '@/hooks/useDiscussions'
import { useClients, useProjects, usePhases, useSets, usePitches, useRequirements } from '@/hooks'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
// Removed Checkbox - using simple div to avoid Radix state conflicts
import { MessageSquarePlus, X, Loader2 } from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import type { EntityType } from '@/types/database'

const formSchema = z.object({
  subject: z.string().max(255).optional(),
  content: z.string().min(1, 'Message is required'),
  is_internal: z.boolean().default(true),
  participant_ids: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof formSchema>

interface NewDiscussionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional - if not provided, user must select entity type */
  entityType?: EntityType
  /** Optional - if not provided, user must select entity */
  entityId?: string
  entityLabel?: string // e.g., "Project: Website Redesign"
}

// Entity types for the dropdown
const ENTITY_TYPE_OPTIONS = [
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Project' },
  { value: 'phase', label: 'Phase' },
  { value: 'set', label: 'Set' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'requirement', label: 'Requirement' },
]

export function NewDiscussionDialog({
  open,
  onOpenChange,
  entityType: initialEntityType,
  entityId: initialEntityId,
  entityLabel,
}: NewDiscussionDialogProps) {
  // Use selector to get stable primitive value, avoiding infinite re-renders
  const userId = useAuthStore(s => s.user?.id)
  const { data: tenantUsers, isLoading: loadingUsers } = useTenantUsers()
  const { createDiscussion } = useDiscussionMutations()

  // Entity selection state (only used when not provided via props)
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType | ''>(initialEntityType || '')
  const [selectedEntityId, setSelectedEntityId] = useState<string>(initialEntityId || '')

  // Fetch entity data for dropdowns
  const { data: clients } = useClients()
  const { data: projects } = useProjects()
  const { data: phases } = usePhases()
  const { data: sets } = useSets()
  const { data: pitches } = usePitches()
  const { data: requirements } = useRequirements()

  // Reset entity selection when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedEntityType(initialEntityType || '')
      setSelectedEntityId(initialEntityId || '')
    }
  }, [open, initialEntityType, initialEntityId])

  // Get entity options based on selected type
  const entityOptions = useMemo(() => {
    switch (selectedEntityType) {
      case 'client':
        return clients?.map(c => ({ value: c.id, label: c.name })) ?? []
      case 'project':
        return projects?.map(p => ({ value: p.id, label: p.name })) ?? []
      case 'phase':
        return phases?.map(p => ({ value: p.id, label: p.name })) ?? []
      case 'set':
        return sets?.map(s => ({ value: s.id, label: s.name })) ?? []
      case 'pitch':
        return pitches?.map(p => ({ value: p.id, label: p.name })) ?? []
      case 'requirement':
        return requirements?.map(r => ({ value: r.id, label: r.title })) ?? []
      default:
        return []
    }
  }, [selectedEntityType, clients, projects, phases, sets, pitches, requirements])

  // Determine final entity type and id
  const finalEntityType = initialEntityType || selectedEntityType
  const finalEntityId = initialEntityId || selectedEntityId
  const requiresEntitySelection = !initialEntityType || !initialEntityId

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

  // Filter users based on search query (exclude current user from list - they're auto-included)
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

  const handleSubmit = async (values: FormValues) => {
    if (!finalEntityType || !finalEntityId) {
      return // Validation should prevent this
    }

    await createDiscussion.mutateAsync({
      entity_type: finalEntityType as EntityType,
      entity_id: finalEntityId,
      subject: values.subject || undefined,
      content: values.content,
      is_internal: values.is_internal,
      participant_ids: values.participant_ids,
    })

    form.reset()
    setSearchQuery('')
    setSelectedEntityType(initialEntityType || '')
    setSelectedEntityId(initialEntityId || '')
    onOpenChange(false)
  }

  // Check if form can be submitted
  const canSubmit = finalEntityType && finalEntityId && !createDiscussion.isPending

  const currentUserName = useMemo(() => {
    const tu = tenantUsers?.find(t => t.user_id === userId)
    return tu?.user_profiles?.full_name || 'You'
  }, [tenantUsers, userId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            New Discussion
          </DialogTitle>
          {entityLabel && (
            <DialogDescription>
              {entityLabel}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Entity Selection - only shown when not provided via props */}
            {requiresEntitySelection && (
              <>
                <FormItem>
                  <FormLabel>
                    Entity Type <span className="text-destructive">*</span>
                  </FormLabel>
                  <SearchableSelect
                    options={ENTITY_TYPE_OPTIONS}
                    value={selectedEntityType}
                    onValueChange={(value) => {
                      setSelectedEntityType(value as EntityType)
                      setSelectedEntityId('') // Reset entity when type changes
                    }}
                    placeholder="Select entity type..."
                    searchPlaceholder="Search types..."
                    emptyMessage="No types found."
                  />
                </FormItem>

                {selectedEntityType && (
                  <FormItem>
                    <FormLabel>
                      {selectedEntityType.charAt(0).toUpperCase() + selectedEntityType.slice(1)}{' '}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <SearchableSelect
                      options={entityOptions}
                      value={selectedEntityId}
                      onValueChange={(value) => setSelectedEntityId(value || '')}
                      placeholder={`Select ${selectedEntityType}...`}
                      searchPlaceholder={`Search ${selectedEntityType}s...`}
                      emptyMessage={`No ${selectedEntityType}s found.`}
                    />
                  </FormItem>
                )}
              </>
            )}

            {/* Subject */}
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional subject line..."
                      {...field}
                    />
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
                      className="min-h-[120px]"
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

              {/* Selected participants chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {/* Current user - always included */}
                <Badge variant="secondary" className="gap-1 pr-1">
                  <Avatar className="h-4 w-4">
                    <AvatarFallback className="text-[10px]">
                      {getInitials(currentUserName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{currentUserName} (you)</span>
                </Badge>

                {/* Other selected participants */}
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

              {/* User selection list */}
              <div className="border rounded-md">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Search team members..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-8"
                  />
                </div>
                <ScrollArea className="h-[150px]">
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
                    <FormLabel className="text-base">Internal only</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      When enabled, this discussion is not visible to clients
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
              >
                {createDiscussion.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Discussion
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
