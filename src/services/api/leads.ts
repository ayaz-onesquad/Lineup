import { supabase } from '@/services/supabase'
import type {
  Lead,
  LeadWithRelations,
  CreateLeadInput,
  UpdateLeadInput,
  LeadContact,
  LeadContactWithRelations,
  LinkLeadContactInput,
  ConvertLeadOptions,
} from '@/types/database'

// Helper to validate UUID format
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Helper to clean input - convert empty strings to null for UUID fields
function cleanUUIDFields<T>(input: T, fields: string[]): T {
  const cleaned = { ...input } as Record<string, unknown>
  for (const field of fields) {
    const value = cleaned[field]
    if (value === '' || value === undefined) {
      cleaned[field] = null
    } else if (typeof value === 'string' && !isValidUUID(value)) {
      cleaned[field] = null
    }
  }
  return cleaned as T
}

const LEAD_SELECT = `
  *,
  lead_owner:lead_owner_id (id, full_name, avatar_url),
  converted_to_client:converted_to_client_id (id, name),
  lead_contacts (
    id, is_primary, is_decision_maker, role_at_lead,
    contacts (id, first_name, last_name, email, phone)
  )
`

export const leadsApi = {
  /**
   * Get all leads for tenant
   */
  getAll: async (tenantId: string): Promise<LeadWithRelations[]> => {
    console.log('[LeadsAPI] Fetching leads for tenant:', tenantId)
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[LeadsAPI] Supabase error:', error.code, error.message, error.details)
      throw error
    }
    console.log('[LeadsAPI] Fetched', data?.length || 0, 'leads')
    return data || []
  },

  /**
   * Get leads by status (for pipeline view)
   */
  getByStatus: async (
    tenantId: string,
    status: string
  ): Promise<LeadWithRelations[]> => {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('tenant_id', tenantId)
      .eq('status', status)
      .is('deleted_at', null)
      .order('estimated_close_date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get leads by owner
   */
  getByOwner: async (ownerId: string): Promise<LeadWithRelations[]> => {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('lead_owner_id', ownerId)
      .is('deleted_at', null)
      .order('estimated_close_date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get lead by ID
   */
  getById: async (id: string): Promise<LeadWithRelations | null> => {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Get pipeline statistics
   */
  getPipelineStats: async (
    tenantId: string
  ): Promise<{
    totalValue: number
    wonValue: number
    lostValue: number
    conversionRate: number
    byStatus: Record<string, { count: number; value: number }>
  }> => {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('status, estimated_value')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)

    if (error) throw error

    const stats = {
      totalValue: 0,
      wonValue: 0,
      lostValue: 0,
      conversionRate: 0,
      byStatus: {} as Record<string, { count: number; value: number }>,
    }

    let wonCount = 0
    let closedCount = 0

    for (const lead of leads || []) {
      const value = lead.estimated_value || 0

      if (!stats.byStatus[lead.status]) {
        stats.byStatus[lead.status] = { count: 0, value: 0 }
      }
      stats.byStatus[lead.status].count++
      stats.byStatus[lead.status].value += value

      if (lead.status !== 'won' && lead.status !== 'lost') {
        stats.totalValue += value
      }

      if (lead.status === 'won') {
        stats.wonValue += value
        wonCount++
        closedCount++
      } else if (lead.status === 'lost') {
        stats.lostValue += value
        closedCount++
      }
    }

    stats.conversionRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0

    return stats
  },

  /**
   * Create a new lead
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateLeadInput
  ): Promise<Lead> => {
    const cleanedInput = cleanUUIDFields(input, ['lead_owner_id'])

    const { data, error } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        status: cleanedInput.status || 'new',
        ...cleanedInput,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a lead
   */
  update: async (id: string, userId: string, input: UpdateLeadInput): Promise<Lead> => {
    const cleanedInput = cleanUUIDFields(input, ['lead_owner_id'])

    const { data, error } = await supabase
      .from('leads')
      .update({
        ...cleanedInput,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update lead status (with validation)
   */
  updateStatus: async (
    id: string,
    userId: string,
    status: string,
    additionalData?: { lost_reason?: string; lost_reason_notes?: string }
  ): Promise<Lead> => {
    // Validate status transitions
    if (status === 'lost' && !additionalData?.lost_reason) {
      throw new Error('Lost reason is required when marking a lead as lost')
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_by: userId,
    }

    if (status === 'lost' && additionalData) {
      updateData.lost_reason = additionalData.lost_reason
      updateData.lost_reason_notes = additionalData.lost_reason_notes
    }

    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Convert lead to client (calls stored procedure)
   */
  convertToClient: async (
    leadId: string,
    options: ConvertLeadOptions = {}
  ): Promise<{ lead_id: string; client_id: string; success: boolean }> => {
    const { data, error } = await supabase.rpc('convert_lead_to_client', {
      p_lead_id: leadId,
      p_client_name: options.client_name || null,
      p_relationship_manager_id: options.relationship_manager_id || null,
      p_copy_contacts: options.copy_contacts ?? true,
      p_copy_documents: options.copy_documents ?? true,
    })

    if (error) throw error
    return data
  },

  /**
   * Soft delete a lead
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  // ============================================================================
  // Lead Contacts
  // ============================================================================

  /**
   * Get contacts for a lead
   */
  getContacts: async (leadId: string): Promise<LeadContactWithRelations[]> => {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select(`
        *,
        contacts (id, first_name, last_name, email, phone, role)
      `)
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('is_decision_maker', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Link a contact to a lead
   */
  linkContact: async (
    tenantId: string,
    userId: string,
    input: LinkLeadContactInput
  ): Promise<LeadContact> => {
    const { data, error } = await supabase
      .from('lead_contacts')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        is_primary: input.is_primary ?? false,
        is_decision_maker: input.is_decision_maker ?? false,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a lead contact relationship
   */
  updateContact: async (
    id: string,
    userId: string,
    input: Partial<LinkLeadContactInput>
  ): Promise<LeadContact> => {
    const { data, error } = await supabase
      .from('lead_contacts')
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
   * Remove a contact from a lead (soft delete)
   */
  unlinkContact: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('lead_contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Set a contact as primary for a lead
   */
  setPrimaryContact: async (leadId: string, contactId: string): Promise<void> => {
    // First, unset any existing primary
    await supabase
      .from('lead_contacts')
      .update({ is_primary: false })
      .eq('lead_id', leadId)
      .eq('is_primary', true)

    // Then set the new primary
    const { error } = await supabase
      .from('lead_contacts')
      .update({ is_primary: true })
      .eq('lead_id', leadId)
      .eq('contact_id', contactId)

    if (error) throw error
  },
}
