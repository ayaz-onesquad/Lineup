import { supabase } from '@/services/supabase'
import type {
  ProjectPhase,
  CreatePhaseInput,
  UpdatePhaseInput,
  EnhancedProjectPhase,
  UrgencyLevel,
  ImportanceLevel,
  PhaseStatus,
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

const PHASE_SELECT = `
  *,
  projects (id, name, client_id, clients (id, name)),
  lead:lead_id (id, full_name, avatar_url),
  secondary_lead:secondary_lead_id (id, full_name, avatar_url),
  owner:owner_id (id, full_name, avatar_url)
`

// Extended input types for enhanced phases
interface CreateEnhancedPhaseInput extends CreatePhaseInput {
  status?: PhaseStatus
  lead_id?: string
  secondary_lead_id?: string
  order_manual?: number
  predecessor_phase_id?: string
  successor_phase_id?: string
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  notes?: string
  is_template?: boolean
}

interface UpdateEnhancedPhaseInput extends UpdatePhaseInput {
  lead_id?: string
  secondary_lead_id?: string
  order_manual?: number
  predecessor_phase_id?: string
  successor_phase_id?: string
  urgency?: UrgencyLevel
  importance?: ImportanceLevel
  notes?: string
  is_template?: boolean
}

export const phasesApi = {
  /**
   * Get all phases for tenant (excludes templates by default)
   */
  getAll: async (tenantId: string, includeTemplates = false): Promise<EnhancedProjectPhase[]> => {
    let query = supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  /**
   * Get phases by project ID (excludes templates by default)
   */
  getByProjectId: async (projectId: string, includeTemplates = false): Promise<EnhancedProjectPhase[]> => {
    let query = supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  /**
   * Get phase by ID
   */
  getById: async (id: string): Promise<EnhancedProjectPhase | null> => {
    const { data, error } = await supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Get all template phases
   */
  getTemplates: async (tenantId: string): Promise<EnhancedProjectPhase[]> => {
    const { data, error } = await supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('is_template', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Create a new phase
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateEnhancedPhaseInput
  ): Promise<ProjectPhase> => {
    // Clean UUID fields
    const cleanedInput = cleanUUIDFields(input, [
      'project_id',
      'owner_id',
      'lead_id',
      'secondary_lead_id',
      'predecessor_phase_id',
      'successor_phase_id',
    ])

    // Validate project_id is provided
    if (!cleanedInput.project_id || !isValidUUID(cleanedInput.project_id)) {
      throw new Error('A valid project must be selected (project_id is required)')
    }

    // Get next order
    const { data: existingPhases } = await supabase
      .from('project_phases')
      .select('phase_order')
      .eq('project_id', input.project_id)
      .is('deleted_at', null)
      .order('phase_order', { ascending: false })
      .limit(1)

    const nextOrder = input.phase_order ?? ((existingPhases?.[0]?.phase_order ?? -1) + 1)

    const { data, error } = await supabase
      .from('project_phases')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        phase_order: nextOrder,
        status: cleanedInput.status || 'not_started',
        completion_percentage: 0,
        urgency: cleanedInput.urgency || 'medium',
        importance: cleanedInput.importance || 'medium',
        is_template: cleanedInput.is_template || false,
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a phase
   */
  update: async (id: string, userId: string, input: UpdateEnhancedPhaseInput): Promise<ProjectPhase> => {
    // Clean UUID fields (exclude project_id - cannot change parent)
    const cleanedInput = cleanUUIDFields(input, [
      'owner_id',
      'lead_id',
      'secondary_lead_id',
      'predecessor_phase_id',
      'successor_phase_id',
    ])

    const { data, error } = await supabase
      .from('project_phases')
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

  /**
   * Soft delete a phase
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('project_phases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Reorder phases within a project
   */
  reorder: async (_projectId: string, phaseIds: string[]): Promise<void> => {
    const updates = phaseIds.map((id, index) => ({
      id,
      order_manual: index,
    }))

    for (const update of updates) {
      await supabase
        .from('project_phases')
        .update({ order_manual: update.order_manual })
        .eq('id', update.id)
    }
  },

  /**
   * Update completion percentage based on child sets
   */
  updateCompletionPercentage: async (id: string): Promise<void> => {
    // Calculate from sets
    const { data: sets } = await supabase
      .from('sets')
      .select('completion_percentage')
      .eq('phase_id', id)
      .is('deleted_at', null)

    if (sets && sets.length > 0) {
      const avgCompletion = Math.round(
        sets.reduce((sum, s) => sum + (s.completion_percentage || 0), 0) / sets.length
      )

      const { data: phase } = await supabase
        .from('project_phases')
        .update({ completion_percentage: avgCompletion })
        .eq('id', id)
        .select('project_id')
        .single()

      // Update project completion too
      if (phase) {
        const { projectsApi } = await import('./projects')
        await projectsApi.updateCompletionPercentage(phase.project_id)
      }
    }
  },
}
