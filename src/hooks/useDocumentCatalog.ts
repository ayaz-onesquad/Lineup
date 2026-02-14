import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentCatalogApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateDocumentCatalogInput, UpdateDocumentCatalogInput } from '@/types/database'

export function useDocumentCatalog(includeInactive = false) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['document-catalog', currentTenant?.id, includeInactive],
    queryFn: () => documentCatalogApi.getAll(currentTenant!.id, includeInactive),
    enabled: !!currentTenant?.id,
  })
}

export function useDocumentCatalogById(id: string) {
  return useQuery({
    queryKey: ['document-catalog', 'item', id],
    queryFn: () => documentCatalogApi.getById(id),
    enabled: !!id,
  })
}

export function useDocumentCatalogByCategory(category: string) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['document-catalog', 'category', category, currentTenant?.id],
    queryFn: () => documentCatalogApi.getByCategory(currentTenant!.id, category),
    enabled: !!currentTenant?.id && !!category,
  })
}

export function useDocumentCatalogUsage(catalogId: string) {
  return useQuery({
    queryKey: ['document-catalog', 'usage', catalogId],
    queryFn: () => documentCatalogApi.getUsage(catalogId),
    enabled: !!catalogId,
  })
}

export function useDocumentCatalogMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createCatalogEntry = useMutation({
    mutationFn: (input: CreateDocumentCatalogInput) =>
      documentCatalogApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-catalog'] })
      toast({
        title: 'Document type created',
        description: 'The document type has been added to your catalog.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create document type',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateCatalogEntry = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateDocumentCatalogInput) =>
      documentCatalogApi.update(id, user!.id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['document-catalog'] })
      queryClient.invalidateQueries({ queryKey: ['document-catalog', 'item', variables.id] })
      toast({
        title: 'Document type updated',
        description: 'The document type has been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update document type',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deactivateCatalogEntry = useMutation({
    mutationFn: (id: string) => documentCatalogApi.deactivate(id, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-catalog'] })
      toast({
        title: 'Document type deactivated',
        description: 'The document type has been deactivated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to deactivate document type',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const activateCatalogEntry = useMutation({
    mutationFn: (id: string) => documentCatalogApi.activate(id, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-catalog'] })
      toast({
        title: 'Document type activated',
        description: 'The document type has been reactivated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to activate document type',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const seedDefaults = useMutation({
    mutationFn: () => documentCatalogApi.seedDefaults(currentTenant!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-catalog'] })
      toast({
        title: 'Default types seeded',
        description: 'Default document types have been added to your catalog.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to seed defaults',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createCatalogEntry,
    updateCatalogEntry,
    deactivateCatalogEntry,
    activateCatalogEntry,
    seedDefaults,
  }
}
