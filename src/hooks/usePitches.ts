import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pitchesApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreatePitchInput, UpdatePitchInput } from '@/types/database'

export function usePitches(includeTemplates = false) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['pitches', currentTenant?.id, includeTemplates],
    queryFn: () => pitchesApi.getAll(currentTenant!.id, includeTemplates),
    enabled: !!currentTenant?.id,
  })
}

export function usePitchesBySet(setId: string, includeTemplates = false) {
  return useQuery({
    queryKey: ['pitches', 'set', setId, includeTemplates],
    queryFn: () => pitchesApi.getBySetId(setId, includeTemplates),
    enabled: !!setId,
  })
}

export function usePitchesByClient(clientId: string, includeTemplates = false) {
  return useQuery({
    queryKey: ['pitches', 'client', clientId, includeTemplates],
    queryFn: () => pitchesApi.getByClientId(clientId, includeTemplates),
    enabled: !!clientId,
  })
}

export function usePitchesByProject(projectId: string, includeTemplates = false) {
  return useQuery({
    queryKey: ['pitches', 'project', projectId, includeTemplates],
    queryFn: () => pitchesApi.getByProjectId(projectId, includeTemplates),
    enabled: !!projectId,
  })
}

export function usePitchesByPhase(phaseId: string, includeTemplates = false) {
  return useQuery({
    queryKey: ['pitches', 'phase', phaseId, includeTemplates],
    queryFn: () => pitchesApi.getByPhaseId(phaseId, includeTemplates),
    enabled: !!phaseId,
  })
}

export function usePitch(id: string) {
  return useQuery({
    queryKey: ['pitch', id],
    queryFn: () => pitchesApi.getById(id),
    enabled: !!id,
  })
}

export function usePitchTemplates() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['pitches', 'templates', currentTenant?.id],
    queryFn: () => pitchesApi.getTemplates(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function usePitchMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createPitch = useMutation({
    mutationFn: (input: CreatePitchInput) =>
      pitchesApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
      if (variables.set_id) {
        queryClient.invalidateQueries({ queryKey: ['pitches', 'set', variables.set_id] })
        queryClient.invalidateQueries({ queryKey: ['set', variables.set_id] })
      }
      toast({
        title: 'Pitch created',
        description: 'The pitch has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create pitch',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updatePitch = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdatePitchInput) =>
      pitchesApi.update(id, user!.id, input),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ['pitch', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
      toast({
        title: 'Pitch updated',
        description: 'The pitch has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update pitch',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deletePitch = useMutation({
    mutationFn: pitchesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
      queryClient.invalidateQueries({ queryKey: ['pitch'] })
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      toast({
        title: 'Pitch archived',
        description: 'The pitch has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive pitch',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const reorderPitches = useMutation({
    mutationFn: ({ setId, pitchIds }: { setId: string; pitchIds: string[] }) =>
      pitchesApi.reorder(setId, pitchIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitches', 'set', variables.setId] })
    },
  })

  const approvePitch = useMutation({
    mutationFn: ({ id, approvedById }: { id: string; approvedById: string }) =>
      pitchesApi.approve(id, user!.id, approvedById),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ['pitch', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
      toast({
        title: 'Pitch approved',
        description: 'The pitch has been marked as approved.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to approve pitch',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const rejectPitch = useMutation({
    mutationFn: (id: string) => pitchesApi.reject(id, user!.id),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ['pitch', variables] })
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
      toast({
        title: 'Pitch rejected',
        description: 'The pitch approval has been removed.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reject pitch',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateCompletionPercentage = useMutation({
    mutationFn: pitchesApi.updateCompletionPercentage,
    onSuccess: (_data, pitchId) => {
      queryClient.invalidateQueries({ queryKey: ['pitch', pitchId] })
      queryClient.invalidateQueries({ queryKey: ['pitches'] })
    },
  })

  return {
    createPitch,
    updatePitch,
    deletePitch,
    reorderPitches,
    approvePitch,
    rejectPitch,
    updateCompletionPercentage,
  }
}
