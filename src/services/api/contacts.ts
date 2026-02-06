import { supabase } from '@/services/supabase'
import type { Contact, ContactWithCreator, CreateContactInput, UpdateContactInput } from '@/types/database'

export const contactsApi = {
  getByClientId: async (clientId: string): Promise<ContactWithCreator[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<ContactWithCreator | null> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  getPrimaryContact: async (clientId: string): Promise<Contact | null> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateContactInput
  ): Promise<Contact> => {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        ...input,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  update: async (id: string, userId: string, input: UpdateContactInput): Promise<Contact> => {
    const { data, error } = await supabase
      .from('contacts')
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
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  setPrimary: async (id: string, clientId: string): Promise<void> => {
    // First, unset any existing primary contact for this client
    await supabase
      .from('contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true)

    // Then set the new primary
    const { error } = await supabase
      .from('contacts')
      .update({ is_primary: true })
      .eq('id', id)

    if (error) throw error
  },
}
