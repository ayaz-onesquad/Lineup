import { supabase } from '@/services/supabase'
import type { Document, DocumentWithUploader, EntityType } from '@/types/database'

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

export const documentsApi = {
  // Get all documents for the tenant
  getAll: async (tenantId: string): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getByEntity: async (
    entityType: EntityType,
    entityId: string
  ): Promise<DocumentWithUploader[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  upload: async (
    tenantId: string,
    userId: string,
    entityType: EntityType,
    entityId: string,
    file: File,
    showInClientPortal: boolean = false
  ): Promise<Document> => {
    // Upload file to storage with tenant-based path
    // Path format: {tenantId}/{userId}/{entityType}/{entityId}/{timestamp}.{ext}
    // This enables tenant-level RLS on storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${tenantId}/${userId}/${entityType}/${entityId}/${Date.now()}.${fileExt}`

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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(uploadData.path)

    // Create document record
    const { data, error } = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId,
        name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size_bytes: file.size,
        entity_type: entityType,
        entity_id: entityId,
        show_in_client_portal: showInClientPortal,
        uploaded_by: userId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (
    id: string,
    updates: { name?: string; description?: string; show_in_client_portal?: boolean }
  ): Promise<Document> => {
    const { data, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

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
    // Path format: {tenantId}/{userId}/{entityType}/{entityId}/{filename} (5 segments)
    if (doc?.file_url) {
      const path = doc.file_url.split('/').slice(-5).join('/')
      await supabase.storage.from('documents').remove([path])
    }
  },

  download: async (fileUrl: string): Promise<void> => {
    window.open(fileUrl, '_blank')
  },
}
