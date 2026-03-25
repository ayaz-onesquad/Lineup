import { supabase } from '@/services/supabase'
import type { Competitor, CreateCompetitorInput, UpdateCompetitorInput } from '@/types/database'

export const competitorsApi = {
  /**
   * Get all competitors for tenant (org_admin only via RLS)
   */
  getAll: async (tenantId: string): Promise<Competitor[]> => {
    const { data: competitors, error } = await supabase
      .from('competitors')
      .select(`
        *,
        client:clients!client_id(id, name)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error

    // Fetch creator/updater profiles
    const userIds = new Set<string>()
    competitors?.forEach(c => {
      if (c.created_by) userIds.add(c.created_by)
      if (c.updated_by) userIds.add(c.updated_by)
    })

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

    return (competitors || []).map(c => ({
      ...c,
      creator: c.created_by ? profileMap.get(c.created_by) || null : null,
      updater: c.updated_by ? profileMap.get(c.updated_by) || null : null,
    }))
  },

  /**
   * Get single competitor by ID with client and creator/updater profiles
   */
  getById: async (id: string): Promise<Competitor | null> => {
    const { data: competitor, error } = await supabase
      .from('competitors')
      .select(`
        *,
        client:clients!client_id(id, name)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!competitor) return null

    // Collect user IDs for creator/updater
    const userIds = new Set<string>()
    if (competitor.created_by) userIds.add(competitor.created_by)
    if (competitor.updated_by) userIds.add(competitor.updated_by)

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
      ...competitor,
      creator: competitor.created_by ? profileMap.get(competitor.created_by) || null : null,
      updater: competitor.updated_by ? profileMap.get(competitor.updated_by) || null : null,
    }
  },

  /**
   * Create a new competitor entry
   */
  create: async (
    tenantId: string,
    userProfileId: string,
    input: CreateCompetitorInput
  ): Promise<Competitor> => {
    const { data, error } = await supabase
      .from('competitors')
      .insert({
        tenant_id: tenantId,
        created_by: userProfileId,
        updated_by: userProfileId,
        name: input.name,
        website: input.website || null,
        industry: input.industry || null,
        description: input.description || null,
        status: input.status || 'active',
        threat_level: input.threat_level || null,
        target_market: input.target_market || null,
        pricing_model: input.pricing_model || null,
        pricing_notes: input.pricing_notes || null,
        strengths: input.strengths || null,
        weaknesses: input.weaknesses || null,
        differentiators: input.differentiators || null,
        linkedin_url: input.linkedin_url || null,
        twitter_url: input.twitter_url || null,
        crunchbase_url: input.crunchbase_url || null,
        client_id: input.client_id || null,
        tags: input.tags || [],
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update an existing competitor entry
   */
  update: async (
    id: string,
    userProfileId: string,
    input: UpdateCompetitorInput
  ): Promise<Competitor> => {
    const updateData: Record<string, unknown> = {
      updated_by: userProfileId,
    }

    // Only include fields that are explicitly provided
    if (input.name !== undefined) updateData.name = input.name
    if (input.website !== undefined) updateData.website = input.website || null
    if (input.industry !== undefined) updateData.industry = input.industry || null
    if (input.description !== undefined) updateData.description = input.description || null
    if (input.status !== undefined) updateData.status = input.status
    if (input.threat_level !== undefined) updateData.threat_level = input.threat_level || null
    if (input.target_market !== undefined) updateData.target_market = input.target_market || null
    if (input.pricing_model !== undefined) updateData.pricing_model = input.pricing_model || null
    if (input.pricing_notes !== undefined) updateData.pricing_notes = input.pricing_notes || null
    if (input.strengths !== undefined) updateData.strengths = input.strengths || null
    if (input.weaknesses !== undefined) updateData.weaknesses = input.weaknesses || null
    if (input.differentiators !== undefined) updateData.differentiators = input.differentiators || null
    if (input.linkedin_url !== undefined) updateData.linkedin_url = input.linkedin_url || null
    if (input.twitter_url !== undefined) updateData.twitter_url = input.twitter_url || null
    if (input.crunchbase_url !== undefined) updateData.crunchbase_url = input.crunchbase_url || null
    if (input.client_id !== undefined) updateData.client_id = input.client_id || null
    if (input.tags !== undefined) updateData.tags = input.tags || []
    if (input.last_reviewed_at !== undefined) updateData.last_reviewed_at = input.last_reviewed_at || null

    const { data, error } = await supabase
      .from('competitors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a competitor entry
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('competitors')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },
}
