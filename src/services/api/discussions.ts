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
  // Get all top-level discussions for the tenant (global list)
  getAll: async (tenantId: string): Promise<DiscussionWithContext[]> => {
    const { data, error } = await supabase
      .from('discussions')
      .select(`
        id, tenant_id, entity_type, entity_id, title, content, is_internal, status,
        participants, created_at, updated_at, author_id,
        concluded_by, concluded_at, visibility, root_client_id
      `)
      .eq('tenant_id', tenantId)
      .is('parent_discussion_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!data || data.length === 0) return []

    // Fetch author profiles separately (author_id references auth.users, not user_profiles)
    const authorIds = [...new Set(data.map(d => d.author_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', authorIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])

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

    return data.map(d => {
      const profile = d.author_id ? profileMap.get(d.author_id) : null
      return {
        ...d,
        subject: d.title,
        participant_ids: d.participants,
        author: profile ? {
          id: profile.user_id,
          user_id: profile.user_id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        } : undefined,
        reply_count: replyCountMap.get(d.id) || 0,
      }
    }) as unknown as DiscussionWithContext[]
  },

  // Get single discussion by ID with full context
  getById: async (id: string): Promise<DiscussionWithContext | null> => {
    const { data, error } = await supabase
      .from('discussions')
      .select(`
        id, tenant_id, entity_type, entity_id, title, content, is_internal, status,
        participants, created_at, updated_at, author_id, parent_discussion_id,
        concluded_by, concluded_at, visibility, root_client_id
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!data) return null

    // Get replies
    const { data: replies } = await supabase
      .from('discussions')
      .select(`
        id, tenant_id, entity_type, entity_id, content, is_internal, status,
        participants, created_at, updated_at, author_id, parent_discussion_id
      `)
      .eq('parent_discussion_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    // Fetch all author profiles (main discussion + replies)
    const allAuthorIds = [
      data.author_id,
      ...(replies?.map(r => r.author_id) || []),
    ].filter(Boolean)
    const uniqueAuthorIds = [...new Set(allAuthorIds)]

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', uniqueAuthorIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])
    const getAuthor = (authorId: string | null): DiscussionWithAuthor['author'] => {
      if (!authorId) return undefined
      const profile = profileMap.get(authorId)
      return profile ? {
        id: profile.user_id,
        user_id: profile.user_id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      } as DiscussionWithAuthor['author'] : undefined
    }

    return {
      ...data,
      subject: data.title,
      participant_ids: data.participants,
      author: getAuthor(data.author_id),
      replies: replies?.map(r => ({
        ...r,
        subject: null,
        participant_ids: r.participants,
        author: getAuthor(r.author_id),
      })) || [],
    } as unknown as DiscussionWithContext
  },

  // Get discussions for a specific entity with all replies
  getByEntity: async (
    tenantId: string,
    entityType: EntityType,
    entityId: string,
    statusFilter: 'open' | 'closed' | 'all' = 'all'
  ): Promise<DiscussionWithAuthor[]> => {
    const { data, error } = await supabase
      .from('discussions')
      .select(`
        id, tenant_id, entity_type, entity_id, title, content, is_internal, status,
        participants, created_at, updated_at, author_id, parent_discussion_id,
        concluded_by, concluded_at
      `)
      .eq('tenant_id', tenantId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) return []

    // Fetch all author profiles
    const authorIds = [...new Set(data.map(d => d.author_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', authorIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])
    const getAuthor = (authorId: string | null): DiscussionWithAuthor['author'] => {
      if (!authorId) return undefined
      const profile = profileMap.get(authorId)
      return profile ? {
        id: profile.user_id,
        user_id: profile.user_id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      } as DiscussionWithAuthor['author'] : undefined
    }

    // Separate top-level discussions and replies
    const topLevel = data.filter(d => !d.parent_discussion_id)
    const replies = data.filter(d => d.parent_discussion_id)

    // Build reply map
    const repliesMap = new Map<string, DiscussionWithAuthor[]>()
    replies.forEach(reply => {
      const parentId = reply.parent_discussion_id!
      if (!repliesMap.has(parentId)) {
        repliesMap.set(parentId, [])
      }
      repliesMap.get(parentId)!.push({
        ...reply,
        subject: reply.title,
        participant_ids: reply.participants,
        author: getAuthor(reply.author_id),
      } as unknown as DiscussionWithAuthor)
    })

    // Build discussions with replies and apply status filter
    const result = topLevel
      .filter(d => statusFilter === 'all' || d.status === statusFilter)
      .map(discussion => ({
        ...discussion,
        subject: discussion.title,
        participant_ids: discussion.participants,
        author: getAuthor(discussion.author_id),
        replies: repliesMap.get(discussion.id) || [],
      })) as unknown as DiscussionWithAuthor[]

    return result
  },

  // Create a new discussion
  create: async (
    tenantId: string,
    userId: string,
    input: CreateDiscussionInput
  ): Promise<Discussion> => {
    // Auto-include creator in participants
    const participants = Array.from(new Set([
      userId,
      ...(input.participant_ids ?? []),
    ]))

    const { data, error } = await supabase
      .from('discussions')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        parent_discussion_id: input.parent_discussion_id ?? null,
        title: input.subject ?? null, // Map 'subject' to 'title' column
        content: input.content,
        is_internal: input.is_internal ?? true,
        participants: participants, // Map 'participant_ids' to 'participants' column
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error

    return {
      ...data,
      subject: data.title,
      participant_ids: data.participants,
    } as Discussion
  },

  // Update discussion content
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

  // Soft delete a discussion
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('discussions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  // Reply to a discussion
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
      .select('entity_type, entity_id, participants')
      .eq('id', parentId)
      .single()

    if (!parent) throw new Error('Parent discussion not found')

    // Auto-add replying user to participants if not already included
    const updatedParticipants = Array.from(new Set([
      ...(parent.participants || []),
      userId,
    ]))

    // Update parent's participants
    await supabase
      .from('discussions')
      .update({ participants: updatedParticipants })
      .eq('id', parentId)

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
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Conclude (close) a discussion
  conclude: async (id: string, userId: string): Promise<Discussion> => {
    const { data, error } = await supabase
      .from('discussions')
      .update({
        status: 'closed',
        concluded_by: userId,
        concluded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Reopen a closed discussion
  reopen: async (id: string): Promise<Discussion> => {
    const { data, error } = await supabase
      .from('discussions')
      .update({
        status: 'open',
        concluded_by: null,
        concluded_at: null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Get my open discussions (where user is a participant)
  getMyOpen: async (tenantId: string, userId: string, limit: number = 20): Promise<DiscussionWithContext[]> => {
    const { data, error } = await supabase
      .from('discussions')
      .select(`
        id, tenant_id, entity_type, entity_id, title, content, is_internal, status,
        participants, created_at, updated_at, author_id,
        concluded_by, concluded_at
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .is('parent_discussion_id', null)
      .contains('participants', [userId])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    if (!data || data.length === 0) return []

    // Fetch author profiles separately
    const authorIds = [...new Set(data.map(d => d.author_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', authorIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])

    return data.map(d => {
      const profile = d.author_id ? profileMap.get(d.author_id) : null
      return {
        ...d,
        subject: d.title,
        participant_ids: d.participants,
        author: profile ? {
          id: profile.user_id,
          user_id: profile.user_id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        } : undefined,
      }
    }) as unknown as DiscussionWithContext[]
  },

  // Add participant to a discussion
  addParticipant: async (discussionId: string, userId: string): Promise<void> => {
    const { data: discussion } = await supabase
      .from('discussions')
      .select('participants')
      .eq('id', discussionId)
      .single()

    if (!discussion) throw new Error('Discussion not found')

    const participants = Array.from(new Set([
      ...(discussion.participants || []),
      userId,
    ]))

    const { error } = await supabase
      .from('discussions')
      .update({ participants })
      .eq('id', discussionId)

    if (error) throw error
  },

  // Remove participant from a discussion
  removeParticipant: async (discussionId: string, userId: string): Promise<void> => {
    const { data: discussion } = await supabase
      .from('discussions')
      .select('participants, author_id')
      .eq('id', discussionId)
      .single()

    if (!discussion) throw new Error('Discussion not found')

    // Cannot remove the author
    if (discussion.author_id === userId) {
      throw new Error('Cannot remove discussion author from participants')
    }

    const participants = (discussion.participants || []).filter((p: string) => p !== userId)

    const { error } = await supabase
      .from('discussions')
      .update({ participants })
      .eq('id', discussionId)

    if (error) throw error
  },
}
