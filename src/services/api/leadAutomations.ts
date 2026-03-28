import { supabase } from '@/services/supabase'

// Types
export interface LeadAutomation {
  id: string
  tenant_id: string
  display_id: number
  name: string
  description: string | null
  search_query: string
  location: string
  max_leads: number
  filter_no_website: boolean | null
  filter_website_required: boolean | null
  filter_min_rating: number | null
  filter_category: string | null
  frequency: 'manual' | 'daily' | 'weekly' | 'monthly'
  next_run_at: string | null
  last_run_at: string | null
  is_active: boolean
  total_leads_generated: number
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface AutomationRun {
  id: string
  tenant_id: string
  automation_id: string
  trigger_type: 'manual' | 'scheduled'
  triggered_by: string | null
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'failed' | 'partial'
  leads_found: number
  leads_created: number
  leads_skipped: number
  error_message: string | null
  apify_run_id: string | null
  raw_response: unknown
}

export interface CreateLeadAutomationInput {
  name: string
  description?: string | null
  search_query: string
  location: string
  max_leads?: number
  filter_no_website?: boolean | null
  filter_website_required?: boolean | null
  filter_min_rating?: number | null
  filter_category?: string | null
  frequency?: 'manual' | 'daily' | 'weekly' | 'monthly'
  is_active?: boolean
}

export interface UpdateLeadAutomationInput {
  name?: string
  description?: string | null
  search_query?: string
  location?: string
  max_leads?: number
  filter_no_website?: boolean | null
  filter_website_required?: boolean | null
  filter_min_rating?: number | null
  filter_category?: string | null
  frequency?: 'manual' | 'daily' | 'weekly' | 'monthly'
  is_active?: boolean
}

// Helper to calculate next_run_at based on frequency
function calculateNextRunAt(frequency: string): string | null {
  if (frequency === 'manual') return null

  const now = Date.now()
  switch (frequency) {
    case 'daily':
      return new Date(now + 24 * 60 * 60 * 1000).toISOString()
    case 'weekly':
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
    case 'monthly':
      return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
    default:
      return null
  }
}

export const leadAutomationsApi = {
  /**
   * Get all lead automations for tenant
   */
  getAll: async (tenantId: string): Promise<LeadAutomation[]> => {
    if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
      console.warn('[LeadAutomationsAPI] No valid tenant ID provided')
      return []
    }

    const { data, error } = await supabase
      .from('lead_automations')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get automation by ID
   */
  getById: async (id: string): Promise<LeadAutomation | null> => {
    const { data, error } = await supabase
      .from('lead_automations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Create a new lead automation
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateLeadAutomationInput
  ): Promise<LeadAutomation> => {
    // Calculate next_run_at based on frequency
    const frequency = input.frequency || 'manual'
    const nextRunAt = calculateNextRunAt(frequency)

    const insertPayload = {
      tenant_id: tenantId,
      created_by: userId,
      name: input.name,
      description: input.description || null,
      search_query: input.search_query,
      location: input.location,
      max_leads: input.max_leads || 20,
      filter_no_website: input.filter_no_website ?? true,
      filter_website_required: input.filter_website_required ?? false,
      filter_min_rating: input.filter_min_rating || null,
      filter_category: input.filter_category || null,
      frequency,
      next_run_at: nextRunAt,
      is_active: input.is_active ?? true,
    }

    const { data, error } = await supabase
      .from('lead_automations')
      .insert(insertPayload)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a lead automation
   */
  update: async (
    id: string,
    userId: string,
    input: UpdateLeadAutomationInput
  ): Promise<LeadAutomation> => {
    // If frequency is being changed, recalculate next_run_at
    let nextRunAt: string | null | undefined = undefined
    if (input.frequency !== undefined) {
      nextRunAt = calculateNextRunAt(input.frequency)
    }

    const updatePayload: Record<string, unknown> = {
      ...input,
      updated_by: userId,
    }

    // Only set next_run_at if frequency was changed
    if (nextRunAt !== undefined) {
      updatePayload.next_run_at = nextRunAt
    }

    const { data, error } = await supabase
      .from('lead_automations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Toggle automation active status
   */
  toggleActive: async (id: string, userId: string): Promise<LeadAutomation> => {
    // Get current state
    const { data: current, error: fetchError } = await supabase
      .from('lead_automations')
      .select('is_active')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    const { data, error } = await supabase
      .from('lead_automations')
      .update({
        is_active: !current.is_active,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft delete an automation
   */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('lead_automations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Run an automation manually
   */
  runManually: async (
    automationId: string,
    userId: string
  ): Promise<{ leads_created: number; leads_found: number; leads_skipped: number }> => {
    // Use supabase.functions.invoke() instead of raw fetch()
    // It automatically sends the correct Authorization + apikey headers
    const { data, error } = await supabase.functions.invoke('run-lead-automation', {
      body: {
        automation_id: automationId,
        triggered_by: userId,
        trigger_type: 'manual',
      },
    })

    if (error) {
      // error.message contains the body from the Edge Function
      throw new Error(error.message ?? 'Automation run failed')
    }

    return data as { leads_created: number; leads_found: number; leads_skipped: number }
  },

  /**
   * Get runs for an automation
   */
  getRuns: async (automationId: string): Promise<AutomationRun[]> => {
    const { data, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('automation_id', automationId)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return data || []
  },

  /**
   * Get recent runs for all automations in tenant
   */
  getRecentRuns: async (tenantId: string, limit = 10): Promise<AutomationRun[]> => {
    const { data, error } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },
}
