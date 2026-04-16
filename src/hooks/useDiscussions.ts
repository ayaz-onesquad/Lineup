import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discussionsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { useToast } from '@/hooks/use-toast'
import type { CreateDiscussionInput, EntityType, DiscussionStatus } from '@/types/database'

/**
 * Fetch all top-level discussions for the current tenant.
 * Auto-reads tenant from store - no arguments needed.
 */
export function useAllDiscussions() {
  // Use selector to get stable reference, avoiding re-renders
  const currentTenant = useTenantStore(s => s.currentTenant)

  return useQuery({
    queryKey: ['discussions', 'all', currentTenant?.id],
    queryFn: () => discussionsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Fetch discussions for a specific entity with optional status filter.
 * Pass undefined for statusFilter to get all discussions.
 */
export function useEntityDiscussions(
  entityType: EntityType | undefined,
  entityId: string | undefined,
  statusFilter: DiscussionStatus | 'all' = 'all'
) {
  // Use selector to get stable reference, avoiding re-renders
  const currentTenant = useTenantStore(s => s.currentTenant)

  return useQuery({
    queryKey: ['discussions', entityType, entityId, statusFilter, currentTenant?.id],
    queryFn: () =>
      discussionsApi.getByEntity(
        currentTenant!.id,
        entityType!,
        entityId!,
        statusFilter
      ),
    enabled: !!currentTenant?.id && !!entityType && !!entityId,
  })
}

/**
 * Fetch a single discussion by ID with all replies.
 */
export function useDiscussion(discussionId: string | undefined) {
  return useQuery({
    queryKey: ['discussions', 'detail', discussionId],
    queryFn: () => discussionsApi.getById(discussionId!),
    enabled: !!discussionId,
  })
}

/**
 * Fetch my open discussions (where current user is a participant).
 * Auto-reads user and tenant from stores - no arguments needed.
 */
export function useMyOpenDiscussions(limit: number = 20) {
  // Use selectors to get stable values, avoiding re-renders
  const currentTenant = useTenantStore(s => s.currentTenant)
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['discussions', 'mine', user?.id, currentTenant?.id, limit],
    queryFn: () => discussionsApi.getMyOpen(currentTenant!.id, user!.id, limit),
    enabled: !!currentTenant?.id && !!user?.id,
  })
}

/**
 * All discussion mutations (create, reply, update, delete, conclude).
 */
export function useDiscussionMutations() {
  const queryClient = useQueryClient()
  // Use selectors to get stable primitive values, avoiding infinite re-renders
  const user = useAuthStore(s => s.user)
  const currentTenant = useTenantStore(s => s.currentTenant)
  const { toast } = useToast()

  const createDiscussion = useMutation({
    mutationFn: async (input: CreateDiscussionInput) => {
      if (!user?.id || !currentTenant?.id) {
        throw new Error('User not authenticated or tenant not selected')
      }
      return discussionsApi.create(currentTenant.id, user.id, input)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['discussions', variables.entity_type, variables.entity_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['discussions', 'all'],
      })
      queryClient.invalidateQueries({
        queryKey: ['discussions', 'mine'],
      })
      toast({
        title: 'Discussion created',
        description: 'Your discussion has been posted.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating discussion',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const createReply = useMutation({
    mutationFn: async ({
      parentId,
      content,
      isInternal = true,
    }: {
      parentId: string
      content: string
      isInternal?: boolean
    }) => {
      if (!user?.id || !currentTenant?.id) {
        throw new Error('User not authenticated or tenant not selected')
      }
      return discussionsApi.reply(
        currentTenant.id,
        user.id,
        parentId,
        content,
        isInternal
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Reply posted',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error posting reply',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateDiscussion = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      discussionsApi.update(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Discussion updated',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating discussion',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteDiscussion = useMutation({
    mutationFn: discussionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Discussion deleted',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting discussion',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const concludeDiscussion = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user?.id) {
        throw new Error('User not authenticated')
      }
      return discussionsApi.conclude(id, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Discussion closed',
        description: 'The discussion has been marked as concluded.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error closing discussion',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const reopenDiscussion = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return discussionsApi.reopen(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Discussion reopened',
        description: 'The discussion is now open for replies.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error reopening discussion',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const addParticipant = useMutation({
    mutationFn: async ({
      discussionId,
      userId,
    }: {
      discussionId: string
      userId: string
    }) => {
      return discussionsApi.addParticipant(discussionId, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Participant added',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error adding participant',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const removeParticipant = useMutation({
    mutationFn: async ({
      discussionId,
      userId,
    }: {
      discussionId: string
      userId: string
    }) => {
      return discussionsApi.removeParticipant(discussionId, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      toast({
        title: 'Participant removed',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error removing participant',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createDiscussion,
    createReply,
    updateDiscussion,
    deleteDiscussion,
    concludeDiscussion,
    reopenDiscussion,
    addParticipant,
    removeParticipant,
  }
}
