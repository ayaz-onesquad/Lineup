import { supabase } from '@/services/supabase'
import type {
  StatusUpdate,
  StatusUpdateWithAuthor,
  CreateStatusUpdateInput,
  StatusUpdateEntityType,
} from '@/types/database'

export const statusUpdatesApi = {
  getByEntity: async (
    entityType: StatusUpdateEntityType,
    entityId: string,
    includeInternalOnly: boolean = true
  ): Promise<StatusUpdateWithAuthor[]> => {
    let query = supabase
      .from('status_updates')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (!includeInternalOnly) {
      query = query.eq('show_in_client_portal', true)
    }

    const { data: updates, error } = await query

    if (error) throw error
    if (!updates || updates.length === 0) return []

    // Fetch author profiles separately
    const authorIds = new Set(updates.map((u) => u.author_id).filter(Boolean))
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, user_id, full_name, avatar_url')
      .in('user_id', Array.from(authorIds))

    // Map profiles to updates
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    return updates.map((update) => ({
      ...update,
      author: update.author_id ? profileMap.get(update.author_id) : undefined,
    }))
  },

  getRecent: async (
    tenantId: string,
    limit: number = 10
  ): Promise<StatusUpdateWithAuthor[]> => {
    const { data: updates, error } = await supabase
      .from('status_updates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    if (!updates || updates.length === 0) return []

    // Fetch author profiles separately
    const authorIds = new Set(updates.map((u) => u.author_id).filter(Boolean))
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, user_id, full_name, avatar_url')
      .in('user_id', Array.from(authorIds))

    // Map profiles to updates
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    return updates.map((update) => ({
      ...update,
      author: update.author_id ? profileMap.get(update.author_id) : undefined,
    }))
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateStatusUpdateInput
  ): Promise<StatusUpdate> => {
    const { data, error } = await supabase
      .from('status_updates')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        update_type: input.update_type || 'general',
        show_in_client_portal: input.show_in_client_portal ?? false,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Helper to create status update when entity status changes
  createStatusChange: async (
    tenantId: string,
    userId: string,
    entityType: StatusUpdateEntityType,
    entityId: string,
    previousStatus: string,
    newStatus: string,
    content?: string
  ): Promise<StatusUpdate> => {
    return statusUpdatesApi.create(tenantId, userId, {
      entity_type: entityType,
      entity_id: entityId,
      title: `Status changed to ${newStatus}`,
      content: content || `Status changed from ${previousStatus} to ${newStatus}`,
      update_type: newStatus === 'completed' ? 'completed' : 'general',
      previous_status: previousStatus,
      new_status: newStatus,
    })
  },
}
