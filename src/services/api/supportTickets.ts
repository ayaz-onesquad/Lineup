import { supabase } from '@/services/supabase'

export type TicketType = 'incident' | 'information' | 'improvement'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id: string
  display_id: number
  ticket_id_display: string
  tenant_id: string
  submitted_by: string
  title: string
  description: string | null
  type: TicketType
  status: TicketStatus
  page_url: string | null
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SupportTicketWithSubmitter extends SupportTicket {
  tenant_name: string | null
  submitter_name: string | null
  submitter_email: string | null
}

export interface CreateTicketInput {
  title: string
  description?: string
  type: TicketType
  page_url?: string
}

export interface UpdateTicketInput {
  title?: string
  description?: string
  type?: TicketType
  status?: TicketStatus
  resolution?: string
}

export const supportTicketsApi = {
  /**
   * Get all tickets for current user (their own tickets)
   */
  getMyTickets: async (tenantId: string, userId: string): Promise<SupportTicket[]> => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('submitted_by', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get all tickets for tenant (OrgAdmin view)
   */
  getTenantTickets: async (tenantId: string): Promise<SupportTicket[]> => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get all tickets across all tenants (SysAdmin view)
   */
  getAllTickets: async (): Promise<SupportTicketWithSubmitter[]> => {
    const { data, error } = await supabase
      .from('support_tickets_with_submitter')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get ticket by ID
   */
  getById: async (id: string): Promise<SupportTicket | null> => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Create a new ticket
   */
  create: async (
    tenantId: string,
    userId: string,
    input: CreateTicketInput
  ): Promise<SupportTicket> => {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        tenant_id: tenantId,
        submitted_by: userId,
        title: input.title,
        description: input.description || null,
        type: input.type,
        page_url: input.page_url || null,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Update a ticket
   */
  update: async (id: string, input: UpdateTicketInput): Promise<SupportTicket> => {
    const updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
    }

    // If resolving, set resolved_at
    if (input.status === 'resolved' || input.status === 'closed') {
      updateData.resolved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Resolve a ticket (SysAdmin/OrgAdmin)
   */
  resolve: async (id: string, userId: string, resolution: string): Promise<SupportTicket> => {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({
        status: 'resolved',
        resolution,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get ticket statistics (SysAdmin dashboard)
   */
  getStats: async (): Promise<{
    total: number
    open: number
    inProgress: number
    resolved: number
    byType: Record<TicketType, number>
    last7Days: number
    last30Days: number
  }> => {
    const { data, error } = await supabase
      .from('support_ticket_stats')
      .select('*')

    if (error) throw error

    const stats = {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      byType: { incident: 0, information: 0, improvement: 0 } as Record<TicketType, number>,
      last7Days: 0,
      last30Days: 0,
    }

    for (const row of data || []) {
      stats.total += row.count
      stats.last7Days += row.last_7_days
      stats.last30Days += row.last_30_days

      if (row.status === 'open') stats.open += row.count
      if (row.status === 'in_progress') stats.inProgress += row.count
      if (row.status === 'resolved' || row.status === 'closed') stats.resolved += row.count

      if (row.type in stats.byType) {
        stats.byType[row.type as TicketType] += row.count
      }
    }

    return stats
  },
}
