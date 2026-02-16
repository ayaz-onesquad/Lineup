import { supabase } from '@/services/supabase'
import type { Set, SetWithRelations, CreateSetInput, UpdateSetInput } from '@/types/database'

// Helper to validate UUID format
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Helper to clean input - convert empty strings to null for UUID fields
function cleanUUIDFields<T>(input: T, fields: string[]): T {
  const cleaned = { ...input } as Record<string, unknown>
  for (const field of fields) {
    const value = cleaned[field]
    if (value === '' || value === undefined) {
      cleaned[field] = null
    } else if (typeof value === 'string' && !isValidUUID(value)) {
      cleaned[field] = null
    }
  }
  return cleaned as T
}

export const setsApi = {
  /**
   * Get all sets for tenant (excludes templates by default)
   */
  getAll: async (tenantId: string, includeTemplates = false): Promise<SetWithRelations[]> => {
    let query = supabase
      .from('sets')
      .select(`
        *,
        clients:client_id (id, name),
        projects (*, clients (*)),
        project_phases (*),
        owner:owner_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  /**
   * Get all template sets
   */
  getTemplates: async (tenantId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        clients:client_id (id, name),
        projects (*, clients (*)),
        project_phases (*)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_template', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  getByClientId: async (clientId: string): Promise<SetWithRelations[]> => {
    // Get sets that belong to this client either:
    // 1. Directly via client_id
    // 2. Through a project that belongs to this client

    // First, get sets with direct client_id
    const { data: directSets, error: directError } = await supabase
      .from('sets')
      .select(`
        *,
        projects (*,clients (*)),
        project_phases (*),
        owner:owner_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url)
      `)
      .eq('client_id', clientId)
      .is('deleted_at', null)

    if (directError) throw directError

    // Then, get sets through projects (for sets without direct client_id)
    const { data: projectSets, error: projectError } = await supabase
      .from('sets')
      .select(`
        *,
        projects!inner (*,clients (*)),
        project_phases (*),
        owner:owner_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url)
      `)
      .eq('projects.client_id', clientId)
      .is('client_id', null) // Only get project-linked sets that don't have direct client_id
      .is('deleted_at', null)

    if (projectError) throw projectError

    // Combine and dedupe by id, then sort by created_at descending
    const allSets = [...(directSets || []), ...(projectSets || [])]
    const uniqueSets = Array.from(new Map(allSets.map(s => [s.id, s])).values())
    uniqueSets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return uniqueSets
  },

  getByProjectId: async (projectId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        project_phases (*)
      `)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('set_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getByPhaseId: async (phaseId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select('*')
      .eq('phase_id', phaseId)
      .is('deleted_at', null)
      .order('set_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<SetWithRelations | null> => {
    const { data: set, error } = await supabase
      .from('sets')
      .select(`
        *,
        clients:client_id (id, name),
        projects (*, clients (*)),
        project_phases (*),
        owner:owner_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!set) return null

    // Collect user IDs for creator/updater
    const userIds = new Set<string>()
    if (set.created_by) userIds.add(set.created_by)
    if (set.updated_by) userIds.add(set.updated_by)

    // Fetch user profiles
    let profileMap = new Map<string, { id: string; full_name: string; avatar_url: string | null }>()
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, user_id, full_name, avatar_url')
        .in('user_id', Array.from(userIds))

      if (profiles) {
        profileMap = new Map(profiles.map(p => [p.user_id, { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }]))
      }
    }

    return {
      ...set,
      creator: set.created_by ? profileMap.get(set.created_by) || null : null,
      updater: set.updated_by ? profileMap.get(set.updated_by) || null : null,
    }
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateSetInput
  ): Promise<Set> => {
    // Clean UUID fields
    const cleanedInput = cleanUUIDFields(input, [
      'client_id', 'project_id', 'phase_id', 'owner_id', 'lead_id', 'secondary_lead_id', 'pm_id'
    ])

    // Validate client_id (required)
    if (!cleanedInput.client_id || !isValidUUID(cleanedInput.client_id)) {
      throw new Error('A valid client must be selected')
    }

    // Get next order (either by client or project)
    let orderQuery = supabase
      .from('sets')
      .select('set_order')
      .eq('client_id', cleanedInput.client_id)
      .is('deleted_at', null)
      .order('set_order', { ascending: false })
      .limit(1)

    if (cleanedInput.project_id) {
      orderQuery = supabase
        .from('sets')
        .select('set_order')
        .eq('project_id', cleanedInput.project_id)
        .is('deleted_at', null)
        .order('set_order', { ascending: false })
        .limit(1)
    }

    const { data: existingSets } = await orderQuery

    const nextOrder = cleanedInput.set_order ?? ((existingSets?.[0]?.set_order ?? -1) + 1)

    const { data, error } = await supabase
      .from('sets')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        set_order: nextOrder,
        status: 'open',
        urgency: cleanedInput.urgency || 'medium',
        importance: cleanedInput.importance || 'medium',
        completion_percentage: 0,
        is_template: (cleanedInput as unknown as { is_template?: boolean }).is_template || false,
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, userId: string, input: UpdateSetInput): Promise<Set> => {
    // Clean UUID fields - include client_id and project_id for re-linking
    const cleanedInput = cleanUUIDFields(input, [
      'client_id', 'project_id', 'phase_id', 'owner_id', 'lead_id', 'secondary_lead_id', 'pm_id'
    ])

    // Prepare update data - all fields are allowed to be updated
    const updateData = { ...cleanedInput }

    const { data, error } = await supabase
      .from('sets')
      .update({
        ...updateData,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('sets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  reorder: async (_phaseId: string, setIds: string[]): Promise<void> => {
    const updates = setIds.map((id, index) => ({
      id,
      set_order: index,
    }))

    for (const update of updates) {
      await supabase
        .from('sets')
        .update({ set_order: update.set_order })
        .eq('id', update.id)
    }
  },

  updateCompletionPercentage: async (id: string): Promise<void> => {
    // Calculate from requirements
    const { data: requirements } = await supabase
      .from('requirements')
      .select('status')
      .eq('set_id', id)
      .is('deleted_at', null)

    if (requirements && requirements.length > 0) {
      const completed = requirements.filter((r) => r.status === 'completed').length
      const completion = Math.round((completed / requirements.length) * 100)

      const { data: set } = await supabase
        .from('sets')
        .update({ completion_percentage: completion })
        .eq('id', id)
        .select('phase_id')
        .single()

      // Update phase completion too
      if (set?.phase_id) {
        const { phasesApi } = await import('./phases')
        await phasesApi.updateCompletionPercentage(set.phase_id)
      }
    }
  },

  /**
   * Get active sets where the user is assigned (lead, secondary_lead, pm)
   */
  getMyActive: async (tenantId: string, userProfileId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        clients:client_id (id, name),
        projects (id, name, clients (id, name))
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('is_template', false)
      .neq('status', 'completed')
      .or(`lead_id.eq.${userProfileId},secondary_lead_id.eq.${userProfileId},pm_id.eq.${userProfileId}`)
      .order('priority', { ascending: true })
      .limit(10)

    if (error) throw error
    return data || []
  },

  /**
   * Get portal-visible sets for a project (for client portal)
   */
  getPortalVisible: async (projectId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        clients:client_id (id, name),
        projects (*, clients (*)),
        project_phases (*),
        owner:owner_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url)
      `)
      .eq('project_id', projectId)
      .eq('show_in_client_portal', true)
      .is('deleted_at', null)
      .order('set_order', { ascending: true })

    if (error) throw error
    return data || []
  },
}
