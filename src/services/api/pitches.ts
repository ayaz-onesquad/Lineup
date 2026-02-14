import { supabase } from '@/services/supabase'
import type {
  Pitch,
  PitchWithRelations,
  CreatePitchInput,
  UpdatePitchInput,
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

// Flattened select to avoid PostgREST depth limitations
// We fetch sets with their direct relations only, then handle client/project separately
const PITCH_SELECT = `
  *,
  sets:set_id (
    id, name, client_id, project_id
  ),
  lead:lead_id (id, full_name, avatar_url),
  secondary_lead:secondary_lead_id (id, full_name, avatar_url),
  approved_by:approved_by_id (id, full_name, avatar_url)
`

// Helper to enrich pitches with client/project data
async function enrichPitchesWithRelations(pitches: any[]): Promise<any[]> {
  if (!pitches.length) return pitches

  // Collect all unique client and project IDs
  const clientIds = new Set<string>()
  const projectIds = new Set<string>()

  for (const pitch of pitches) {
    if (pitch.sets?.client_id) clientIds.add(pitch.sets.client_id)
    if (pitch.sets?.project_id) projectIds.add(pitch.sets.project_id)
  }

  // Fetch clients and projects in parallel
  const [clientsResult, projectsResult] = await Promise.all([
    clientIds.size > 0
      ? supabase.from('clients').select('id, name').in('id', Array.from(clientIds))
      : Promise.resolve({ data: [], error: null }),
    projectIds.size > 0
      ? supabase.from('projects').select('id, name, client_id').in('id', Array.from(projectIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  // Build lookup maps
  const clientMap = new Map((clientsResult.data || []).map((c) => [c.id, c]))
  const projectMap = new Map((projectsResult.data || []).map((p) => [p.id, p]))

  // Enrich pitches
  return pitches.map((pitch) => {
    const set = pitch.sets
    if (!set) return pitch

    const project = set.project_id ? projectMap.get(set.project_id) : null
    const client = project
      ? clientMap.get(project.client_id) || clientMap.get(set.client_id)
      : clientMap.get(set.client_id)

    return {
      ...pitch,
      sets: {
        ...set,
        clients: client || null,
        projects: project ? { ...project, clients: clientMap.get(project.client_id) || null } : null,
      },
    }
  })
}

export const pitchesApi = {
  /**
   * Get all pitches for tenant (excludes templates by default)
   */
  getAll: async (tenantId: string, includeTemplates = false): Promise<PitchWithRelations[]> => {
    let query = supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error

    // Enrich with client/project relations
    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Get pitches by set ID (parent-child relationship)
   */
  getBySetId: async (setId: string, includeTemplates = false): Promise<PitchWithRelations[]> => {
    let query = supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .eq('set_id', setId)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error

    // Enrich with client/project relations
    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Get pitch by ID
   */
  getById: async (id: string): Promise<PitchWithRelations | null> => {
    const { data, error } = await supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!data) return null

    // Enrich with client/project relations
    const enriched = await enrichPitchesWithRelations([data])
    return enriched[0] || null
  },

  /**
   * Get all template pitches
   */
  getTemplates: async (tenantId: string): Promise<PitchWithRelations[]> => {
    const { data, error } = await supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .eq('tenant_id', tenantId)
      .eq('is_template', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error

    // Enrich with client/project relations
    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Get pitches by client ID (via sets)
   */
  getByClientId: async (clientId: string, includeTemplates = false): Promise<PitchWithRelations[]> => {
    // First get all sets for this client
    const { data: sets, error: setsError } = await supabase
      .from('sets')
      .select('id')
      .eq('client_id', clientId)
      .is('deleted_at', null)

    if (setsError) throw setsError
    if (!sets || sets.length === 0) return []

    const setIds = sets.map((s) => s.id)

    let query = supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .in('set_id', setIds)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error

    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Get pitches by project ID (via sets)
   */
  getByProjectId: async (projectId: string, includeTemplates = false): Promise<PitchWithRelations[]> => {
    // First get all sets for this project
    const { data: sets, error: setsError } = await supabase
      .from('sets')
      .select('id')
      .eq('project_id', projectId)
      .is('deleted_at', null)

    if (setsError) throw setsError
    if (!sets || sets.length === 0) return []

    const setIds = sets.map((s) => s.id)

    let query = supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .in('set_id', setIds)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error

    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Get pitches by phase ID (via sets)
   */
  getByPhaseId: async (phaseId: string, includeTemplates = false): Promise<PitchWithRelations[]> => {
    // First get all sets for this phase
    const { data: sets, error: setsError } = await supabase
      .from('sets')
      .select('id')
      .eq('phase_id', phaseId)
      .is('deleted_at', null)

    if (setsError) throw setsError
    if (!sets || sets.length === 0) return []

    const setIds = sets.map((s) => s.id)

    let query = supabase
      .from('pitches')
      .select(PITCH_SELECT)
      .in('set_id', setIds)
      .is('deleted_at', null)
      .order('order_key', { ascending: true })

    if (!includeTemplates) {
      query = query.eq('is_template', false)
    }

    const { data, error } = await query

    if (error) throw error

    return enrichPitchesWithRelations(data || [])
  },

  /**
   * Create a new pitch (set_id is REQUIRED - enforces parent-child)
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreatePitchInput
  ): Promise<Pitch> => {
    // Validate set_id is provided (parent-child enforcement)
    if (!input.set_id || !isValidUUID(input.set_id)) {
      throw new Error('A valid set must be selected (set_id is required)')
    }

    // Clean UUID fields
    const cleanedInput = cleanUUIDFields(input, [
      'set_id',
      'lead_id',
      'secondary_lead_id',
      'predecessor_pitch_id',
      'successor_pitch_id',
    ])

    const { data, error } = await supabase
      .from('pitches')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        status: 'not_started',
        urgency: cleanedInput.urgency || 'medium',
        importance: cleanedInput.importance || 'medium',
        completion_percentage: 0,
        is_approved: false,
        is_template: cleanedInput.is_template || false,
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a pitch
   */
  update: async (id: string, userId: string, input: UpdatePitchInput): Promise<Pitch> => {
    // Clean UUID fields (excluding set_id - cannot change parent)
    const cleanedInput = cleanUUIDFields(input, [
      'lead_id',
      'secondary_lead_id',
      'predecessor_pitch_id',
      'successor_pitch_id',
      'approved_by_id',
    ])

    const { data, error } = await supabase
      .from('pitches')
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
   * Soft delete a pitch
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('pitches')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Reorder pitches within a set
   */
  reorder: async (_setId: string, pitchIds: string[]): Promise<void> => {
    const updates = pitchIds.map((id, index) => ({
      id,
      order_manual: index,
    }))

    for (const update of updates) {
      await supabase
        .from('pitches')
        .update({ order_manual: update.order_manual })
        .eq('id', update.id)
    }
  },

  /**
   * Approve a pitch
   */
  approve: async (
    id: string,
    userId: string,
    approvedById: string
  ): Promise<Pitch> => {
    const { data, error } = await supabase
      .from('pitches')
      .update({
        is_approved: true,
        approved_by_id: approvedById,
        approved_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Reject/unapprove a pitch
   */
  reject: async (id: string, userId: string): Promise<Pitch> => {
    const { data, error } = await supabase
      .from('pitches')
      .update({
        is_approved: false,
        approved_by_id: null,
        approved_at: null,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update completion percentage based on child requirements
   */
  updateCompletionPercentage: async (id: string): Promise<void> => {
    const { data: requirements } = await supabase
      .from('requirements')
      .select('status')
      .eq('pitch_id', id)
      .is('deleted_at', null)

    if (requirements && requirements.length > 0) {
      const completed = requirements.filter((r) => r.status === 'completed').length
      const completion = Math.round((completed / requirements.length) * 100)

      await supabase
        .from('pitches')
        .update({ completion_percentage: completion })
        .eq('id', id)
    }
  },
}
