import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantsApi, authApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateTenantInput, Tenant } from '@/types/database'

/**
 * Hook to manage tenant state and operations
 */
export function useTenant() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const userId = user?.id
  const {
    currentTenant,
    setCurrentTenant,
    setTenants,
    switchTenant,
  } = useTenantStore()

  // Fetch user's tenants
  const tenantsQuery = useQuery({
    queryKey: ['userTenants', userId],
    queryFn: () => authApi.getUserTenants(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    retryDelay: 500,
  })

  // Sync React Query data to Zustand store
  useEffect(() => {
    if (tenantsQuery.data) {
      console.log('[Auth] Tenants fetched from database:', tenantsQuery.data.map(t => ({ id: t.id, name: t.name })))
      setTenants(tenantsQuery.data)

      // Validate that persisted currentTenant still exists in user's tenants
      const persistedTenantValid = currentTenant && tenantsQuery.data.some(t => t.id === currentTenant.id)

      if (!persistedTenantValid && tenantsQuery.data.length > 0) {
        // Persisted tenant is stale/invalid, use first available tenant
        console.log('[Auth] Real Tenant ID found:', tenantsQuery.data[0].id)
        console.log('[Auth] Persisted tenant was invalid, switching to:', tenantsQuery.data[0].name)
        setCurrentTenant(tenantsQuery.data[0])
      } else if (persistedTenantValid) {
        console.log('[Auth] Real Tenant ID found:', currentTenant!.id)
      }
    }
  }, [tenantsQuery.data, currentTenant, setTenants, setCurrentTenant])

  // Create tenant mutation
  const createTenant = useMutation({
    mutationFn: (input: CreateTenantInput) => tenantsApi.create(input, userId!),
    onSuccess: (tenant: Tenant) => {
      // Update cache directly for immediate UI update
      queryClient.setQueryData<Tenant[]>(
        ['userTenants', userId],
        (old) => [...(old || []), tenant]
      )
      setCurrentTenant(tenant)
      toast({
        title: 'Organization created',
        description: `${tenant.name} has been created successfully.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create organization',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Update tenant mutation
  const updateTenant = useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & Partial<CreateTenantInput>) =>
      tenantsApi.update(id, updates),
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: ['userTenants'] })
      if (currentTenant?.id === tenant.id) {
        setCurrentTenant(tenant)
      }
      toast({
        title: 'Organization updated',
        description: 'Changes have been saved.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update organization',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // If no user, we're not loading - we just have no tenants
  if (!userId) {
    return {
      currentTenant: null,
      tenants: [],
      isLoading: false,
      switchTenant,
      createTenant,
      updateTenant,
      refetch: tenantsQuery.refetch,
    }
  }

  return {
    currentTenant,
    tenants: tenantsQuery.data || [],
    isLoading: tenantsQuery.isPending && tenantsQuery.fetchStatus !== 'idle',
    switchTenant,
    createTenant,
    updateTenant,
    refetch: tenantsQuery.refetch,
  }
}

export function useTenantUsers(tenantId?: string) {
  const { currentTenant } = useTenantStore()
  const id = tenantId || currentTenant?.id

  return useQuery({
    queryKey: ['tenantUsers', id],
    queryFn: () => tenantsApi.getUsers(id!),
    enabled: !!id,
  })
}
