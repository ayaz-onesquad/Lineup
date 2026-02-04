import { supabase } from '@/services/supabase'
import type {
  Requirement,
  RequirementWithRelations,
  CreateRequirementInput,
  UpdateRequirementInput,
} from '@/types/database'

export const requirementsApi = {
  getAll: async (tenantId: string): Promise<RequirementWithRelations[]> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        sets (
          *,
          projects (*),
          project_phases (*)
        ),
        assigned_to:user_profiles!requirements_assigned_to_id_fkey (*)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getBySetId: async (setId: string): Promise<RequirementWithRelations[]> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        assigned_to:user_profiles!requirements_assigned_to_id_fkey (*),
        reviewer:user_profiles!requirements_reviewer_id_fkey (*)
      `)
      .eq('set_id', setId)
      .is('deleted_at', null)
      .order('requirement_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getByAssignedTo: async (
    tenantId: string,
    userId: string
  ): Promise<RequirementWithRelations[]> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        sets (
          *,
          projects (*),
          project_phases (*)
        ),
        assigned_to:user_profiles!requirements_assigned_to_id_fkey (*)
      `)
      .eq('tenant_id', tenantId)
      .eq('assigned_to_id', userId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<RequirementWithRelations | null> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        sets (
          *,
          projects (*),
          project_phases (*)
        ),
        assigned_to:user_profiles!requirements_assigned_to_id_fkey (*),
        reviewer:user_profiles!requirements_reviewer_id_fkey (*)
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
    input: CreateRequirementInput
  ): Promise<Requirement> => {
    // Get next order
    const { data: existingReqs } = await supabase
      .from('requirements')
      .select('requirement_order')
      .eq('set_id', input.set_id)
      .is('deleted_at', null)
      .order('requirement_order', { ascending: false })
      .limit(1)

    const nextOrder = input.requirement_order ?? ((existingReqs?.[0]?.requirement_order ?? -1) + 1)

    const { data, error } = await supabase
      .from('requirements')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        requirement_order: nextOrder,
        status: 'open',
        requirement_type: input.requirement_type || 'task',
        ...input,
      })
      .select()
      .single()

    if (error) throw error

    // Update set completion
    const { setsApi } = await import('./sets')
    await setsApi.updateCompletionPercentage(input.set_id)

    return data
  },

  update: async (id: string, input: UpdateRequirementInput): Promise<Requirement> => {
    const updates: Record<string, unknown> = { ...input }

    // Set completed_at if status changed to completed
    if (input.status === 'completed') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('requirements')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Update set completion
    const { setsApi } = await import('./sets')
    await setsApi.updateCompletionPercentage(data.set_id)

    return data
  },

  delete: async (id: string): Promise<void> => {
    // Get set_id first
    const { data: req } = await supabase
      .from('requirements')
      .select('set_id')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('requirements')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    // Update set completion
    if (req) {
      const { setsApi } = await import('./sets')
      await setsApi.updateCompletionPercentage(req.set_id)
    }
  },

  reorder: async (_setId: string, requirementIds: string[]): Promise<void> => {
    const updates = requirementIds.map((id, index) => ({
      id,
      requirement_order: index,
    }))

    for (const update of updates) {
      await supabase
        .from('requirements')
        .update({ requirement_order: update.requirement_order })
        .eq('id', update.id)
    }
  },

  updateStatus: async (id: string, status: Requirement['status']): Promise<Requirement> => {
    return requirementsApi.update(id, { status })
  },
}
