import { supabase } from '@/services/supabase'
import type { Client, ClientWithRelations, CreateClientInput, UpdateClientInput } from '@/types/database'

export const clientsApi = {
  getAll: async (tenantId: string): Promise<ClientWithRelations[]> => {
    // First try with full relations (contacts table might not exist yet)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Try to fetch contacts separately if contacts table exists
    let contactsMap: Record<string, unknown[]> = {}
    try {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)

      if (contacts) {
        contactsMap = contacts.reduce((acc, contact) => {
          const clientId = contact.client_id as string
          if (!acc[clientId]) acc[clientId] = []
          acc[clientId].push(contact)
          return acc
        }, {} as Record<string, unknown[]>)
      }
    } catch {
      // contacts table might not exist yet - that's ok
    }

    // Add contacts and primary_contact to each client
    return (data || []).map((client) => {
      const clientContacts = contactsMap[client.id] || []
      return {
        ...client,
        contacts: clientContacts,
        primary_contact: clientContacts.find((c: any) => c.is_primary) || null,
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

    // Try to fetch contacts separately
    let contacts: unknown[] = []
    try {
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('*')
        .eq('client_id', id)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })

      contacts = contactsData || []
    } catch {
      // contacts table might not exist yet
    }

    return {
      ...data,
      contacts,
      primary_contact: contacts.find((c: any) => c.is_primary) || null,
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
}
