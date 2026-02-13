import { supabase } from '@/services/supabase'
import type {
  Client,
  ClientWithRelations,
  Contact,
  CreateClientInput,
  CreateClientWithContactInput,
  CreateClientWithContactResult,
  UpdateClientInput,
} from '@/types/database'

export const clientsApi = {
  getAll: async (tenantId: string): Promise<ClientWithRelations[]> => {
    // Get all clients for tenant
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch contacts via client_contacts join table (is_primary is here, NOT on contacts)
    let contactsMap: Record<string, Array<{ contact: unknown; is_primary: boolean }>> = {}
    try {
      const { data: clientContacts } = await supabase
        .from('client_contacts')
        .select(`
          client_id,
          is_primary,
          contacts (*)
        `)

      if (clientContacts) {
        contactsMap = clientContacts.reduce((acc, cc) => {
          const clientId = cc.client_id as string
          if (!acc[clientId]) acc[clientId] = []
          if (cc.contacts) {
            acc[clientId].push({ contact: cc.contacts, is_primary: cc.is_primary ?? false })
          }
          return acc
        }, {} as Record<string, Array<{ contact: unknown; is_primary: boolean }>>)
      }
    } catch {
      // client_contacts table might not exist yet - that's ok
    }

    // Add contacts and primary_contact to each client
    return (data || []).map((client) => {
      const clientContactData = contactsMap[client.id] || []
      const contactsWithPrimary = clientContactData.map(cc => ({
        ...cc.contact as object,
        is_primary: cc.is_primary,
      }))
      return {
        ...client,
        contacts: contactsWithPrimary,
        primary_contact: contactsWithPrimary.find((c) => c.is_primary) || null,
      }
    }) as ClientWithRelations[]
  },

  getById: async (id: string): Promise<ClientWithRelations | null> => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    if (!data) return null

    // Fetch contacts via client_contacts join table (is_primary is here, NOT on contacts)
    let contactsWithPrimary: unknown[] = []
    try {
      const { data: clientContacts } = await supabase
        .from('client_contacts')
        .select(`
          is_primary,
          contacts (*)
        `)
        .eq('client_id', id)

      if (clientContacts) {
        contactsWithPrimary = clientContacts
          .filter(cc => cc.contacts)
          .map(cc => ({
            ...cc.contacts as object,
            is_primary: cc.is_primary ?? false,
          }))
          .sort((a: any, b: any) => {
            // Primary contacts first
            if (a.is_primary && !b.is_primary) return -1
            if (!a.is_primary && b.is_primary) return 1
            return 0
          })
      }
    } catch {
      // client_contacts table might not exist yet
    }

    return {
      ...data,
      contacts: contactsWithPrimary,
      primary_contact: (contactsWithPrimary as any[]).find((c) => c.is_primary) || null,
    } as ClientWithRelations
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateClientInput
  ): Promise<Client> => {
    // IMPORTANT: Always include tenant_id for RLS visibility
    // Records without tenant_id will not be visible to users
    const { data, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        name: input.name,
        company_name: input.company_name || input.name,
        email: input.email || '',
        phone: input.phone,
        overview: input.overview,
        industry: input.industry,
        location: input.location,
        status: input.status ?? 'active',
        portal_enabled: input.portal_enabled ?? false,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, userId: string, input: UpdateClientInput): Promise<Client> => {
    const { data, error } = await supabase
      .from('clients')
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

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  restore: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: null })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Create a client and primary contact atomically via PostgreSQL RPC function.
   * Both records are created in a single database transaction - if either fails,
   * the entire operation is rolled back (no partial saves).
   *
   * @param tenantId - The tenant ID for multi-tenant isolation
   * @param userId - The user ID for audit trail (created_by)
   * @param input - Client and contact data
   * @returns Both client and contact records
   * @throws Error if RPC call fails or validation fails
   */
  createWithContact: async (
    tenantId: string,
    userId: string,
    input: CreateClientWithContactInput
  ): Promise<CreateClientWithContactResult> => {
    // Validate required parameters before RPC call
    if (!tenantId) {
      throw new Error('tenantId is required for createWithContact')
    }
    if (!userId) {
      throw new Error('userId is required for createWithContact')
    }

    const { data, error } = await supabase.rpc('create_client_with_contact', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_client_data: input.client,
      p_contact_data: input.contact,
    })

    if (error) {
      throw new Error(`Failed to create client with contact: ${error.message}`)
    }

    // Parse the returned JSONB - RPC returns { client: {...}, contact: {...} }
    return {
      client: data.client as Client,
      contact: data.contact as Contact,
    }
  },
}
