import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { phasesApi } from '@/services/api/phases'
import { useTenant } from './useTenant'
import { useAuth } from './useAuth'
import type { CreatePhaseInput, UpdatePhaseInput } from '@/types/database'
import { toast } from './use-toast'

// Query keys
const phaseKeys = {
  all: ['phases'] as const,
  byTenant: (tenantId: string) => [...phaseKeys.all, tenantId] as const,
  byProject: (projectId: string) => [...phaseKeys.all, 'project', projectId] as const,
  detail: (id: string) => [...phaseKeys.all, id] as const,
  templates: (tenantId: string) => [...phaseKeys.all, 'templates', tenantId] as const,
}

/**
 * Get all phases for current tenant
 */
export function usePhases(includeTemplates = false) {
  const { currentTenant } = useTenant()
  const currentTenantId = currentTenant?.id

  return useQuery({
    queryKey: [...phaseKeys.byTenant(currentTenantId || ''), includeTemplates],
    queryFn: () => phasesApi.getAll(currentTenantId!, includeTemplates),
    enabled: !!currentTenantId,
  })
}

/**
 * Get phases by project ID
 */
export function usePhasesByProject(projectId: string, includeTemplates = false) {
  return useQuery({
    queryKey: [...phaseKeys.byProject(projectId), includeTemplates],
    queryFn: () => phasesApi.getByProjectId(projectId, includeTemplates),
    enabled: !!projectId,
  })
}

/**
 * Get phases by client ID (via projects)
 */
export function usePhasesByClient(clientId: string | undefined, includeTemplates = false) {
  return useQuery({
    queryKey: ['phases', 'client', clientId, includeTemplates],
    queryFn: () => phasesApi.getByClient(clientId!, includeTemplates),
    enabled: !!clientId,
  })
}

/**
 * Get phase by ID with tenant security
 */
export function usePhaseById(id: string) {
  const { currentTenant } = useTenant()
  const currentTenantId = currentTenant?.id

  return useQuery({
    queryKey: phaseKeys.detail(id),
    queryFn: () => phasesApi.getById(id, currentTenantId),
    enabled: !!id && !!currentTenantId,
  })
}

/**
 * Get template phases
 */
export function usePhaseTemplates() {
  const { currentTenant } = useTenant()
  const currentTenantId = currentTenant?.id

  return useQuery({
    queryKey: phaseKeys.templates(currentTenantId || ''),
    queryFn: () => phasesApi.getTemplates(currentTenantId!),
    enabled: !!currentTenantId,
  })
}

/**
 * Phase mutations (create, update, delete, reorder)
 */
export function usePhaseMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenant()
  const currentTenantId = currentTenant?.id
  const { user } = useAuth()

  const createPhase = useMutation({
    mutationFn: (input: CreatePhaseInput) =>
      phasesApi.create(currentTenantId!, user!.id, input),
    onSuccess: (data) => {
      console.log('[createPhase] onSuccess called with data:', data)
      console.log('[createPhase] project_id:', data.project_id)
      // Invalidate all phases queries to refresh any list view
      queryClient.invalidateQueries({ queryKey: phaseKeys.all })
      // Invalidate project-specific cache
      if (data.project_id) {
        console.log('[createPhase] Invalidating project hierarchy:', ['project', data.project_id, 'hierarchy'])
        queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(data.project_id) })
        // Invalidate the project hierarchy query (used by ProjectDetailPage)
        queryClient.invalidateQueries({ queryKey: ['project', data.project_id, 'hierarchy'] })
      } else {
        console.warn('[createPhase] No project_id in response!')
      }
      toast({
        title: 'Phase created',
        description: `"${data.name}" has been created successfully.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating phase',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updatePhase = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePhaseInput }) =>
      phasesApi.update(id, user!.id, data),
    onSuccess: (data, variables) => {
      // Immediately update cache with mutation response for instant UI update
      queryClient.setQueryData(
        phaseKeys.detail(variables.id),
        (oldData: Record<string, unknown> | undefined) => oldData ? { ...oldData, ...data } : data
      )
      // Invalidate to refetch enriched data in background
      queryClient.invalidateQueries({ queryKey: phaseKeys.detail(variables.id) })
      // Invalidate all phases list queries
      queryClient.invalidateQueries({ queryKey: phaseKeys.all })
      // Invalidate project-specific cache
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(data.project_id) })
        // Invalidate the project hierarchy query (used by ProjectDetailPage)
        queryClient.invalidateQueries({ queryKey: ['project', data.project_id, 'hierarchy'] })
      }
      toast({
        title: 'Phase updated',
        description: `"${data.name}" has been updated successfully.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating phase',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deletePhase = useMutation({
    mutationFn: ({ id }: { id: string; projectId?: string }) => phasesApi.delete(id),
    onSuccess: (_, variables) => {
      // Invalidate all phase queries (prefix match)
      queryClient.invalidateQueries({ queryKey: phaseKeys.all })
      // Invalidate the project-specific cache if projectId was provided
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(variables.projectId) })
        // Invalidate the project hierarchy query (used by ProjectDetailPage)
        queryClient.invalidateQueries({ queryKey: ['project', variables.projectId, 'hierarchy'] })
      }
      toast({
        title: 'Phase deleted',
        description: 'The phase has been deleted successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting phase',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const reorderPhases = useMutation({
    mutationFn: ({ projectId, phaseIds }: { projectId: string; phaseIds: string[] }) =>
      phasesApi.reorder(projectId, phaseIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: phaseKeys.byTenant(currentTenantId!) })
      // Invalidate the project hierarchy query (used by ProjectDetailPage)
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId, 'hierarchy'] })
      toast({
        title: 'Phases reordered',
        description: 'Phase order has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error reordering phases',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
  }
}
