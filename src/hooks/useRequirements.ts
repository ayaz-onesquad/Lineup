import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requirementsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { getUserFriendlyError } from '@/lib/utils'
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
  RequirementStatus,
} from '@/types/database'

export function useRequirements(includeTemplates = false) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['requirements', currentTenant?.id, includeTemplates],
    queryFn: () => requirementsApi.getAll(currentTenant!.id, includeTemplates),
    enabled: !!currentTenant?.id,
  })
}

export function useRequirementTemplates() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['requirements', 'templates', currentTenant?.id],
    queryFn: () => requirementsApi.getTemplates(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useRequirementsByPitch(pitchId: string) {
  return useQuery({
    queryKey: ['requirements', 'pitch', pitchId],
    queryFn: () => requirementsApi.getByPitchId(pitchId),
    enabled: !!pitchId,
  })
}

export function useRequirementsBySet(setId: string) {
  return useQuery({
    queryKey: ['requirements', 'set', setId],
    queryFn: () => requirementsApi.getBySetId(setId),
    enabled: !!setId,
  })
}

export function useRequirementsByProject(projectId: string) {
  return useQuery({
    queryKey: ['requirements', 'project', projectId],
    queryFn: () => requirementsApi.getByProjectId(projectId),
    enabled: !!projectId,
  })
}

export function useRequirementsByClient(clientId: string) {
  return useQuery({
    queryKey: ['requirements', 'client', clientId],
    queryFn: () => requirementsApi.getByClientId(clientId),
    enabled: !!clientId,
  })
}

export function useMyRequirements() {
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['requirements', 'assigned', user?.id, currentTenant?.id],
    queryFn: () => requirementsApi.getByAssignedTo(currentTenant!.id, user!.id),
    enabled: !!user?.id && !!currentTenant?.id,
  })
}

export function useMyActiveTasks() {
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  // Get user profile ID (not auth user ID)
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      const { data } = await import('@/services/supabase').then((m) =>
        m.supabase.from('user_profiles').select('id').eq('user_id', user!.id).single()
      )
      return data
    },
    enabled: !!user?.id,
  })

  return useQuery({
    queryKey: ['requirements', 'my-tasks', currentTenant?.id, userProfile?.id],
    queryFn: () => requirementsApi.getMyTasks(currentTenant!.id, userProfile!.id),
    enabled: !!currentTenant?.id && !!userProfile?.id,
  })
}

export function useRequirement(id: string) {
  return useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.getById(id),
    enabled: !!id,
  })
}

export function useRequirementMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createRequirement = useMutation({
    mutationFn: (input: CreateRequirementInput & { pitch_id?: string }) =>
      requirementsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      if (variables.pitch_id) {
        queryClient.invalidateQueries({ queryKey: ['pitches'] })
        queryClient.invalidateQueries({ queryKey: ['pitch', variables.pitch_id] })
      }
      toast({
        title: 'Requirement created',
        description: 'The requirement has been created successfully.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to create requirement',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  const updateRequirement = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateRequirementInput) =>
      requirementsApi.update(id, user!.id, input),
    onSuccess: async (_, variables) => {
      // Force immediate refetch for instant UI update
      await queryClient.refetchQueries({ queryKey: ['requirement', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Requirement updated',
        description: 'The requirement has been updated successfully.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to update requirement',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequirementStatus }) =>
      requirementsApi.updateStatus(id, user!.id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['requirement', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })

  const deleteRequirement = useMutation({
    mutationFn: requirementsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Requirement archived',
        description: 'The requirement has been archived.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to archive requirement',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  const reorderRequirements = useMutation({
    mutationFn: ({ setId, requirementIds }: { setId: string; requirementIds: string[] }) =>
      requirementsApi.reorder(setId, requirementIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })

  return {
    createRequirement,
    updateRequirement,
    updateStatus,
    deleteRequirement,
    reorderRequirements,
  }
}
