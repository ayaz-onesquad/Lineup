import { supabase } from '@/services/supabase'
import type { Document, DocumentWithUploader, EntityType } from '@/types/database'

export const documentsApi = {
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
    // Upload file to storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}/${entityType}/${entityId}/${Date.now()}.${fileExt}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, file)

    if (uploadError) throw uploadError

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
    if (doc?.file_url) {
      const path = doc.file_url.split('/').slice(-4).join('/')
      await supabase.storage.from('documents').remove([path])
    }
  },

  download: async (fileUrl: string): Promise<void> => {
    window.open(fileUrl, '_blank')
  },
}
