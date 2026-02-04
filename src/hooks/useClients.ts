import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateClientInput, UpdateClientInput } from '@/types/database'

export function useClients() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['clients', currentTenant?.id],
    queryFn: () => clientsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
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

  const createClient = useMutation({
    mutationFn: (input: CreateClientInput) =>
      clientsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
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
    mutationFn: ({ id, ...input }: { id: string } & UpdateClientInput) =>
      clientsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
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
      queryClient.invalidateQueries({ queryKey: ['clients'] })
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
