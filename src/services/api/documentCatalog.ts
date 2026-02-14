import { supabase } from '@/services/supabase'
import type {
  DocumentCatalog,
  CreateDocumentCatalogInput,
  UpdateDocumentCatalogInput,
} from '@/types/database'

export const documentCatalogApi = {
  /**
   * Get all document catalog entries for tenant (active only by default)
   */
  getAll: async (tenantId: string, includeInactive = false): Promise<DocumentCatalog[]> => {
    let query = supabase
      .from('document_catalog')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  /**
   * Get catalog entry by ID
   */
  getById: async (id: string): Promise<DocumentCatalog | null> => {
    const { data, error } = await supabase
      .from('document_catalog')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Get catalog entries by category
   */
  getByCategory: async (
    tenantId: string,
    category: string
  ): Promise<DocumentCatalog[]> => {
    const { data, error } = await supabase
      .from('document_catalog')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('category', category)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Get usage statistics for a catalog entry
   */
  getUsage: async (catalogId: string): Promise<{ count: number; documents: unknown[] }> => {
    const { data: catalog, error: catalogError } = await supabase
      .from('document_catalog')
      .select('usage_count')
      .eq('id', catalogId)
      .single()

    if (catalogError) throw catalogError

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, name, entity_type, entity_id, created_at')
      .eq('document_catalog_id', catalogId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)

    if (docsError) throw docsError

    return {
      count: catalog?.usage_count || 0,
      documents: documents || [],
    }
  },

  /**
   * Create a new catalog entry
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateDocumentCatalogInput
  ): Promise<DocumentCatalog> => {
    const { data, error } = await supabase
      .from('document_catalog')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        is_active: true,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a catalog entry
   */
  update: async (
    id: string,
    userId: string,
    input: UpdateDocumentCatalogInput
  ): Promise<DocumentCatalog> => {
    const { data, error } = await supabase
      .from('document_catalog')
      .update({
        ...input,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Deactivate a catalog entry (cannot delete if usage_count > 0)
   */
  deactivate: async (id: string, userId: string): Promise<void> => {
    // Check usage count first
    const { data: catalog, error: checkError } = await supabase
      .from('document_catalog')
      .select('usage_count')
      .eq('id', id)
      .single()

    if (checkError) throw checkError

    if (catalog?.usage_count > 0) {
      // Cannot delete - deactivate instead
      const { error } = await supabase
        .from('document_catalog')
        .update({ is_active: false, updated_by: userId })
        .eq('id', id)

      if (error) throw error
    } else {
      // Can safely soft delete
      const { error } = await supabase
        .from('document_catalog')
        .update({ deleted_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)

      if (error) throw error
    }
  },

  /**
   * Reactivate a catalog entry
   */
  activate: async (id: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('document_catalog')
      .update({ is_active: true, updated_by: userId })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Seed default catalog entries for a new tenant
   */
  seedDefaults: async (tenantId: string): Promise<void> => {
    const { error } = await supabase.rpc('seed_document_catalog_for_tenant', {
      p_tenant_id: tenantId,
    })

    if (error) throw error
  },
}
