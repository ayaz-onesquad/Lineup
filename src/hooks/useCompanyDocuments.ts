import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  companyDocumentsApi,
  DownloadNotPermittedError,
} from '@/services/api/companyDocuments'
import { documentsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { toast } from '@/hooks/use-toast'
import type {
  CreateCompanyDocumentInput,
  UpdateCompanyDocumentInput,
  CompanyDocumentWithPeople,
} from '@/types/database'

const LIST_KEY = 'company-documents'
const DETAIL_KEY = 'company-document'

/** All company documents for the active tenant that the caller may read. */
export function useCompanyDocuments() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: [LIST_KEY, 'list', currentTenant?.id],
    queryFn: () => companyDocumentsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useCompanyDocument(id: string | undefined) {
  return useQuery({
    queryKey: [DETAIL_KEY, 'detail', id],
    queryFn: () => companyDocumentsApi.getById(id!),
    enabled: !!id,
  })
}

/** Documents at or past their review date, for the dashboard and reminders. */
export function useCompanyDocumentsDueForReview(withinDays = 30) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: [LIST_KEY, 'due-for-review', currentTenant?.id, withinDays],
    queryFn: () => companyDocumentsApi.getDueForReview(currentTenant!.id, withinDays),
    enabled: !!currentTenant?.id,
  })
}

export function useCompanyDocumentVersions(id: string | undefined) {
  return useQuery({
    queryKey: [DETAIL_KEY, 'versions', id],
    queryFn: () => companyDocumentsApi.getVersions(id!),
    enabled: !!id,
  })
}

export function useCompanyDocumentAccessLog(id: string | undefined) {
  return useQuery({
    queryKey: [DETAIL_KEY, 'access-log', id],
    queryFn: () => companyDocumentsApi.getAccessLog(id!),
    enabled: !!id,
  })
}

export function useCompanyDocumentAcknowledgements(id: string | undefined) {
  return useQuery({
    queryKey: [DETAIL_KEY, 'acknowledgements', id],
    queryFn: () => companyDocumentsApi.getAcknowledgements(id!),
    enabled: !!id,
  })
}

export function useCompanyDocumentMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()
  const { policy } = useSessionPolicy()

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
  }

  const createDocument = useMutation({
    mutationFn: (input: CreateCompanyDocumentInput) =>
      companyDocumentsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      invalidateList()
      toast({
        title: 'Document added',
        description: 'The company document has been saved.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompanyDocuments.create] Error:', error)
      toast({
        title: 'Failed to add document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateDocument = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateCompanyDocumentInput) =>
      companyDocumentsApi.update(id, user!.id, input),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: [DETAIL_KEY, 'detail', variables.id] })
      queryClient.invalidateQueries({ queryKey: [DETAIL_KEY, 'versions', variables.id] })
      invalidateList()
      toast({
        title: 'Document updated',
        description: 'Your changes have been saved.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompanyDocuments.update] Error:', error)
      toast({
        title: 'Failed to update document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteDocument = useMutation({
    mutationFn: (id: string) => companyDocumentsApi.delete(id, user!.id),
    onSuccess: () => {
      invalidateList()
      queryClient.invalidateQueries({ queryKey: [DETAIL_KEY] })
      toast({
        title: 'Document removed',
        description: 'The company document has been deleted.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompanyDocuments.delete] Error:', error)
      toast({
        title: 'Failed to remove document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const uploadFile = useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File
      onProgress?: (percent: number) => void
    }) => companyDocumentsApi.uploadFile(currentTenant!.id, file, onProgress),
    onError: (error: Error) => {
      console.error('[useCompanyDocuments.uploadFile] Error:', error)
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  /**
   * Downloads a document, but only when the document and the tenant policy
   * both allow it. Blocked attempts surface a clear explanation and are
   * recorded in the access log by the API layer.
   */
  const downloadDocument = useMutation({
    mutationFn: async (doc: CompanyDocumentWithPeople) => {
      const url = await companyDocumentsApi.getDownloadUrl(doc, {
        blockedByTenantPolicy: policy.block_document_download,
        ttlSeconds: policy.signed_url_ttl_seconds,
      })
      await documentsApi.downloadFile(url, doc.file_name ?? doc.title)
    },
    onError: (error: Error) => {
      const isPolicyBlock = error instanceof DownloadNotPermittedError
      toast({
        title: isPolicyBlock ? 'Download not permitted' : 'Download failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const acknowledgeDocument = useMutation({
    mutationFn: (doc: CompanyDocumentWithPeople) =>
      companyDocumentsApi.acknowledge(doc.id, doc.tenant_id, doc.version),
    onSuccess: (_data, doc) => {
      queryClient.invalidateQueries({
        queryKey: [DETAIL_KEY, 'acknowledgements', doc.id],
      })
      toast({
        title: 'Acknowledged',
        description: `You have confirmed reading version ${doc.version}.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not record acknowledgement',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createDocument,
    updateDocument,
    deleteDocument,
    uploadFile,
    downloadDocument,
    acknowledgeDocument,
  }
}
