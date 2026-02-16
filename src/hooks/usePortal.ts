import { useQuery } from '@tanstack/react-query'
import { setsApi } from '@/services/api/sets'
import { requirementsApi } from '@/services/api/requirements'
import { documentsApi } from '@/services/api/documents'
import { statusUpdatesApi } from '@/services/api/statusUpdates'

/**
 * Hook to fetch portal-visible sets for a project
 */
export function usePortalSets(projectId: string) {
  return useQuery({
    queryKey: ['portal', 'sets', projectId],
    queryFn: () => setsApi.getPortalVisible(projectId),
    enabled: !!projectId,
  })
}

/**
 * Hook to fetch portal-visible requirements for a project
 */
export function usePortalRequirements(projectId: string) {
  return useQuery({
    queryKey: ['portal', 'requirements', projectId],
    queryFn: () => requirementsApi.getPortalVisible(projectId),
    enabled: !!projectId,
  })
}

/**
 * Hook to fetch portal-visible documents for a project
 */
export function usePortalDocuments(projectId: string) {
  return useQuery({
    queryKey: ['portal', 'documents', projectId],
    queryFn: () => documentsApi.getPortalVisible(projectId),
    enabled: !!projectId,
  })
}

/**
 * Hook to fetch client-visible status updates for a project
 */
export function usePortalStatusUpdates(projectId: string) {
  return useQuery({
    queryKey: ['portal', 'status-updates', projectId],
    queryFn: () => statusUpdatesApi.getClientVisible(projectId),
    enabled: !!projectId,
  })
}
