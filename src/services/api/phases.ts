import { supabase } from '@/services/supabase'
import type {
  ProjectPhase,
  PhaseWithRelations,
  CreatePhaseInput,
  UpdatePhaseInput,
} from '@/types/database'

export const phasesApi = {
  getByProjectId: async (projectId: string): Promise<PhaseWithRelations[]> => {
    const { data, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('phase_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<PhaseWithRelations | null> => {
    const { data, error } = await supabase
      .from('project_phases')
      .select(`
        *,
        projects (*)
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
    input: CreatePhaseInput
  ): Promise<ProjectPhase> => {
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
        status: 'not_started',
        completion_percentage: 0,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, input: UpdatePhaseInput): Promise<ProjectPhase> => {
    const { data, error } = await supabase
      .from('project_phases')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('project_phases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  reorder: async (
    _projectId: string,
    phaseIds: string[]
  ): Promise<void> => {
    const updates = phaseIds.map((id, index) => ({
      id,
      phase_order: index,
    }))

    for (const update of updates) {
      await supabase
        .from('project_phases')
        .update({ phase_order: update.phase_order })
        .eq('id', update.id)
    }
  },

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
