import { supabase } from '@/services/supabase'
import type { Password, CreatePasswordInput, UpdatePasswordInput } from '@/types/database'

export const passwordsApi = {
  /**
   * Get all passwords for tenant (org_admin only via RLS)
   */
  getAll: async (tenantId: string): Promise<Password[]> => {
    const { data, error } = await supabase
      .from('passwords')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('application_name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Get single password by ID with creator/updater profiles
   */
  getById: async (id: string): Promise<Password | null> => {
    const { data: password, error } = await supabase
      .from('passwords')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!password) return null

    // Collect user IDs for creator/updater
    const userIds = new Set<string>()
    if (password.created_by) userIds.add(password.created_by)
    if (password.updated_by) userIds.add(password.updated_by)

    // Fetch user profiles
    let profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url')
        .in('id', Array.from(userIds))

      if (profiles) {
        profileMap = new Map(profiles.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))
      }
    }

    return {
      ...password,
      creator: password.created_by ? profileMap.get(password.created_by) || null : null,
      updater: password.updated_by ? profileMap.get(password.updated_by) || null : null,
    }
  },

  /**
   * Create a new password entry
   */
  create: async (
    tenantId: string,
    userProfileId: string,
    input: CreatePasswordInput
  ): Promise<Password> => {
    const { data, error } = await supabase
      .from('passwords')
      .insert({
        tenant_id: tenantId,
        created_by: userProfileId,
        updated_by: userProfileId,
        application_name: input.application_name,
        url: input.url || null,
        username: input.username || null,
        email: input.email || null,
        password: input.password,
        category: input.category || null,
        notes: input.notes || null,
        password_changed_at: input.password_changed_at || null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update an existing password entry
   */
  update: async (
    id: string,
    userProfileId: string,
    input: UpdatePasswordInput
  ): Promise<Password> => {
    const updateData: Record<string, unknown> = {
      updated_by: userProfileId,
    }

    // Only include fields that are explicitly provided
    if (input.application_name !== undefined) updateData.application_name = input.application_name
    if (input.url !== undefined) updateData.url = input.url || null
    if (input.username !== undefined) updateData.username = input.username || null
    if (input.email !== undefined) updateData.email = input.email || null
    if (input.password !== undefined) updateData.password = input.password
    if (input.category !== undefined) updateData.category = input.category || null
    if (input.notes !== undefined) updateData.notes = input.notes || null
    if (input.password_changed_at !== undefined) updateData.password_changed_at = input.password_changed_at || null

    const { data, error } = await supabase
      .from('passwords')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a password entry
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('passwords')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },
}
