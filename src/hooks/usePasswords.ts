import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { passwordsApi } from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/services/supabase'
import type { CreatePasswordInput, UpdatePasswordInput } from '@/types/database'

/**
 * Hook to fetch all passwords for the current tenant
 */
export function usePasswords() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['passwords', currentTenant?.id],
    queryFn: () => passwordsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch a single password by ID
 */
export function usePassword(id: string) {
  return useQuery({
    queryKey: ['password', id],
    queryFn: () => passwordsApi.getById(id),
    enabled: !!id,
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
 * Hook for password mutations (create, update, delete)
 */
export function usePasswordMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { data: userProfileId } = useCurrentUserProfileId()

  const createPassword = useMutation({
    mutationFn: (input: CreatePasswordInput) =>
      passwordsApi.create(currentTenant!.id, userProfileId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passwords', currentTenant?.id] })
      toast({
        title: 'Password created',
        description: 'The credential has been saved successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[usePasswords.createPassword] Error:', error)
      toast({
        title: 'Failed to create password',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updatePassword = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdatePasswordInput) =>
      passwordsApi.update(id, userProfileId!, input),
    onSuccess: async (_, variables) => {
      await queryClient.refetchQueries({ queryKey: ['password', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['passwords', currentTenant?.id] })
      toast({
        title: 'Password updated',
        description: 'The credential has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      console.error('[usePasswords.updatePassword] Error:', error)
      toast({
        title: 'Failed to update password',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deletePassword = useMutation({
    mutationFn: passwordsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passwords', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['password'] })
      toast({
        title: 'Password deleted',
        description: 'The credential has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[usePasswords.deletePassword] Error:', error)
      toast({
        title: 'Failed to delete password',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createPassword,
    updatePassword,
    deletePassword,
  }
}
