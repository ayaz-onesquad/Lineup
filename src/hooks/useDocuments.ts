import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { EntityType } from '@/types/database'

export function useDocuments() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['documents', currentTenant?.id],
    queryFn: () => documentsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useDocumentsByEntity(entityType: EntityType, entityId: string) {
  return useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => documentsApi.getByEntity(entityType, entityId),
    enabled: !!entityType && !!entityId,
  })
}

export function useDocumentMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()

  const uploadDocument = useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      file,
      showInClientPortal = false,
    }: {
      entityType: EntityType
      entityId: string
      file: File
      showInClientPortal?: boolean
    }) => {
      return documentsApi.upload(
        currentTenant!.id,
        user!.id,
        entityType,
        entityId,
        file,
        showInClientPortal
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({
        queryKey: ['documents', variables.entityType, variables.entityId],
      })
      toast({ title: 'Document uploaded successfully' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateDocument = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: { name?: string; description?: string; show_in_client_portal?: boolean }
    }) => documentsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({ title: 'Document updated' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteDocument = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({ title: 'Document deleted' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    uploadDocument,
    updateDocument,
    deleteDocument,
  }
}
