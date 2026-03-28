import { supabase } from '@/services/supabase'
import type {
  DocumentWithUploader,
  CreateDocumentInput,
  UpdateDocumentInput,
  EntityType,
} from '@/types/database'

// Custom error class for storage permission errors
export class StoragePermissionError extends Error {
  constructor(message: string = 'Storage access denied') {
    super(message)
    this.name = 'StoragePermissionError'
  }
}

// Custom error class for bucket not found errors (setup required)
export class StorageBucketNotFoundError extends Error {
  constructor(
    message: string = 'Storage bucket not found. The "documents" bucket must be created in Supabase Dashboard.'
  ) {
    super(message)
    this.name = 'StorageBucketNotFoundError'
  }
}

// Common select query with joins for documents
// NOTE: uploader/updater are fetched separately because uploaded_by references auth.users, not user_profiles
// Column aliases: requirements uses 'title', leads uses 'lead_name' — aliased to 'name' for consistent TS types
const DOCUMENT_SELECT = `
  *,
  client:client_id (id, name),
  lead:lead_id (id, name:lead_name),
  project:project_id (id, name),
  phase:phase_id (id, name),
  set:set_id (id, name),
  pitch:pitch_id (id, name),
  requirement:requirement_id (id, name:title)
`

// Helper to attach user profiles to a single document
async function attachProfiles<T extends { uploaded_by?: string | null; updated_by?: string | null }>(
  doc: T
): Promise<T & { uploader?: unknown; updater?: unknown }> {
  if (!doc) return doc

  const userIds = new Set<string>()
  if (doc.uploaded_by) userIds.add(doc.uploaded_by)
  if (doc.updated_by) userIds.add(doc.updated_by)

  if (userIds.size === 0) {
    return { ...doc, uploader: undefined, updater: undefined }
  }

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, user_id, full_name, avatar_url')
    .in('user_id', Array.from(userIds))

  const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]))

  return {
    ...doc,
    uploader: doc.uploaded_by ? (profileMap.get(doc.uploaded_by) ?? undefined) : undefined,
    updater: doc.updated_by ? (profileMap.get(doc.updated_by) ?? undefined) : undefined,
  }
}

// Helper to attach user profiles to multiple documents
async function attachProfilesMany<T extends { uploaded_by?: string | null; updated_by?: string | null }>(
  docs: T[]
): Promise<(T & { uploader?: unknown; updater?: unknown })[]> {
  if (docs.length === 0) return docs

  const userIds = new Set<string>()
  docs.forEach(d => {
    if (d.uploaded_by) userIds.add(d.uploaded_by)
    if (d.updated_by) userIds.add(d.updated_by)
  })

  if (userIds.size === 0) {
    return docs.map(d => ({ ...d, uploader: undefined, updater: undefined }))
  }

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, user_id, full_name, avatar_url')
    .in('user_id', Array.from(userIds))

  const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]))

  return docs.map(d => ({
    ...d,
    uploader: d.uploaded_by ? (profileMap.get(d.uploaded_by) ?? undefined) : undefined,
    updater: d.updated_by ? (profileMap.get(d.updated_by) ?? undefined) : undefined,
  }))
}

// Parent FK column names for getByParent method
type ParentType =
  | 'client_id'
  | 'lead_id'
  | 'project_id'
  | 'phase_id'
  | 'set_id'
  | 'pitch_id'
  | 'requirement_id'

export const documentsApi = {
  // Get all documents for the tenant
  getAll: async (tenantId: string): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (await attachProfilesMany(data || [])) as unknown as DocumentWithUploader[]
  },

  // Get all documents for a specific entity (by entity_type + entity_id)
  getByEntity: async (entityType: EntityType, entityId: string): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (await attachProfilesMany(data || [])) as unknown as DocumentWithUploader[]
  },

  // Get all documents by any specific parent FK
  // (used when we want all docs for a project regardless of exact entity_type)
  getByParent: async (parentType: ParentType, parentId: string): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq(parentType, parentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (await attachProfilesMany(data || [])) as unknown as DocumentWithUploader[]
  },

  // Get a single document by ID
  getById: async (id: string): Promise<DocumentWithUploader> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) throw error
    return (await attachProfiles(data)) as unknown as DocumentWithUploader
  },

  // Create a document record (call AFTER uploading file to storage if applicable)
  create: async (
    tenantId: string,
    userId: string,
    input: CreateDocumentInput
  ): Promise<DocumentWithUploader> => {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId,
        uploaded_by: userId,
        name: input.name,
        description: input.description ?? null,
        document_type: input.document_type ?? null,
        file_url: input.file_url ?? null,
        external_link: input.external_link ?? null,
        file_type: input.file_type ?? null,
        file_size_bytes: input.file_size_bytes ?? null,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        client_id: input.client_id ?? null,
        lead_id: input.lead_id ?? null,
        project_id: input.project_id ?? null,
        phase_id: input.phase_id ?? null,
        set_id: input.set_id ?? null,
        pitch_id: input.pitch_id ?? null,
        requirement_id: input.requirement_id ?? null,
        visibility: input.visibility ?? 'internal',
        show_in_client_portal: input.show_in_client_portal ?? false,
        tags: input.tags ?? [],
      })
      .select(DOCUMENT_SELECT)
      .single()

    if (error) throw error
    return (await attachProfiles(data)) as unknown as DocumentWithUploader
  },

  // Update document metadata
  // Supports both old signature (id, updates) and new signature (id, userId, input)
  update: async (
    id: string,
    userIdOrUpdates: string | UpdateDocumentInput,
    inputOrUndefined?: UpdateDocumentInput
  ): Promise<DocumentWithUploader> => {
    // Determine if using old or new signature
    const isNewSignature = typeof userIdOrUpdates === 'string' && inputOrUndefined !== undefined
    const updates = isNewSignature ? inputOrUndefined : (userIdOrUpdates as UpdateDocumentInput)
    const userId = isNewSignature ? userIdOrUpdates : undefined

    const { data, error } = await supabase
      .from('documents')
      .update({
        ...updates,
        ...(userId ? { updated_by: userId } : {}),
      })
      .eq('id', id)
      .select(DOCUMENT_SELECT)
      .single()

    if (error) throw error
    return (await attachProfiles(data)) as unknown as DocumentWithUploader
  },

  // Soft delete
  delete: async (id: string): Promise<void> => {
    // Get file URL to delete from storage
    const { data: doc } = await supabase
      .from('documents')
      .select('file_url')
      .eq('id', id)
      .single()

    // Soft delete the record
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    // Optionally delete from storage (can be done async)
    if (doc?.file_url) {
      let storagePath = doc.file_url

      // If it's a full URL, extract the storage path
      if (doc.file_url.startsWith('http')) {
        const bucketName = 'documents'
        const markers = [
          `/object/public/${bucketName}/`,
          `/object/sign/${bucketName}/`,
          `/object/authenticated/${bucketName}/`,
        ]
        for (const marker of markers) {
          const idx = doc.file_url.indexOf(marker)
          if (idx !== -1) {
            storagePath = decodeURIComponent(doc.file_url.substring(idx + marker.length))
            break
          }
        }
      }

      await supabase.storage.from('documents').remove([storagePath])
    }
  },

  // Upload file to Supabase Storage, return public/signed URL + metadata
  uploadFile: async (
    tenantId: string,
    file: File
  ): Promise<{ file_url: string; file_type: string; file_size_bytes: number }> => {
    // Sanitize filename: replace spaces with underscores
    const sanitizedName = file.name.replace(/\s+/g, '_')
    const fileName = `${tenantId}/${Date.now()}_${sanitizedName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, file)

    // Handle storage errors with specific error types
    if (uploadError) {
      const errorMessage = uploadError.message?.toLowerCase() || ''
      const statusCode = (uploadError as { statusCode?: number }).statusCode

      // Check for 404 bucket not found errors
      const isBucketNotFound =
        statusCode === 404 ||
        errorMessage.includes('404') ||
        errorMessage.includes('bucket not found') ||
        errorMessage.includes('not found')

      if (isBucketNotFound) {
        throw new StorageBucketNotFoundError(
          'Storage bucket "documents" not found. Please create the bucket in Supabase Dashboard: Storage > Create Bucket > name: "documents", public: OFF'
        )
      }

      // Check for permission/authorization errors (403)
      const isPermissionError =
        statusCode === 403 ||
        errorMessage.includes('403') ||
        errorMessage.includes('not authorized') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('policy') ||
        errorMessage.includes('row-level security')

      if (isPermissionError) {
        throw new StoragePermissionError(
          'Storage access denied. Your session may need to be refreshed. Please log out and log back in.'
        )
      }
      throw uploadError
    }

    // Store the storage PATH (not the full public URL) so getSignedUrl
    // can use it directly without URL parsing
    return {
      file_url: uploadData.path,
      file_type: file.type,
      file_size_bytes: file.size,
    }
  },

  // Legacy upload method (combines uploadFile + create for backward compat)
  upload: async (
    tenantId: string,
    userId: string,
    entityType: EntityType,
    entityId: string,
    file: File,
    showInClientPortal: boolean = false
  ): Promise<DocumentWithUploader> => {
    // Upload file to storage
    const fileData = await documentsApi.uploadFile(tenantId, file)

    // Create document record
    return documentsApi.create(tenantId, userId, {
      name: file.name,
      file_url: fileData.file_url,
      file_type: fileData.file_type,
      file_size_bytes: fileData.file_size_bytes,
      entity_type: entityType,
      entity_id: entityId,
      show_in_client_portal: showInClientPortal,
    })
  },

  // Create external link document (no file upload)
  createLink: async (
    tenantId: string,
    userId: string,
    entityType: EntityType,
    entityId: string,
    name: string,
    url: string,
    description?: string,
    showInClientPortal: boolean = false
  ): Promise<DocumentWithUploader> => {
    return documentsApi.create(tenantId, userId, {
      name,
      description,
      external_link: url,
      document_type: 'link',
      entity_type: entityType,
      entity_id: entityId,
      show_in_client_portal: showInClientPortal,
    })
  },

  download: async (fileUrl: string): Promise<void> => {
    window.open(fileUrl, '_blank')
  },

  /**
   * Get portal-visible documents for a project (for client portal)
   */
  getPortalVisible: async (projectId: string): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('show_in_client_portal', true)
      .is('deleted_at', null)
      .or(`project_id.eq.${projectId},entity_id.eq.${projectId}`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (await attachProfilesMany(data || [])) as unknown as DocumentWithUploader[]
  },

  /**
   * Get signed URL for file download (works for private storage)
   * Handles both:
   * - Old documents stored with full public URLs
   * - New documents stored with just the storage path
   */
  getSignedUrl: async (fileUrl: string): Promise<string> => {
    try {
      // Strategy 1: If it's already a relative path (no https://), use directly
      if (!fileUrl.startsWith('http')) {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(fileUrl, 3600)
        if (error) throw error
        return data.signedUrl
      }

      // Strategy 2: Extract path after the bucket name from a full URL
      // Supabase storage URLs have this structure:
      // https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
      // OR for signed: /object/sign/{bucket}/{path}
      const bucketName = 'documents'
      const markers = [
        `/object/public/${bucketName}/`,
        `/object/sign/${bucketName}/`,
        `/object/authenticated/${bucketName}/`,
      ]

      let storagePath: string | null = null
      for (const marker of markers) {
        const idx = fileUrl.indexOf(marker)
        if (idx !== -1) {
          storagePath = fileUrl.substring(idx + marker.length)
          // Decode URI components (e.g. %20 → space)
          storagePath = decodeURIComponent(storagePath)
          break
        }
      }

      if (!storagePath) {
        // Fallback: return the original URL and hope it's accessible
        console.warn('[documentsApi.getSignedUrl] Could not extract path from URL:', fileUrl)
        return fileUrl
      }

      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 3600) // 1 hour expiry

      if (error) throw error
      return data.signedUrl
    } catch (err) {
      console.error('[documentsApi.getSignedUrl] Error:', err)
      // Return original URL as fallback — better than a blank error
      return fileUrl
    }
  },
}
