import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateClientInput, CreateClientWithContactInput, UpdateClientInput } from '@/types/database'

export function useClients() {
  const { currentTenant } = useTenantStore()
  const tenantId = currentTenant?.id

  return useQuery({
    queryKey: ['clients', tenantId],
    queryFn: () => clientsApi.getAll(tenantId!),
    enabled: !!tenantId,
    staleTime: 1000 * 60, // 1 minute
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.getById(id),
    enabled: !!id,
  })
}

export function useClientMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const tenantId = currentTenant?.id

  const createClient = useMutation({
    mutationFn: (input: CreateClientInput) => {
      if (!tenantId) {
        throw new Error('Cannot create client: No tenant selected')
      }
      if (!user?.id) {
        throw new Error('Cannot create client: User not authenticated')
      }
      return clientsApi.create(tenantId, user.id, input)
    },
    onSuccess: (newClient) => {
      // Invalidate the clients list query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
      // Optionally, add to cache directly for immediate UI update
      queryClient.setQueryData(['client', newClient.id], newClient)
      toast({
        title: 'Client created',
        description: 'The client has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create client',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateClient = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateClientInput) => {
      if (!user?.id) {
        throw new Error('Cannot update client: User not authenticated')
      }
      return clientsApi.update(id, user.id, input)
    },
    onSuccess: (updatedClient, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['client', variables.id] })
      queryClient.setQueryData(['client', variables.id], updatedClient)
      toast({
        title: 'Client updated',
        description: 'The client has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update client',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteClient = useMutation({
    mutationFn: clientsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
      toast({
        title: 'Client archived',
        description: 'The client has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive client',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createClient,
    updateClient,
    deleteClient,
  }
}

// Standalone create client mutation (for when linking existing contact)
export function useCreateClient() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const tenantId = currentTenant?.id

  return useMutation({
    mutationFn: (input: CreateClientInput) => {
      if (!tenantId) {
        throw new Error('Cannot create client: No tenant selected')
      }
      if (!user?.id) {
        throw new Error('Cannot create client: User not authenticated')
      }
      return clientsApi.create(tenantId, user.id, input)
    },
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
      queryClient.setQueryData(['client', newClient.id], newClient)
      toast({
        title: 'Client created',
        description: 'The client has been created successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create client',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useCreateClientWithContact() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const tenantId = currentTenant?.id

  return useMutation({
    mutationFn: (input: CreateClientWithContactInput) => {
      if (!tenantId) {
        throw new Error('Cannot create client: No tenant selected')
      }
      if (!user?.id) {
        throw new Error('Cannot create client: User not authenticated')
      }
      return clientsApi.createWithContact(tenantId, user.id, input)
    },
    onSuccess: ({ client, contact }) => {
      // Invalidate clients list
      queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })

      // Set client detail with contact already attached
      queryClient.setQueryData(['client', client.id], {
        ...client,
        contacts: [contact],
        primary_contact: contact,
      })

      // Set contacts query for this client
      queryClient.setQueryData(['contacts', client.id], [contact])

      toast({
        title: 'Client created',
        description: `${client.name} created with primary contact ${contact.first_name} ${contact.last_name}`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create client',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}
