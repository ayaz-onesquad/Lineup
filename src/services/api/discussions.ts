import { supabase } from '@/services/supabase'
import type {
  Discussion,
  DiscussionWithAuthor,
  CreateDiscussionInput,
  EntityType,
} from '@/types/database'

export interface DiscussionWithContext extends DiscussionWithAuthor {
  topic_name?: string
  client_name?: string
  reply_count?: number
}

export const discussionsApi = {
  // Get all discussions for the tenant (global list)
  getAll: async (
    tenantId: string,
    options?: {
      clientId?: string
      visibility?: 'internal' | 'external'
      limit?: number
    }
  ): Promise<DiscussionWithContext[]> => {
    let query = supabase
      .from('discussions')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('parent_discussion_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (options?.clientId) {
      query = query.eq('root_client_id', options.clientId)
    }
    if (options?.visibility) {
      query = query.eq('visibility', options.visibility)
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) return []

    // Get author profiles
    const authorIds = [...new Set(data.map(d => d.author_id))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', authorIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

    // Get reply counts
    const discussionIds = data.map(d => d.id)
    const { data: replyCounts } = await supabase
      .from('discussions')
      .select('parent_discussion_id')
      .in('parent_discussion_id', discussionIds)
      .is('deleted_at', null)

    const replyCountMap = new Map<string, number>()
    replyCounts?.forEach(r => {
      const count = replyCountMap.get(r.parent_discussion_id) || 0
      replyCountMap.set(r.parent_discussion_id, count + 1)
    })

    return data.map(d => ({
      ...d,
      author: profileMap.get(d.author_id),
      reply_count: replyCountMap.get(d.id) || 0,
    }))
  },

  // Get single discussion by ID with full context
  getById: async (id: string): Promise<DiscussionWithContext | null> => {
    const { data, error } = await supabase
      .from('discussions')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!data) return null

    // Get author profile
    const { data: author } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', data.author_id)
      .single()

    // Get replies with authors
    const { data: replies } = await supabase
      .from('discussions')
      .select('*')
      .eq('parent_discussion_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    // Get author profiles for replies
    const replyAuthorIds = [...new Set(replies?.map(r => r.author_id) || [])]
    const { data: replyProfiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', replyAuthorIds)

    const profileMap = new Map(replyProfiles?.map(p => [p.user_id, p]) || [])

    return {
      ...data,
      author,
      replies: replies?.map(r => ({
        ...r,
        author: profileMap.get(r.author_id),
      })) || [],
    }
  },


  getByEntity: async (
    entityType: EntityType,
    entityId: string,
    includeInternal: boolean = true
  ): Promise<DiscussionWithAuthor[]> => {
    let query = supabase
      .from('discussions')
      .select('*')
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
    if (!data || data.length === 0) return []

    // Get all author IDs (including from replies)
    const allDiscussionIds = data.map(d => d.id)

    // Fetch all replies
    const { data: allReplies } = await supabase
      .from('discussions')
      .select('*')
      .in('parent_discussion_id', allDiscussionIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    // Collect all author IDs
    const authorIds = new Set<string>()
    data.forEach(d => authorIds.add(d.author_id))
    allReplies?.forEach(r => authorIds.add(r.author_id))

    // Fetch all user profiles
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', Array.from(authorIds))

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

    // Map replies to their parents with author data
    const repliesMap = new Map<string, DiscussionWithAuthor[]>()
    allReplies?.forEach(reply => {
      const parentId = reply.parent_discussion_id
      if (!repliesMap.has(parentId)) {
        repliesMap.set(parentId, [])
      }
      repliesMap.get(parentId)!.push({
        ...reply,
        author: profileMap.get(reply.author_id),
      })
    })

    // Build discussions with authors and replies
    return data.map(discussion => ({
      ...discussion,
      author: profileMap.get(discussion.author_id),
      replies: repliesMap.get(discussion.id) || [],
    }))
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
