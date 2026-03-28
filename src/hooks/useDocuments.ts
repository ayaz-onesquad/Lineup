import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { EntityType, CreateDocumentInput, UpdateDocumentInput } from '@/types/database'

/**
 * Hook to fetch all documents for the current tenant
 */
export function useDocuments() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['documents', currentTenant?.id],
    queryFn: () => documentsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch a single document by ID
 */
export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => documentsApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Hook to fetch documents for a specific entity (by entity_type + entity_id)
 */
export function useDocumentsByEntity(entityType: EntityType | string, entityId: string) {
  return useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => documentsApi.getByEntity(entityType as EntityType, entityId),
    enabled: !!entityType && !!entityId,
  })
}

/**
 * Parent type for getByParent queries
 */
type ParentType =
  | 'client_id'
  | 'lead_id'
  | 'project_id'
  | 'phase_id'
  | 'set_id'
  | 'pitch_id'
  | 'requirement_id'

/**
 * Hook to fetch documents by a specific parent FK
 * (used when we want all docs for a project regardless of exact entity_type)
 */
export function useDocumentsByParent(parentType: ParentType, parentId: string) {
  return useQuery({
    queryKey: ['documents', parentType, parentId],
    queryFn: () => documentsApi.getByParent(parentType, parentId),
    enabled: !!parentType && !!parentId,
  })
}

/**
 * Hook for document mutations (create, update, delete)
 */
export function useDocumentMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  // Use auth.users.id (not user_profiles.id) because uploaded_by/updated_by FK references auth.users
  const { user } = useAuthStore()

  const createDocument = useMutation({
    mutationFn: async (input: CreateDocumentInput & { file?: File }) => {
      const { file, ...documentInput } = input
      let fileResult = null

      // 1. Upload file first if one was provided
      if (file) {
        fileResult = await documentsApi.uploadFile(currentTenant!.id, file)
      }

      // 2. Create the document record with file data merged in
      return documentsApi.create(currentTenant!.id, user!.id, {
        ...documentInput,
        file_url: fileResult?.file_url ?? documentInput.file_url ?? undefined,
        file_type: fileResult?.file_type ?? documentInput.file_type ?? undefined,
        file_size_bytes: fileResult?.file_size_bytes ?? documentInput.file_size_bytes ?? undefined,
      })
    },
    onSuccess: (_, variables) => {
      // Invalidate all relevant document queries
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      if (variables.entity_type && variables.entity_id) {
        queryClient.invalidateQueries({
          queryKey: ['documents', variables.entity_type, variables.entity_id],
        })
      }
      toast({
        title: 'Document saved',
        description: 'The document has been saved successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useDocuments.createDocument] Error:', error)
      toast({
        title: 'Failed to save document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateDocument = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateDocumentInput) =>
      documentsApi.update(id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({
        title: 'Document updated',
        description: 'The document has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useDocuments.updateDocument] Error:', error)
      toast({
        title: 'Failed to update document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteDocument = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast({
        title: 'Document deleted',
        description: 'The document has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useDocuments.deleteDocument] Error:', error)
      toast({
        title: 'Failed to delete document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Legacy upload mutation for backward compatibility
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

  return {
    createDocument,
    updateDocument,
    deleteDocument,
    uploadDocument,
  }
}
