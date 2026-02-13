import { supabase } from '@/services/supabase'
import type { Contact, ContactWithCreator, CreateContactInput, UpdateContactInput, LinkContactToClientInput, ClientContact, UpdateClientContactInput } from '@/types/database'

export const contactsApi = {
  getAll: async (tenantId: string): Promise<ContactWithCreator[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Get all client_contacts for these contacts to show associated clients
    if (data && data.length > 0) {
      const contactIds = data.map(c => c.id)
      const { data: clientContacts } = await supabase
        .from('client_contacts')
        .select(`
          *,
          clients (id, name)
        `)
        .in('contact_id', contactIds)

      // Map client_contacts to contacts
      const clientContactsMap = new Map<string, { id: string; name: string }[]>()
      clientContacts?.forEach(cc => {
        const existing = clientContactsMap.get(cc.contact_id) || []
        if (cc.clients) {
          existing.push(cc.clients as { id: string; name: string })
        }
        clientContactsMap.set(cc.contact_id, existing)
      })

      return data.map(contact => ({
        ...contact,
        clients: clientContactsMap.get(contact.id)?.[0], // First client for backwards compat
      }))
    }

    return data || []
  },

  // Get contacts for a client via the join table (many-to-many)
  getByClientId: async (clientId: string): Promise<ContactWithCreator[]> => {
    // First try the new join table
    const { data: joinData, error: joinError } = await supabase
      .from('client_contacts')
      .select(`
        is_primary,
        role,
        contacts (*)
      `)
      .eq('client_id', clientId)

    if (!joinError && joinData && joinData.length > 0) {
      // Filter out null contacts and map with is_primary and role from join table
      const contacts = joinData
        .filter(cc => cc.contacts)
        .map(cc => {
          const contact = cc.contacts as unknown as Contact
          return {
            ...contact,
            is_primary: cc.is_primary,
            // Use role from client_contacts (client-specific) if available, fallback to contact's global role
            role: cc.role || contact.role,
          }
        })
        .filter(c => !c.deleted_at)
        .sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
      return contacts
    }

    // Fallback to legacy client_id field for backward compatibility
    // Note: is_primary column was removed from contacts table in migration 008
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null)
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
    if (!data) return null

    // Get associated clients via join table
    const { data: clientContacts } = await supabase
      .from('client_contacts')
      .select(`
        *,
        clients (id, name)
      `)
      .eq('contact_id', id)

    return {
      ...data,
      clients: clientContacts?.[0]?.clients as { id: string; name: string } | undefined,
      client_contacts: clientContacts || [],
    }
  },

  getPrimaryContact: async (clientId: string): Promise<Contact | null> => {
    // Try join table first
    const { data: joinData } = await supabase
      .from('client_contacts')
      .select(`
        contacts (*)
      `)
      .eq('client_id', clientId)
      .eq('is_primary', true)
      .single()

    if (joinData?.contacts) {
      return joinData.contacts as unknown as Contact
    }

    // Fallback: get first contact for this client if no join table data
    // Note: is_primary column was removed from contacts table in migration 008
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  create: async (
    tenantId: string,
    userId: string,
    input: CreateContactInput
  ): Promise<Contact> => {
    // Extract is_primary and client_id - they don't belong in contacts table
    // is_primary lives in client_contacts join table (migration 008)
    const { client_id, is_primary, ...contactData } = input

    // Create the contact (without is_primary - that column was removed)
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        ...contactData,
        // Keep client_id for backwards compatibility during migration
        client_id: client_id || null,
      })
      .select()
      .single()

    if (error) throw error

    // If client_id is provided, also create the join table entry
    // Note: client_contacts uses RLS via client_id -> clients.tenant_id
    if (client_id) {
      await supabase
        .from('client_contacts')
        .insert({
          client_id,
          contact_id: data.id,
          is_primary: is_primary ?? false,
          created_by: userId,
        })
    }

    return data
  },

  update: async (id: string, userId: string, input: UpdateContactInput, clientId?: string): Promise<Contact> => {
    // Extract is_primary and role - they belong to client_contacts, NOT contacts table
    const { is_primary, role, ...contactData } = input

    // Update the contacts table (without is_primary and role - those are relationship-specific)
    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...contactData,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // If clientId is provided, update relationship-specific fields in client_contacts
    if (clientId) {
      // Handle is_primary
      if (is_primary !== undefined) {
        if (is_primary) {
          // Set this contact as primary (will unset others via trigger or manual update)
          await contactsApi.setPrimary(id, clientId)
        } else {
          // Explicitly unset primary
          await supabase
            .from('client_contacts')
            .update({ is_primary: false, updated_by: userId })
            .eq('client_id', clientId)
            .eq('contact_id', id)
        }
      }

      // Handle role - always update if provided and clientId exists
      if (role !== undefined) {
        await supabase
          .from('client_contacts')
          .update({ role, updated_by: userId })
          .eq('client_id', clientId)
          .eq('contact_id', id)
      }
    }

    return data
  },

  // Update client-contact relationship (role, is_primary) without touching global contact data
  updateRelationship: async (
    contactId: string,
    clientId: string,
    userId: string,
    input: UpdateClientContactInput
  ): Promise<void> => {
    const { is_primary, role } = input

    // Handle is_primary first (uses special logic to ensure single primary)
    if (is_primary !== undefined) {
      if (is_primary) {
        await contactsApi.setPrimary(contactId, clientId)
      } else {
        await supabase
          .from('client_contacts')
          .update({ is_primary: false, updated_by: userId })
          .eq('client_id', clientId)
          .eq('contact_id', contactId)
      }
    }

    // Update role if provided
    if (role !== undefined) {
      await supabase
        .from('client_contacts')
        .update({ role, updated_by: userId })
        .eq('client_id', clientId)
        .eq('contact_id', contactId)
    }
  },

  delete: async (id: string): Promise<void> => {
    // Remove from all client_contacts first
    await supabase
      .from('client_contacts')
      .delete()
      .eq('contact_id', id)

    // Soft delete the contact
    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  // Link an existing contact to a client
  linkToClient: async (
    userId: string,
    input: LinkContactToClientInput
  ): Promise<ClientContact> => {
    const { data, error } = await supabase
      .from('client_contacts')
      .insert({
        client_id: input.client_id,
        contact_id: input.contact_id,
        is_primary: input.is_primary ?? false,
        role: input.role || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Unlink a contact from a client
  unlinkFromClient: async (clientId: string, contactId: string): Promise<void> => {
    const { error } = await supabase
      .from('client_contacts')
      .delete()
      .eq('client_id', clientId)
      .eq('contact_id', contactId)

    if (error) throw error
  },

  // Set primary contact for a client (via join table)
  // Note: is_primary column was removed from contacts table in migration 008
  // is_primary now lives exclusively in client_contacts join table
  setPrimary: async (contactId: string, clientId: string): Promise<void> => {
    // First, unset any existing primary contact for this client in join table
    await supabase
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true)

    // Then set the new primary in join table
    const { error } = await supabase
      .from('client_contacts')
      .update({ is_primary: true })
      .eq('client_id', clientId)
      .eq('contact_id', contactId)

    if (error) throw error
  },

  // Get all clients linked to a specific contact
  getClientsByContactId: async (contactId: string): Promise<{ client: { id: string; name: string; status?: string }; is_primary: boolean }[]> => {
    const { data, error } = await supabase
      .from('client_contacts')
      .select(`
        is_primary,
        clients (id, name, status)
      `)
      .eq('contact_id', contactId)

    if (error) throw error
    if (!data) return []

    return data
      .filter(cc => cc.clients)
      .map(cc => ({
        client: cc.clients as unknown as { id: string; name: string; status?: string },
        is_primary: cc.is_primary ?? false,
      }))
  },

  // Get all contacts not linked to a specific client (for "Link Existing" dropdown)
  getUnlinkedContacts: async (tenantId: string, clientId: string): Promise<Contact[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)

    if (error) throw error
    if (!data) return []

    // Get contacts already linked to this client
    const { data: linkedContacts } = await supabase
      .from('client_contacts')
      .select('contact_id')
      .eq('client_id', clientId)

    const linkedIds = new Set(linkedContacts?.map(lc => lc.contact_id) || [])

    // Return contacts not already linked
    return data.filter(c => !linkedIds.has(c.id))
  },

  // Convert a contact to a client user (creates auth user and links to client)
  convertToClientUser: async (
    contactId: string,
    clientId: string,
    tenantId: string,
    email: string,
    password: string,
    _currentUserId: string
  ): Promise<{ userId: string; success: boolean }> => {
    // 1. Get contact info
    const contact = await contactsApi.getById(contactId)
    if (!contact) throw new Error('Contact not found')

    // 2. Create auth user using the admin create pattern (preserves current session)
    const { authApi } = await import('./auth')
    const { userId } = await authApi.adminCreateUser({
      email,
      password,
      firstName: contact.first_name,
      lastName: contact.last_name,
      phone: contact.phone || undefined,
    })

    // 3. Link user to tenant as client_user and to specific client
    const { error: linkError } = await supabase.rpc('link_client_user', {
      p_user_id: userId,
      p_client_id: clientId,
      p_contact_id: contactId,
      p_tenant_id: tenantId,
    })

    if (linkError) {
      console.error('Failed to link client user:', linkError)
      throw new Error(`User created but failed to link to client: ${linkError.message}`)
    }

    return { userId, success: true }
  },

  // Check if a contact has an associated user account
  hasUserAccount: async (contactId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('client_users')
      .select('id')
      .eq('contact_id', contactId)
      .limit(1)

    if (error) {
      console.error('Error checking user account:', error)
      return false
    }

    return (data?.length ?? 0) > 0
  },
}
