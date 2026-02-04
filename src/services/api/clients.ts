import { supabase } from '@/services/supabase'
import type { Client, CreateClientInput, UpdateClientInput } from '@/types/database'

export const clientsApi = {
  getAll: async (tenantId: string): Promise<Client[]> => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getById: async (id: string): Promise<Client | null> => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateClientInput
  ): Promise<Client> => {
    const { data, error } = await supabase
      .from('clients')
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

  update: async (id: string, input: UpdateClientInput): Promise<Client> => {
    const { data, error } = await supabase
      .from('clients')
      .update(input)
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
