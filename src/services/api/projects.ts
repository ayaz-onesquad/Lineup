import { supabase } from '@/services/supabase'
import type {
  Project,
  ProjectWithRelations,
  CreateProjectInput,
  UpdateProjectInput,
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

export const projectsApi = {
  getAll: async (tenantId: string): Promise<ProjectWithRelations[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*),
        lead:user_profiles!projects_lead_id_fkey (*),
        secondary_lead:user_profiles!projects_secondary_lead_id_fkey (*),
        pm:user_profiles!projects_pm_id_fkey (*),
        creator:user_profiles!projects_created_by_fkey (*),
        updater:user_profiles!projects_updated_by_fkey (*)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getByClientId: async (clientId: string): Promise<ProjectWithRelations[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*),
        lead:user_profiles!projects_lead_id_fkey (*),
        secondary_lead:user_profiles!projects_secondary_lead_id_fkey (*),
        pm:user_profiles!projects_pm_id_fkey (*)
      `)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<ProjectWithRelations | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*),
        lead:user_profiles!projects_lead_id_fkey (*),
        secondary_lead:user_profiles!projects_secondary_lead_id_fkey (*),
        pm:user_profiles!projects_pm_id_fkey (*),
        creator:user_profiles!projects_created_by_fkey (*),
        updater:user_profiles!projects_updated_by_fkey (*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  getWithHierarchy: async (id: string): Promise<ProjectWithRelations | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*),
        lead:user_profiles!projects_lead_id_fkey (*),
        secondary_lead:user_profiles!projects_secondary_lead_id_fkey (*),
        pm:user_profiles!projects_pm_id_fkey (*),
        phases:project_phases (
          *,
          owner:user_profiles!project_phases_owner_id_fkey (*),
          sets (
            *,
            owner:user_profiles!sets_owner_id_fkey (*),
            lead:user_profiles!sets_lead_id_fkey (*),
            secondary_lead:user_profiles!sets_secondary_lead_id_fkey (*),
            pm:user_profiles!sets_pm_id_fkey (*),
            requirements (
              *,
              assigned_to:user_profiles!requirements_assigned_to_id_fkey (*),
              lead:user_profiles!requirements_lead_id_fkey (*),
              secondary_lead:user_profiles!requirements_secondary_lead_id_fkey (*),
              pm:user_profiles!requirements_pm_id_fkey (*)
            )
          )
        )
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
    input: CreateProjectInput
  ): Promise<Project> => {
    // Clean UUID fields to prevent "invalid UUID" errors
    const cleanedInput = cleanUUIDFields(input, ['client_id', 'lead_id', 'secondary_lead_id', 'pm_id'])

    // Validate client_id is a valid UUID
    if (!cleanedInput.client_id || !isValidUUID(cleanedInput.client_id)) {
      throw new Error('A valid client must be selected')
    }

    // Generate project code
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', cleanedInput.client_id)
      .single()

    const clientName = client?.name || 'XXX'
    const prefix = clientName.substring(0, 3).toUpperCase().padEnd(3, 'X')

    // Get next number for this prefix
    const { data: existingProjects } = await supabase
      .from('projects')
      .select('project_code')
      .eq('tenant_id', tenantId)
      .like('project_code', `${prefix}-%`)

    const nextNum = (existingProjects?.length || 0) + 1
    const projectCode = cleanedInput.project_code || `${prefix}-${String(nextNum).padStart(3, '0')}`

    const { data, error } = await supabase
      .from('projects')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        project_code: projectCode,
        status: 'planning',
        health: 'on_track',
        completion_percentage: 0,
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, userId: string, input: UpdateProjectInput): Promise<Project> => {
    // Clean UUID fields to prevent "invalid UUID" errors
    const cleanedInput = cleanUUIDFields(input, ['client_id', 'lead_id', 'secondary_lead_id', 'pm_id'])

    const { data, error } = await supabase
      .from('projects')
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
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  updateCompletionPercentage: async (id: string): Promise<void> => {
    // Calculate from phases
    const { data: phases } = await supabase
      .from('project_phases')
      .select('completion_percentage')
      .eq('project_id', id)
      .is('deleted_at', null)

    if (phases && phases.length > 0) {
      const avgCompletion = Math.round(
        phases.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / phases.length
      )

      await supabase
        .from('projects')
        .update({ completion_percentage: avgCompletion })
        .eq('id', id)
    }
  },
}
