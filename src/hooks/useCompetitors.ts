import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { competitorsApi } from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/services/supabase'
import type { CreateCompetitorInput, UpdateCompetitorInput } from '@/types/database'

/**
 * Hook to fetch all competitors for the current tenant
 */
export function useCompetitors() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['competitors', currentTenant?.id],
    queryFn: () => competitorsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch a single competitor by ID
 */
export function useCompetitor(id: string) {
  return useQuery({
    queryKey: ['competitor', id],
    queryFn: () => competitorsApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Hook to fetch competitors linked to a specific client
 */
export function useCompetitorsByClient(clientId: string) {
  return useQuery({
    queryKey: ['competitors', 'by-client', clientId],
    queryFn: () => competitorsApi.getByClient(clientId),
    enabled: !!clientId,
  })
}

/**
 * Hook to get the current user's profile ID
 */
function useCurrentUserProfileId() {
  const { user } = useAuthStore()

  return useQuery({
    queryKey: ['user-profile-id', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single()
      return data?.id || null
    },
    enabled: !!user?.id,
  })
}

/**
 * Hook for competitor mutations (create, update, delete)
 */
export function useCompetitorMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useCurrentUserProfileId()

  const createCompetitor = useMutation({
    mutationFn: (input: CreateCompetitorInput) =>
      competitorsApi.create(currentTenant!.id, userProfileId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', currentTenant?.id] })
      toast({
        title: 'Competitor created',
        description: 'The competitor has been added successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompetitors.createCompetitor] Error:', error)
      toast({
        title: 'Failed to create competitor',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateCompetitor = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateCompetitorInput) =>
      competitorsApi.update(id, userProfileId!, input),
    onSuccess: async (_, variables) => {
      await queryClient.refetchQueries({ queryKey: ['competitor', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['competitors', currentTenant?.id] })
      toast({
        title: 'Competitor updated',
        description: 'The competitor has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompetitors.updateCompetitor] Error:', error)
      toast({
        title: 'Failed to update competitor',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteCompetitor = useMutation({
    mutationFn: competitorsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['competitor'] })
      toast({
        title: 'Competitor deleted',
        description: 'The competitor has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useCompetitors.deleteCompetitor] Error:', error)
      toast({
        title: 'Failed to delete competitor',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createCompetitor,
    updateCompetitor,
    deleteCompetitor,
  }
}
