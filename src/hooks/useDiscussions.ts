import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { discussionsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import type { CreateDiscussionInput, EntityType } from '@/types/database'

// Fetch all discussions for the tenant with optional filters
export function useAllDiscussions(
  tenantId: string | undefined,
  options?: {
    entityType?: EntityType
    visibility?: 'internal' | 'external' | 'all'
  }
) {
  return useQuery({
    queryKey: ['discussions', 'all', tenantId, options?.entityType, options?.visibility],
    queryFn: async () => {
      let query = supabase
        .from('discussions')
        .select(`
          id, entity_type, entity_id, content, title, is_internal, is_resolved,
          created_at, updated_at, author_id, visibility
        `)
        .eq('tenant_id', tenantId!)
        .is('deleted_at', null)
        .is('parent_discussion_id', null)
        .order('created_at', { ascending: false })

      if (options?.entityType) {
        query = query.eq('entity_type', options.entityType)
      }
      if (options?.visibility === 'internal') {
        query = query.eq('is_internal', true)
      } else if (options?.visibility === 'external') {
        query = query.eq('is_internal', false)
      }

      const { data, error } = await query
      if (error) throw error
      if (!data || data.length === 0) return []

      // Get author profiles
      const authorIds = [...new Set(data.map(d => d.author_id))]
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', authorIds)

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

      return data.map(d => ({
        ...d,
        author: profileMap.get(d.author_id) || null,
      }))
    },
    enabled: !!tenantId,
  })
}

// Fetch open discussions authored by the current user
export function useMyOpenDiscussions(
  userId: string | undefined,
  tenantId: string | undefined,
  limit: number = 10
) {
  return useQuery({
    queryKey: ['discussions', 'mine', userId, tenantId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discussions')
        .select(`
          id, entity_type, entity_id, content, title, is_internal, is_resolved, created_at,
          author_id
        `)
        .eq('tenant_id', tenantId!)
        .eq('author_id', userId!)
        .eq('is_resolved', false)
        .is('deleted_at', null)
        .is('parent_discussion_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    },
    enabled: !!userId && !!tenantId,
  })
}

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
