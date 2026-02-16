import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore, useTenantStore } from '@/stores'
import type { MyWorkKpis, MyWorkItem } from '@/types/database'

/**
 * Get user profile ID from auth user ID
 */
function useUserProfileId() {
  const { user } = useAuthStore()

  return useQuery({
    queryKey: ['user-profile-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single()

      if (error) throw error
      return data.id
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  })
}

/**
 * Get My Work KPIs (Past Due vs Active counts)
 */
export function useMyWorkKpis() {
  const { data: userProfileId } = useUserProfileId()

  return useQuery({
    queryKey: ['my-work-kpis', userProfileId],
    queryFn: async (): Promise<MyWorkKpis> => {
      const { data, error } = await supabase.rpc('get_my_work_kpis', {
        p_user_profile_id: userProfileId,
      })

      if (error) throw error
      return data as MyWorkKpis
    },
    enabled: !!userProfileId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}

/**
 * Get unified My Work items (sets, pitches, requirements combined)
 */
export function useMyWorkItems(options?: { limit?: number }) {
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useUserProfileId()

  return useQuery({
    queryKey: ['my-work-items', currentTenant?.id, userProfileId, options?.limit],
    queryFn: async (): Promise<MyWorkItem[]> => {
      const { data, error } = await supabase
        .from('my_work_items')
        .select('*')
        .eq('tenant_id', currentTenant!.id)
        .or(`lead_id.eq.${userProfileId},secondary_lead_id.eq.${userProfileId},pm_id.eq.${userProfileId},assigned_to_id.eq.${userProfileId}`)
        .not('status', 'in', '("completed","cancelled")')
        .order('priority', { ascending: true })
        .order('expected_due_date', { ascending: true, nullsFirst: false })
        .limit(options?.limit || 50)

      if (error) throw error
      return data || []
    },
    enabled: !!currentTenant?.id && !!userProfileId,
  })
}

/**
 * Get My Work items grouped by type
 */
export function useMyWorkGrouped() {
  const { data: items, isLoading, error } = useMyWorkItems({ limit: 100 })

  const grouped = {
    sets: items?.filter((i) => i.item_type === 'set') || [],
    pitches: items?.filter((i) => i.item_type === 'pitch') || [],
    requirements: items?.filter((i) => i.item_type === 'requirement') || [],
  }

  // Group by parent for better organization
  const setsByProject = new Map<string, MyWorkItem[]>()
  const pitchesBySet = new Map<string, MyWorkItem[]>()
  const requirementsByPitch = new Map<string, MyWorkItem[]>()

  grouped.sets.forEach((set) => {
    const key = set.project_id || 'unassigned'
    if (!setsByProject.has(key)) setsByProject.set(key, [])
    setsByProject.get(key)!.push(set)
  })

  grouped.pitches.forEach((pitch) => {
    const key = pitch.set_id || 'unassigned'
    if (!pitchesBySet.has(key)) pitchesBySet.set(key, [])
    pitchesBySet.get(key)!.push(pitch)
  })

  grouped.requirements.forEach((req) => {
    const key = req.pitch_id || req.set_id || 'unassigned'
    if (!requirementsByPitch.has(key)) requirementsByPitch.set(key, [])
    requirementsByPitch.get(key)!.push(req)
  })

  return {
    isLoading,
    error,
    sets: grouped.sets,
    pitches: grouped.pitches,
    requirements: grouped.requirements,
    setsByProject,
    pitchesBySet,
    requirementsByPitch,
    unassignedSets: setsByProject.get('unassigned') || [],
    unassignedPitches: pitchesBySet.get('unassigned') || [],
    unassignedRequirements: requirementsByPitch.get('unassigned') || [],
  }
}

/**
 * Get past due items for the current user
 */
export function useMyPastDueItems() {
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useUserProfileId()

  return useQuery({
    queryKey: ['my-past-due', currentTenant?.id, userProfileId],
    queryFn: async () => {
      // Fetch past due sets
      const { data: sets } = await supabase
        .from('my_past_due_sets')
        .select('*')
        .eq('tenant_id', currentTenant!.id)
        .or(`lead_id.eq.${userProfileId},secondary_lead_id.eq.${userProfileId},pm_id.eq.${userProfileId}`)

      // Fetch past due pitches
      const { data: pitches } = await supabase
        .from('my_past_due_pitches')
        .select('*')
        .eq('tenant_id', currentTenant!.id)
        .or(`lead_id.eq.${userProfileId},secondary_lead_id.eq.${userProfileId}`)

      // Fetch past due requirements
      const { data: requirements } = await supabase
        .from('my_past_due_requirements')
        .select('*')
        .eq('tenant_id', currentTenant!.id)
        .eq('assigned_to_id', userProfileId!)

      return {
        sets: sets || [],
        pitches: pitches || [],
        requirements: requirements || [],
        totalPastDue: (sets?.length || 0) + (pitches?.length || 0) + (requirements?.length || 0),
      }
    },
    enabled: !!currentTenant?.id && !!userProfileId,
  })
}

/**
 * Get high-priority tasks (is_task = true) for the current user
 */
export function useMyHighPriorityTasks(limit: number = 10) {
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useUserProfileId()

  return useQuery({
    queryKey: ['my-high-priority-tasks', currentTenant?.id, userProfileId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requirements')
        .select(`
          *,
          sets:set_id (id, name, client_id, clients:client_id (id, name)),
          pitches:pitch_id (id, name)
        `)
        .eq('tenant_id', currentTenant!.id)
        .eq('is_task', true)
        .eq('assigned_to_id', userProfileId!)
        .is('deleted_at', null)
        .eq('is_template', false)
        .not('status', 'in', '("completed","cancelled")')
        .order('priority', { ascending: true })
        .order('expected_due_date', { ascending: true, nullsFirst: false })
        .limit(limit)

      if (error) throw error
      return data || []
    },
    enabled: !!currentTenant?.id && !!userProfileId,
  })
}

/**
 * Get ALL tasks (is_task = true) grouped by priority for the current user
 * Returns tasks in 3 groups: high (priority 1-2), medium (3-4), low (5-6)
 */
export function useMyTasksByPriority(limit: number = 50) {
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useUserProfileId()

  return useQuery({
    queryKey: ['my-tasks-by-priority', currentTenant?.id, userProfileId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requirements')
        .select(`
          *,
          sets:set_id (id, name, client_id, clients:client_id (id, name)),
          pitches:pitch_id (id, name)
        `)
        .eq('tenant_id', currentTenant!.id)
        .eq('is_task', true)
        .eq('assigned_to_id', userProfileId!)
        .is('deleted_at', null)
        .eq('is_template', false)
        .not('status', 'in', '("completed","cancelled")')
        .order('priority', { ascending: true })
        .order('expected_due_date', { ascending: true, nullsFirst: false })
        .limit(limit)

      if (error) throw error

      // Group by priority
      const tasks = data || []
      return {
        high: tasks.filter((t) => t.priority && t.priority <= 2),
        medium: tasks.filter((t) => t.priority && t.priority >= 3 && t.priority <= 4),
        low: tasks.filter((t) => !t.priority || t.priority >= 5),
        all: tasks,
      }
    },
    enabled: !!currentTenant?.id && !!userProfileId,
  })
}

/**
 * Build hierarchical work structure: Sets -> Pitches -> Requirements
 * with expandable state tracking
 */
export function useMyWorkHierarchy() {
  const { sets, pitches, requirements, isLoading, error } = useMyWorkGrouped()

  // Build hierarchy: Sets contain Pitches, Pitches contain Requirements
  const hierarchy: {
    sets: Array<MyWorkItem & {
      childPitches: Array<MyWorkItem & { childRequirements: MyWorkItem[] }>
      directRequirements: MyWorkItem[] // Requirements attached to Set directly (no Pitch)
    }>
    orphanPitches: Array<MyWorkItem & { childRequirements: MyWorkItem[] }> // Pitches without Set
    orphanRequirements: MyWorkItem[] // Requirements without Set or Pitch
  } = {
    sets: [],
    orphanPitches: [],
    orphanRequirements: [],
  }

  // Map requirements by pitch_id and set_id
  const reqByPitch = new Map<string, MyWorkItem[]>()
  const reqBySet = new Map<string, MyWorkItem[]>()
  const orphanReqs: MyWorkItem[] = []

  requirements.forEach((req) => {
    if (req.pitch_id) {
      if (!reqByPitch.has(req.pitch_id)) reqByPitch.set(req.pitch_id, [])
      reqByPitch.get(req.pitch_id)!.push(req)
    } else if (req.set_id) {
      if (!reqBySet.has(req.set_id)) reqBySet.set(req.set_id, [])
      reqBySet.get(req.set_id)!.push(req)
    } else {
      orphanReqs.push(req)
    }
  })

  // Map pitches by set_id
  const pitchesBySetId = new Map<string, Array<MyWorkItem & { childRequirements: MyWorkItem[] }>>()
  const orphanPitchList: Array<MyWorkItem & { childRequirements: MyWorkItem[] }> = []

  pitches.forEach((pitch) => {
    const pitchWithChildren = {
      ...pitch,
      childRequirements: reqByPitch.get(pitch.id) || [],
    }
    if (pitch.set_id) {
      if (!pitchesBySetId.has(pitch.set_id)) pitchesBySetId.set(pitch.set_id, [])
      pitchesBySetId.get(pitch.set_id)!.push(pitchWithChildren)
    } else {
      orphanPitchList.push(pitchWithChildren)
    }
  })

  // Build sets with their children
  sets.forEach((set) => {
    hierarchy.sets.push({
      ...set,
      childPitches: pitchesBySetId.get(set.id) || [],
      directRequirements: reqBySet.get(set.id) || [],
    })
  })

  hierarchy.orphanPitches = orphanPitchList
  hierarchy.orphanRequirements = orphanReqs

  // Group by priority (use parent priority for child items)
  const byPriority = {
    high: hierarchy.sets.filter((s) => s.priority && s.priority <= 2),
    medium: hierarchy.sets.filter((s) => s.priority && s.priority >= 3 && s.priority <= 4),
    low: hierarchy.sets.filter((s) => !s.priority || s.priority >= 5),
  }

  return {
    isLoading,
    error,
    hierarchy,
    byPriority,
    totalSets: sets.length,
    totalPitches: pitches.length,
    totalRequirements: requirements.length,
    totalOrphans: orphanPitchList.length + orphanReqs.length,
  }
}
