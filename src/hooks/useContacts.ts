import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateContactInput, UpdateContactInput } from '@/types/database'

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
      contactsApi.update(id, user!.id, input),
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: ['contacts', clientId] })
        queryClient.invalidateQueries({ queryKey: ['client', clientId] })
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

  return {
    createContact,
    updateContact,
    deleteContact,
    setPrimaryContact,
  }
}
