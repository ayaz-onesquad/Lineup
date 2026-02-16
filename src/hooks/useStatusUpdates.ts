import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { statusUpdatesApi } from '@/services/api/statusUpdates'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type {
  CreateStatusUpdateInput,
  StatusUpdateEntityType,
} from '@/types/database'

/**
 * Get status updates for a specific entity (project, phase, set, or requirement)
 */
export function useEntityStatusUpdates(
  entityType: StatusUpdateEntityType,
  entityId: string,
  includeInternalOnly: boolean = true
) {
  return useQuery({
    queryKey: ['status-updates', entityType, entityId, includeInternalOnly],
    queryFn: () =>
      statusUpdatesApi.getByEntity(entityType, entityId, includeInternalOnly),
    enabled: !!entityType && !!entityId,
  })
}

/**
 * Get recent status updates for tenant
 */
export function useRecentStatusUpdates(limit?: number) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['status-updates', 'recent', currentTenant?.id, limit],
    queryFn: () => statusUpdatesApi.getRecent(currentTenant!.id, limit),
    enabled: !!currentTenant?.id,
  })
}

/**
 * CRUD mutations for status updates
 */
export function useStatusUpdateMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createStatusUpdate = useMutation({
    mutationFn: (input: CreateStatusUpdateInput) =>
      statusUpdatesApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_, variables) => {
      // Invalidate status updates for this entity
      queryClient.invalidateQueries({
        queryKey: ['status-updates', variables.entity_type, variables.entity_id],
      })
      // Invalidate recent status updates
      queryClient.invalidateQueries({ queryKey: ['status-updates', 'recent'] })

      toast({
        title: 'Status update posted',
        description: 'Your update has been published.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to post update',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createStatusUpdate,
  }
}
