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
  getAll: async (tenantId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        projects (*),
        project_phases (*),
        owner:user_profiles!sets_owner_id_fkey (*),
        lead:user_profiles!sets_lead_id_fkey (*),
        secondary_lead:user_profiles!sets_secondary_lead_id_fkey (*),
        pm:user_profiles!sets_pm_id_fkey (*),
        creator:user_profiles!sets_created_by_fkey (*),
        updater:user_profiles!sets_updated_by_fkey (*)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('priority_score', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getByProjectId: async (projectId: string): Promise<SetWithRelations[]> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        project_phases (*),
        owner:user_profiles!sets_owner_id_fkey (*),
        lead:user_profiles!sets_lead_id_fkey (*),
        secondary_lead:user_profiles!sets_secondary_lead_id_fkey (*),
        pm:user_profiles!sets_pm_id_fkey (*)
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
      .select(`
        *,
        owner:user_profiles!sets_owner_id_fkey (*),
        lead:user_profiles!sets_lead_id_fkey (*),
        secondary_lead:user_profiles!sets_secondary_lead_id_fkey (*),
        pm:user_profiles!sets_pm_id_fkey (*)
      `)
      .eq('phase_id', phaseId)
      .is('deleted_at', null)
      .order('set_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<SetWithRelations | null> => {
    const { data, error } = await supabase
      .from('sets')
      .select(`
        *,
        projects (*),
        project_phases (*),
        owner:user_profiles!sets_owner_id_fkey (*),
        lead:user_profiles!sets_lead_id_fkey (*),
        secondary_lead:user_profiles!sets_secondary_lead_id_fkey (*),
        pm:user_profiles!sets_pm_id_fkey (*),
        creator:user_profiles!sets_created_by_fkey (*),
        updater:user_profiles!sets_updated_by_fkey (*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateSetInput
  ): Promise<Set> => {
    // Clean UUID fields
    const cleanedInput = cleanUUIDFields(input, [
      'project_id', 'phase_id', 'owner_id', 'lead_id', 'secondary_lead_id', 'pm_id'
    ])

    // Validate project_id
    if (!cleanedInput.project_id || !isValidUUID(cleanedInput.project_id)) {
      throw new Error('A valid project must be selected')
    }

    // Get next order
    const { data: existingSets } = await supabase
      .from('sets')
      .select('set_order')
      .eq('project_id', cleanedInput.project_id)
      .is('deleted_at', null)
      .order('set_order', { ascending: false })
      .limit(1)

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
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, userId: string, input: UpdateSetInput): Promise<Set> => {
    // Clean UUID fields
    const cleanedInput = cleanUUIDFields(input, [
      'project_id', 'phase_id', 'owner_id', 'lead_id', 'secondary_lead_id', 'pm_id'
    ])

    const { data, error } = await supabase
      .from('sets')
      .update({
        ...cleanedInput,
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
}
