import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discussionsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import type { CreateDiscussionInput, EntityType } from '@/types/database'

export function useEntityDiscussions(
  entityType: EntityType | undefined,
  entityId: string | undefined,
  includeInternal: boolean = true
) {
  return useQuery({
    queryKey: ['discussions', entityType, entityId, includeInternal],
    queryFn: () =>
      discussionsApi.getByEntity(entityType!, entityId!, includeInternal),
    enabled: !!entityType && !!entityId,
  })
}

export function useDiscussionMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

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
    },
  })

  const updateDiscussion = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      discussionsApi.update(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
    },
  })

  const deleteDiscussion = useMutation({
    mutationFn: discussionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
    },
  })

  return {
    createDiscussion,
    createReply,
    updateDiscussion,
    deleteDiscussion,
  }
}
