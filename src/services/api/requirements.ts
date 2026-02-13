import { supabase } from '@/services/supabase'
import type {
  Requirement,
  RequirementWithRelations,
  CreateRequirementInput,
  UpdateRequirementInput,
} from '@/types/database'

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

// Helper to clean date fields - convert empty strings to null
function cleanDateFields<T>(input: T, fields: string[]): T {
  const cleaned = { ...input } as Record<string, unknown>
  for (const field of fields) {
    const value = cleaned[field]
    // Convert empty string to null for date columns
    if (value === '' || value === undefined) {
      cleaned[field] = null
    }
  }
  return cleaned as T
}

export const requirementsApi = {
  getAll: async (tenantId: string): Promise<RequirementWithRelations[]> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        sets (
          *,
          projects (*, clients (*)),
          project_phases (*)
        ),
        assigned_to:assigned_to_id (id, full_name, avatar_url)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getBySetId: async (setId: string): Promise<RequirementWithRelations[]> => {
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        assigned_to:assigned_to_id (id, full_name, avatar_url)
      `)
      .eq('set_id', setId)
      .is('deleted_at', null)
      .order('requirement_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getByProjectId: async (projectId: string): Promise<RequirementWithRelations[]> => {
    // Get all sets for this project, then get their requirements
    const { data: sets, error: setsError } = await supabase
      .from('sets')
      .select('id')
      .eq('project_id', projectId)
      .is('deleted_at', null)

    if (setsError) throw setsError
    if (!sets || sets.length === 0) return []

    const setIds = sets.map(s => s.id)
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        sets (
          *,
          projects (*, clients (*)),
          project_phases (*)
        ),
        assigned_to:assigned_to_id (id, full_name, avatar_url)
      `)
      .in('set_id', setIds)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getByClientId: async (clientId: string): Promise<RequirementWithRelations[]> => {
    // Now requirements have direct client_id, so query directly
    const { data, error } = await supabase
      .from('requirements')
      .select(`
        *,
        clients (*),
        sets (
          *,
          projects (*, clients (*)),
          project_phases (*)
        ),
        assigned_to:assigned_to_id (id, full_name, avatar_url)
      `)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

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
          projects (*, clients (*)),
          project_phases (*)
        ),
        assigned_to:assigned_to_id (id, full_name, avatar_url)
      `)
      .eq('tenant_id', tenantId)
      .eq('assigned_to_id', userId)
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('expected_due_date', { ascending: true, nullsFirst: false })

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
          projects (*, clients (*)),
          project_phases (*)
        ),
        assigned_to:assigned_to_id (id, full_name, avatar_url),
        lead:lead_id (id, full_name, avatar_url),
        secondary_lead:secondary_lead_id (id, full_name, avatar_url),
        pm:pm_id (id, full_name, avatar_url),
        reviewer:reviewer_id (id, full_name, avatar_url)
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
    // Clean UUID fields
    let cleanedInput = cleanUUIDFields(input, [
      'client_id', 'set_id', 'assigned_to_id', 'lead_id', 'secondary_lead_id', 'pm_id', 'reviewer_id'
    ])

    // Clean date fields - convert empty strings to null
    cleanedInput = cleanDateFields(cleanedInput, [
      'expected_due_date', 'actual_due_date', 'completed_date', 'expected_start_date', 'actual_start_date'
    ])

    // Validate client_id (required)
    if (!cleanedInput.client_id || !isValidUUID(cleanedInput.client_id)) {
      throw new Error('A valid client must be selected')
    }

    // Set_id is now optional - validate only if provided
    if (cleanedInput.set_id && !isValidUUID(cleanedInput.set_id)) {
      cleanedInput.set_id = undefined
    }

    // Get next order (only if set is assigned)
    let nextOrder = 0
    if (cleanedInput.set_id) {
      const { data: existingReqs } = await supabase
        .from('requirements')
        .select('requirement_order')
        .eq('set_id', cleanedInput.set_id)
        .is('deleted_at', null)
        .order('requirement_order', { ascending: false })
        .limit(1)

      nextOrder = cleanedInput.requirement_order ?? ((existingReqs?.[0]?.requirement_order ?? -1) + 1)
    }

    const { data, error } = await supabase
      .from('requirements')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        requirement_order: nextOrder,
        status: 'open',
        requirement_type: cleanedInput.requirement_type || 'task',
        urgency: cleanedInput.urgency || 'medium',
        importance: cleanedInput.importance || 'medium',
        review_status: cleanedInput.requires_review ? 'pending' : 'not_required',
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error

    // Update set completion (only if set is assigned)
    if (cleanedInput.set_id) {
      const { setsApi } = await import('./sets')
      await setsApi.updateCompletionPercentage(cleanedInput.set_id)
    }

    return data
  },

  update: async (id: string, userId: string, input: UpdateRequirementInput): Promise<Requirement> => {
    // Clean UUID fields
    // Note: client_id and set_id are excluded from cleaning because they should never change after creation
    let cleanedInput = cleanUUIDFields(input, [
      'assigned_to_id', 'lead_id', 'secondary_lead_id', 'pm_id', 'reviewer_id'
    ])

    // Clean date fields - convert empty strings to null (fixes "revert" bug when clearing dates)
    cleanedInput = cleanDateFields(cleanedInput, [
      'expected_due_date', 'actual_due_date', 'completed_date', 'expected_start_date', 'actual_start_date'
    ])

    // Explicitly remove client_id and set_id from updates to prevent accidental nullification
    // Requirements should not change their client or set after creation
    const { client_id: _removedClientId, set_id: _removedSetId, ...inputWithoutSetId } = cleanedInput

    const updates: Record<string, unknown> = {
      ...inputWithoutSetId,
      updated_by: userId,
    }

    // Set completed_at if status changed to completed
    if (cleanedInput.status === 'completed') {
      updates.completed_at = new Date().toISOString()
    }

    // Handle review workflow
    if (cleanedInput.requires_review === true && !cleanedInput.review_status) {
      updates.review_status = 'pending'
    } else if (cleanedInput.requires_review === false) {
      updates.review_status = 'not_required'
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

    // Update set completion (only if set is assigned)
    if (req?.set_id) {
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

  updateStatus: async (id: string, userId: string, status: Requirement['status']): Promise<Requirement> => {
    return requirementsApi.update(id, userId, { status })
  },

  // Move requirement to reviewer once primary task is done
  moveToReview: async (id: string, userId: string): Promise<Requirement> => {
    return requirementsApi.update(id, userId, {
      status: 'completed',
      review_status: 'in_review',
    })
  },

  // Complete review
  completeReview: async (id: string, userId: string, approved: boolean): Promise<Requirement> => {
    return requirementsApi.update(id, userId, {
      review_status: approved ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
    })
  },
}
