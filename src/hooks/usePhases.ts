import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { phasesApi } from '@/services/api/phases'
import { useTenant } from './useTenant'
import { useAuth } from './useAuth'
import type { EnhancedProjectPhase, CreatePhaseInput, UpdatePhaseInput } from '@/types/database'
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
  const { currentTenantId } = useTenant()

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
 * Get phase by ID
 */
export function usePhaseById(id: string) {
  return useQuery({
    queryKey: phaseKeys.detail(id),
    queryFn: () => phasesApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Get template phases
 */
export function usePhaseTemplates() {
  const { currentTenantId } = useTenant()

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
  const { currentTenantId } = useTenant()
  const { user } = useAuth()

  const createPhase = useMutation({
    mutationFn: (input: CreatePhaseInput) =>
      phasesApi.create(currentTenantId!, user!.id, input),
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: phaseKeys.byTenant(currentTenantId!) })
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(data.project_id) })
        queryClient.invalidateQueries({ queryKey: ['projects', data.project_id] })
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
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: phaseKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: phaseKeys.byTenant(currentTenantId!) })
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: phaseKeys.byProject(data.project_id) })
        queryClient.invalidateQueries({ queryKey: ['projects', data.project_id] })
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
    mutationFn: (id: string) => phasesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: phaseKeys.all })
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
