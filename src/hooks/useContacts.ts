import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateContactInput, UpdateContactInput, LinkContactToClientInput, UpdateClientContactInput } from '@/types/database'

export function useAllContacts() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['contacts', 'all', currentTenant?.id],
    queryFn: () => contactsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useContacts(clientId: string) {
  return useQuery({
    queryKey: ['contacts', clientId],
    queryFn: () => contactsApi.getByClientId(clientId),
    enabled: !!clientId,
  })
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.getById(id),
    enabled: !!id,
  })
}

export function usePrimaryContact(clientId: string) {
  return useQuery({
    queryKey: ['primaryContact', clientId],
    queryFn: () => contactsApi.getPrimaryContact(clientId),
    enabled: !!clientId,
  })
}

// Get all clients linked to a specific contact
export function useContactClients(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId, 'clients'],
    queryFn: () => contactsApi.getClientsByContactId(contactId),
    enabled: !!contactId,
  })
}

// Get contacts not linked to a specific client (for "Link Existing" dropdown)
export function useUnlinkedContacts(clientId: string) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['contacts', 'unlinked', clientId, currentTenant?.id],
    queryFn: () => contactsApi.getUnlinkedContacts(currentTenant!.id, clientId),
    enabled: !!clientId && !!currentTenant?.id,
  })
}

// Standalone link contact mutation (for ClientForm existing contact selection)
export function useLinkContactToClient() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  return useMutation({
    mutationFn: (input: LinkContactToClientInput) =>
      contactsApi.linkToClient(user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['contacts', 'unlinked', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['clients', currentTenant?.id] })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to link contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      contactsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      if (variables.client_id) {
        queryClient.invalidateQueries({ queryKey: ['contacts', variables.client_id] })
        queryClient.invalidateQueries({ queryKey: ['client', variables.client_id] })
      }
      toast({
        title: 'Contact created',
        description: 'The contact has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useContactMutations(clientId?: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createContact = useMutation({
    mutationFn: (input: CreateContactInput) =>
      contactsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.client_id] })
      toast({
        title: 'Contact created',
        description: 'The contact has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateContact = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateContactInput) =>
      contactsApi.update(id, user!.id, input, clientId), // Pass clientId to handle is_primary
    onSuccess: (_, variables) => {
      // Invalidate single contact query
      queryClient.invalidateQueries({ queryKey: ['contact', variables.id] })
      // Invalidate all contacts list
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: ['contacts', clientId] })
        queryClient.invalidateQueries({ queryKey: ['client', clientId] })
        queryClient.invalidateQueries({ queryKey: ['primaryContact', clientId] })
      }
      toast({
        title: 'Contact updated',
        description: 'The contact has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteContact = useMutation({
    mutationFn: contactsApi.delete,
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: ['contacts', clientId] })
        queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      }
      toast({
        title: 'Contact deleted',
        description: 'The contact has been deleted.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const setPrimaryContact = useMutation({
    mutationFn: ({ id, clientId: cId }: { id: string; clientId: string }) =>
      contactsApi.setPrimary(id, cId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['primaryContact', variables.clientId] })
      toast({
        title: 'Primary contact updated',
        description: 'The primary contact has been set.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to set primary contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const linkToClient = useMutation({
    mutationFn: (input: LinkContactToClientInput) =>
      contactsApi.linkToClient(user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['contacts', 'unlinked', variables.client_id] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.client_id] })
      toast({
        title: 'Contact linked',
        description: 'The contact has been linked to this client.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to link contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const unlinkFromClient = useMutation({
    mutationFn: ({ clientId: cId, contactId }: { clientId: string; contactId: string }) =>
      contactsApi.unlinkFromClient(cId, contactId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['contacts', 'unlinked', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] })
      toast({
        title: 'Contact unlinked',
        description: 'The contact has been unlinked from this client.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to unlink contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Update relationship-specific fields (role, is_primary) without touching global contact data
  const updateRelationship = useMutation({
    mutationFn: ({ contactId, clientId: cId, ...input }: { contactId: string; clientId: string } & UpdateClientContactInput) =>
      contactsApi.updateRelationship(contactId, cId, user!.id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact', variables.contactId] })
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] })
      queryClient.invalidateQueries({ queryKey: ['primaryContact', variables.clientId] })
      toast({
        title: 'Relationship updated',
        description: 'The contact relationship has been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update relationship',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createContact,
    updateContact,
    deleteContact,
    setPrimaryContact,
    linkToClient,
    unlinkFromClient,
    updateRelationship,
  }
}
