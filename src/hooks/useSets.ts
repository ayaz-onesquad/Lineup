import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateSetInput, UpdateSetInput } from '@/types/database'

export function useSets() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['sets', currentTenant?.id],
    queryFn: () => setsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useSetsByProject(projectId: string) {
  return useQuery({
    queryKey: ['sets', 'project', projectId],
    queryFn: () => setsApi.getByProjectId(projectId),
    enabled: !!projectId,
  })
}

export function useSetsByPhase(phaseId: string) {
  return useQuery({
    queryKey: ['sets', 'phase', phaseId],
    queryFn: () => setsApi.getByPhaseId(phaseId),
    enabled: !!phaseId,
  })
}

export function useSet(id: string) {
  return useQuery({
    queryKey: ['set', id],
    queryFn: () => setsApi.getById(id),
    enabled: !!id,
  })
}

export function useSetMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createSet = useMutation({
    mutationFn: (input: CreateSetInput) =>
      setsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Set created',
        description: 'The set has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create set',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateSet = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateSetInput) =>
      setsApi.update(id, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['set', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Set updated',
        description: 'The set has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update set',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteSet = useMutation({
    mutationFn: setsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      toast({
        title: 'Set archived',
        description: 'The set has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive set',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const reorderSets = useMutation({
    mutationFn: ({ phaseId, setIds }: { phaseId: string; setIds: string[] }) =>
      setsApi.reorder(phaseId, setIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })

  return {
    createSet,
    updateSet,
    deleteSet,
    reorderSets,
  }
}
