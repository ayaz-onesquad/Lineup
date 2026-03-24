import { supabase } from '@/services/supabase'
import type {
  FinancialGroup,
  CreateFinancialGroupInput,
  UpdateFinancialGroupInput,
  FinancialEntry,
  CreateFinancialEntryInput,
  UpdateFinancialEntryInput,
  FinancialOccurrence,
  CreateFinancialOccurrenceInput,
  UpdateFinancialOccurrenceInput,
} from '@/types/database'

// ============================================================================
// FINANCIAL GROUPS API
// ============================================================================

export const financialGroupsApi = {
  /**
   * Get all financial groups for tenant (org_admin only via RLS)
   */
  getAll: async (tenantId: string): Promise<FinancialGroup[]> => {
    const { data, error } = await supabase
      .from('financial_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Create a new financial group
   */
  create: async (
    tenantId: string,
    userProfileId: string,
    input: CreateFinancialGroupInput
  ): Promise<FinancialGroup> => {
    const { data, error } = await supabase
      .from('financial_groups')
      .insert({
        tenant_id: tenantId,
        created_by: userProfileId,
        updated_by: userProfileId,
        name: input.name,
        type: input.type,
        color: input.color || null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update an existing financial group
   */
  update: async (
    id: string,
    userProfileId: string,
    input: UpdateFinancialGroupInput
  ): Promise<FinancialGroup> => {
    const updateData: Record<string, unknown> = {
      updated_by: userProfileId,
    }

    if (input.name !== undefined) updateData.name = input.name
    if (input.type !== undefined) updateData.type = input.type
    if (input.color !== undefined) updateData.color = input.color || null

    const { data, error } = await supabase
      .from('financial_groups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a financial group
   * Note: Entries using this group will have group_id set to NULL (handled by FK)
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('financial_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },
}

// ============================================================================
// FINANCIAL ENTRIES API
// ============================================================================

export const financialEntriesApi = {
  /**
   * Get all financial entries for tenant with group and client joins
   */
  getAll: async (tenantId: string): Promise<FinancialEntry[]> => {
    const { data, error } = await supabase
      .from('financial_entries')
      .select(`
        *,
        group:financial_groups(id, name, type, color),
        client:clients!financial_entries_client_id_fkey(id, name)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) throw error
    if (!data) return []

    // Fetch creator/updater profiles
    const userIds = new Set<string>()
    data.forEach((entry) => {
      if (entry.created_by) userIds.add(entry.created_by)
      if (entry.updated_by) userIds.add(entry.updated_by)
    })

    let profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url')
        .in('id', Array.from(userIds))

      if (profiles) {
        profileMap = new Map(profiles.map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))
      }
    }

    return data.map((entry) => ({
      ...entry,
      creator: entry.created_by ? profileMap.get(entry.created_by) || null : null,
      updater: entry.updated_by ? profileMap.get(entry.updated_by) || null : null,
    }))
  },

  /**
   * Get single financial entry by ID with group, client, and occurrences
   */
  getById: async (id: string): Promise<FinancialEntry | null> => {
    const { data: entry, error } = await supabase
      .from('financial_entries')
      .select(`
        *,
        group:financial_groups(id, name, type, color),
        client:clients!financial_entries_client_id_fkey(id, name),
        occurrences:financial_occurrences(*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!entry) return null

    // Sort occurrences by due_date ASC
    if (entry.occurrences) {
      entry.occurrences = (entry.occurrences as FinancialOccurrence[])
        .filter((o) => o.deleted_at === null)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
    }

    // Fetch creator/updater profiles
    const userIds = new Set<string>()
    if (entry.created_by) userIds.add(entry.created_by)
    if (entry.updated_by) userIds.add(entry.updated_by)

    let profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url')
        .in('id', Array.from(userIds))

      if (profiles) {
        profileMap = new Map(profiles.map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))
      }
    }

    return {
      ...entry,
      creator: entry.created_by ? profileMap.get(entry.created_by) || null : null,
      updater: entry.updated_by ? profileMap.get(entry.updated_by) || null : null,
    }
  },

  /**
   * Create a new financial entry
   */
  create: async (
    tenantId: string,
    userProfileId: string,
    input: CreateFinancialEntryInput
  ): Promise<FinancialEntry> => {
    const { data, error } = await supabase
      .from('financial_entries')
      .insert({
        tenant_id: tenantId,
        created_by: userProfileId,
        updated_by: userProfileId,
        type: input.type,
        group_id: input.group_id || null,
        name: input.name,
        description: input.description || null,
        amount: input.amount,
        currency: input.currency || 'USD',
        is_recurring: input.is_recurring,
        frequency: input.frequency || null,
        recurrence_day: input.recurrence_day || null,
        start_date: input.start_date,
        end_date: input.end_date || null,
        client_id: input.client_id || null,
        vendor: input.vendor || null,
        reference_number: input.reference_number || null,
      })
      .select(`
        *,
        group:financial_groups(id, name, type, color),
        client:clients!financial_entries_client_id_fkey(id, name)
      `)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update an existing financial entry
   */
  update: async (
    id: string,
    userProfileId: string,
    input: UpdateFinancialEntryInput
  ): Promise<FinancialEntry> => {
    const updateData: Record<string, unknown> = {
      updated_by: userProfileId,
    }

    if (input.type !== undefined) updateData.type = input.type
    if (input.group_id !== undefined) updateData.group_id = input.group_id || null
    if (input.name !== undefined) updateData.name = input.name
    if (input.description !== undefined) updateData.description = input.description || null
    if (input.amount !== undefined) updateData.amount = input.amount
    if (input.currency !== undefined) updateData.currency = input.currency
    if (input.is_recurring !== undefined) updateData.is_recurring = input.is_recurring
    if (input.frequency !== undefined) updateData.frequency = input.frequency || null
    if (input.recurrence_day !== undefined) updateData.recurrence_day = input.recurrence_day || null
    if (input.start_date !== undefined) updateData.start_date = input.start_date
    if (input.end_date !== undefined) updateData.end_date = input.end_date || null
    if (input.client_id !== undefined) updateData.client_id = input.client_id || null
    if (input.vendor !== undefined) updateData.vendor = input.vendor || null
    if (input.reference_number !== undefined) updateData.reference_number = input.reference_number || null

    const { data, error } = await supabase
      .from('financial_entries')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        group:financial_groups(id, name, type, color),
        client:clients!financial_entries_client_id_fkey(id, name)
      `)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a financial entry
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('financial_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },
}

// ============================================================================
// FINANCIAL OCCURRENCES API
// ============================================================================

export const financialOccurrencesApi = {
  /**
   * Get all occurrences for a specific entry
   */
  getByEntry: async (entryId: string): Promise<FinancialOccurrence[]> => {
    const { data, error } = await supabase
      .from('financial_occurrences')
      .select('*')
      .eq('entry_id', entryId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Upsert batch of occurrences
   * Uses (entry_id, due_date) unique constraint to avoid duplicates
   * Only inserts pending occurrences - never overwrites paid/received ones
   */
  upsertBatch: async (
    tenantId: string,
    occurrences: CreateFinancialOccurrenceInput[]
  ): Promise<void> => {
    if (occurrences.length === 0) return

    // Add tenant_id to each occurrence
    const occurrencesWithTenant = occurrences.map((o) => ({
      tenant_id: tenantId,
      entry_id: o.entry_id,
      due_date: o.due_date,
      amount: o.amount,
      currency: o.currency || 'USD',
      status: o.status || 'pending',
    }))

    // Use upsert with ignoreDuplicates to preserve existing paid/received occurrences
    const { error } = await supabase
      .from('financial_occurrences')
      .upsert(occurrencesWithTenant, {
        onConflict: 'entry_id,due_date',
        ignoreDuplicates: true,
      })

    if (error) throw error
  },

  /**
   * Update a single occurrence's status
   */
  updateStatus: async (
    id: string,
    input: UpdateFinancialOccurrenceInput
  ): Promise<FinancialOccurrence> => {
    const updateData: Record<string, unknown> = {}

    if (input.status !== undefined) updateData.status = input.status
    if (input.paid_date !== undefined) updateData.paid_date = input.paid_date
    if (input.amount !== undefined) updateData.amount = input.amount
    if (input.notes !== undefined) updateData.notes = input.notes || null

    const { data, error } = await supabase
      .from('financial_occurrences')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete a single occurrence
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('financial_occurrences')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },
}
