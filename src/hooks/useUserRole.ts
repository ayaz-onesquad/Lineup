import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores'
import type { UserRole } from '@/types/database'

/**
 * Fetches user's highest role
 * Tries SECURITY DEFINER function first, falls back to direct query
 */
async function fetchUserHighestRole(userId: string): Promise<UserRole | null> {
  // Try database function first (SECURITY DEFINER bypasses RLS)
  const { data: funcData, error: funcError } = await supabase
    .rpc('get_user_highest_role', { p_user_id: userId })

  if (!funcError && funcData) {
    return funcData as UserRole
  }

  // Fallback to direct query
  const { data, error } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error || !data || data.length === 0) {
    return null
  }

  // Return highest priority role
  const rolePriority: UserRole[] = ['sys_admin', 'org_admin', 'org_user', 'client_user']
  for (const role of rolePriority) {
    if (data.some(tu => tu.role === role)) {
      return role
    }
  }
  return data[0].role as UserRole
}

/**
 * Hook to get the current user's highest role across all tenants
 */
export function useUserRole() {
  const { user } = useAuthStore()
  const userId = user?.id

  const query = useQuery({
    queryKey: ['userRole', userId],
    queryFn: () => fetchUserHighestRole(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    retryDelay: 500,
  })

  // If no user, we're not loading - we just have no role
  if (!userId) {
    return {
      role: null,
      isLoading: false,
      error: null,
      refetch: query.refetch,
    }
  }

  return {
    role: query.data ?? null,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    error: query.error,
    refetch: query.refetch,
  }
}
