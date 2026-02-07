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

export function useSetsByClient(clientId: string) {
  return useQuery({
    queryKey: ['sets', 'client', clientId],
    queryFn: () => setsApi.getByClientId(clientId),
    enabled: !!clientId,
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
    onSuccess: (data, variables) => {
      console.log('[useSets.createSet] Success, invalidating caches', { data, variables })
      // Invalidate all sets-related queries aggressively
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      // Invalidate specific project queries (including hierarchy view)
      if (variables.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project', variables.project_id] })
        queryClient.invalidateQueries({ queryKey: ['sets', 'project', variables.project_id] })
      }
      // Invalidate phase queries if applicable
      if (variables.phase_id) {
        queryClient.invalidateQueries({ queryKey: ['phase', variables.phase_id] })
        queryClient.invalidateQueries({ queryKey: ['sets', 'phase', variables.phase_id] })
      }
      // Invalidate all projects list queries
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Set created',
        description: 'The set has been created successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useSets.createSet] Error:', error)
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
    onSuccess: (data, variables) => {
      console.log('[useSets.updateSet] Success, invalidating caches', { data, variables })
      // Invalidate the specific set
      queryClient.invalidateQueries({ queryKey: ['set', variables.id] })
      // Invalidate all sets-related queries
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      // Invalidate project hierarchy queries (the updated set may have project_id or phase_id)
      if (data?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project', data.project_id] })
        queryClient.invalidateQueries({ queryKey: ['sets', 'project', data.project_id] })
      }
      if (data?.phase_id) {
        queryClient.invalidateQueries({ queryKey: ['phase', data.phase_id] })
        queryClient.invalidateQueries({ queryKey: ['sets', 'phase', data.phase_id] })
      }
      // Invalidate all project queries to ensure UI refreshes
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Set updated',
        description: 'The set has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useSets.updateSet] Error:', error)
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
      console.log('[useSets.deleteSet] Success, invalidating caches')
      // Invalidate all sets and project queries aggressively
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['set'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['phase'] })
      toast({
        title: 'Set archived',
        description: 'The set has been archived.',
      })
    },
    onError: (error: Error) => {
      console.error('[useSets.deleteSet] Error:', error)
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
