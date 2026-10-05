import { useQuery } from '@tanstack/react-query'
import { sessionSecurityApi } from '@/services/api/sessionSecurity'
import { useAuthStore } from '@/stores'
import { DEFAULT_SESSION_POLICY } from '@/lib/sessionPolicy'
import type { EffectiveSessionPolicy } from '@/types/database'

/**
 * The strictest session/document policy across the current user's tenants.
 * Returns the built-in defaults while loading or when unauthenticated, so
 * every consumer always has concrete limits to enforce.
 */
export function useSessionPolicy(): {
  policy: EffectiveSessionPolicy
  isLoading: boolean
} {
  const { user, isAuthenticated } = useAuthStore()

  const query = useQuery({
    queryKey: ['session-policy', user?.id],
    queryFn: sessionSecurityApi.getEffectivePolicy,
    enabled: !!user?.id && isAuthenticated,
    // The policy changes rarely; refetching on every mount is wasteful.
    staleTime: 1000 * 60 * 10,
    retry: 1,
  })

  return {
    policy: query.data ?? DEFAULT_SESSION_POLICY,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
  }
}
