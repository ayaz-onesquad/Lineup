import { supabase } from '@/services/supabase'
import type {
  Discussion,
  DiscussionWithAuthor,
  CreateDiscussionInput,
  EntityType,
} from '@/types/database'

export const discussionsApi = {
  getByEntity: async (
    entityType: EntityType,
    entityId: string,
    includeInternal: boolean = true
  ): Promise<DiscussionWithAuthor[]> => {
    let query = supabase
      .from('discussions')
      .select(`
        *,
        author:user_profiles!discussions_author_id_fkey (*)
      `)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('parent_discussion_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (!includeInternal) {
      query = query.eq('is_internal', false)
    }

    const { data, error } = await query

    if (error) throw error

    // Fetch replies for each discussion
    const discussionsWithReplies = await Promise.all(
      (data || []).map(async (discussion) => {
        const { data: replies } = await supabase
          .from('discussions')
          .select(`
            *,
            author:user_profiles!discussions_author_id_fkey (*)
          `)
          .eq('parent_discussion_id', discussion.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })

        return {
          ...discussion,
          replies: replies || [],
        }
      })
    )

    return discussionsWithReplies
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateDiscussionInput
  ): Promise<Discussion> => {
    const { data, error } = await supabase
      .from('discussions')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        is_internal: input.is_internal ?? true,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, content: string): Promise<Discussion> => {
    const { data, error } = await supabase
      .from('discussions')
      .update({ content })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('discussions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  reply: async (
    tenantId: string,
    userId: string,
    parentId: string,
    content: string,
    isInternal: boolean = true
  ): Promise<Discussion> => {
    // Get parent discussion info
    const { data: parent } = await supabase
      .from('discussions')
      .select('entity_type, entity_id')
      .eq('id', parentId)
      .single()

    if (!parent) throw new Error('Parent discussion not found')

    const { data, error } = await supabase
      .from('discussions')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        entity_type: parent.entity_type,
        entity_id: parent.entity_id,
        parent_discussion_id: parentId,
        content,
        is_internal: isInternal,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },
}
