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
    console.log('[projectsApi.getAll] Fetching projects for tenant:', tenantId)

    // First, get the projects with client data
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[projectsApi.getAll] Error fetching projects:', error)
      throw error
    }

    if (!projects || projects.length === 0) {
      console.log('[projectsApi.getAll] No projects found')
      return []
    }

    // Collect all user IDs that need profile info
    const userIds = new Set<string>()
    projects.forEach(p => {
      if (p.lead_id) userIds.add(p.lead_id)
      if (p.secondary_lead_id) userIds.add(p.secondary_lead_id)
      if (p.pm_id) userIds.add(p.pm_id)
    })

    // Fetch user profiles if there are any to fetch
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

    // Map projects with user profile data
    const result = projects.map(p => ({
      ...p,
      lead: p.lead_id ? profileMap.get(p.lead_id) || null : null,
      secondary_lead: p.secondary_lead_id ? profileMap.get(p.secondary_lead_id) || null : null,
      pm: p.pm_id ? profileMap.get(p.pm_id) || null : null,
    }))

    console.log('[projectsApi.getAll] Result:', { count: result.length })
    return result
  },

  getByClientId: async (clientId: string, tenantId: string): Promise<ProjectWithRelations[]> => {
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*)
      `)
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!projects || projects.length === 0) return []

    // Collect all user IDs
    const userIds = new Set<string>()
    projects.forEach(p => {
      if (p.lead_id) userIds.add(p.lead_id)
      if (p.secondary_lead_id) userIds.add(p.secondary_lead_id)
      if (p.pm_id) userIds.add(p.pm_id)
    })

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

    return projects.map(p => ({
      ...p,
      lead: p.lead_id ? profileMap.get(p.lead_id) || null : null,
      secondary_lead: p.secondary_lead_id ? profileMap.get(p.secondary_lead_id) || null : null,
      pm: p.pm_id ? profileMap.get(p.pm_id) || null : null,
    }))
  },

  getById: async (id: string): Promise<ProjectWithRelations | null> => {
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!project) return null

    // Collect user IDs
    const userIds = new Set<string>()
    if (project.lead_id) userIds.add(project.lead_id)
    if (project.secondary_lead_id) userIds.add(project.secondary_lead_id)
    if (project.pm_id) userIds.add(project.pm_id)
    if (project.created_by) userIds.add(project.created_by)
    if (project.updated_by) userIds.add(project.updated_by)

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
      ...project,
      lead: project.lead_id ? profileMap.get(project.lead_id) || null : null,
      secondary_lead: project.secondary_lead_id ? profileMap.get(project.secondary_lead_id) || null : null,
      pm: project.pm_id ? profileMap.get(project.pm_id) || null : null,
      creator: project.created_by ? profileMap.get(project.created_by) || null : null,
      updater: project.updated_by ? profileMap.get(project.updated_by) || null : null,
    }
  },

  getWithHierarchy: async (id: string): Promise<ProjectWithRelations | null> => {
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (*),
        phases:project_phases (
          *,
          sets (
            *,
            requirements (*)
          )
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!project) return null

    // Collect user IDs
    const userIds = new Set<string>()
    if (project.lead_id) userIds.add(project.lead_id)
    if (project.secondary_lead_id) userIds.add(project.secondary_lead_id)
    if (project.pm_id) userIds.add(project.pm_id)
    if (project.created_by) userIds.add(project.created_by)
    if (project.updated_by) userIds.add(project.updated_by)

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
      ...project,
      lead: project.lead_id ? profileMap.get(project.lead_id) || null : null,
      secondary_lead: project.secondary_lead_id ? profileMap.get(project.secondary_lead_id) || null : null,
      pm: project.pm_id ? profileMap.get(project.pm_id) || null : null,
      creator: project.created_by ? profileMap.get(project.created_by) || null : null,
      updater: project.updated_by ? profileMap.get(project.updated_by) || null : null,
    }
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateProjectInput
  ): Promise<Project> => {
    console.log('[projectsApi.create] Input received:', { tenantId, userId, client_id: input.client_id })

    // Validate client_id BEFORE cleaning - catch empty strings early
    if (!input.client_id || input.client_id.trim() === '') {
      console.error('[projectsApi.create] client_id is empty or missing')
      throw new Error('Client is required. Please select a client before creating a project.')
    }

    // Clean UUID fields to prevent "invalid UUID" errors
    const cleanedInput = cleanUUIDFields(input, ['client_id', 'lead_id', 'secondary_lead_id', 'pm_id'])

    // Validate client_id is a valid UUID after cleaning
    if (!cleanedInput.client_id || !isValidUUID(cleanedInput.client_id)) {
      console.error('[projectsApi.create] client_id is not a valid UUID:', cleanedInput.client_id)
      throw new Error('Invalid client selected. Please select a valid client.')
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
    // Note: client_id is excluded because it should never change after creation
    const cleanedInput = cleanUUIDFields(input, ['lead_id', 'secondary_lead_id', 'pm_id'])

    // Explicitly remove client_id from updates to prevent accidental nullification
    // Projects should not change their client after creation
    const { client_id: _removedClientId, ...updateData } = cleanedInput

    const { data, error } = await supabase
      .from('projects')
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
