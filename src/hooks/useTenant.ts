import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tenantsApi, authApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type { CreateTenantInput } from '@/types/database'

export function useTenant() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const {
    currentTenant,
    tenants,
    isLoading,
    setCurrentTenant,
    setTenants,
    setLoading,
    switchTenant,
  } = useTenantStore()
  const { setRole } = useAuthStore()

  // Load user's tenants
  const tenantsQuery = useQuery({
    queryKey: ['userTenants', user?.id],
    queryFn: () => authApi.getUserTenants(user!.id),
    enabled: !!user?.id,
  })

  // Update store when tenants load
  useEffect(() => {
    if (tenantsQuery.data) {
      setTenants(tenantsQuery.data)

      // Auto-select first tenant if none selected
      if (!currentTenant && tenantsQuery.data.length > 0) {
        setCurrentTenant(tenantsQuery.data[0])
      }

      setLoading(false)
    }
  }, [tenantsQuery.data, currentTenant, setTenants, setCurrentTenant, setLoading])

  // Load user role when tenant changes
  useEffect(() => {
    const loadRole = async () => {
      if (user?.id && currentTenant?.id) {
        const tenantUser = await authApi.getUserRoleInTenant(user.id, currentTenant.id)
        if (tenantUser) {
          setRole(tenantUser.role)
        }
      }
    }
    loadRole()
  }, [user?.id, currentTenant?.id, setRole])

  // Create tenant mutation
  const createTenant = useMutation({
    mutationFn: (input: CreateTenantInput) => tenantsApi.create(input, user!.id),
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: ['userTenants'] })
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

  return {
    currentTenant,
    tenants,
    isLoading: isLoading || tenantsQuery.isLoading,
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
