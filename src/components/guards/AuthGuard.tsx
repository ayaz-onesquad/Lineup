import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { useTenant } from '@/hooks/useTenant'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/types/database'

/**
 * LIFECYCLE:
 * ON_MOUNT: Reads session from Supabase (async, ~300-600ms)
 * DURING_LOAD: Render spinner — NEVER redirect
 * AFTER_LOAD (authenticated): Render children at original URL
 * AFTER_LOAD (unauthenticated): Redirect to /login?returnTo=<current>
 * AFTER_LOGIN: Redirect to returnTo param or default dashboard
 *
 * AuthGuard - Base Authentication Guard
 *
 * This guard handles authentication and role-based routing:
 *
 * 1. Unauthenticated users → /login?returnTo=<current>
 * 2. sys_admin users → /admin (Plane A - they don't belong in tenant space)
 * 3. Users with no role AND no tenant → /onboarding
 * 4. Users with requiredRole mismatch → appropriate redirect
 *
 * CRITICAL: All redirect logic is consolidated into a SINGLE useEffect
 * to prevent race conditions during page refresh.
 *
 * useUserRole is the single source of truth for role-based decisions.
 */

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isInitialized, isLoading: authLoading } = useAuthStore()
  const { role, isLoading: roleLoading } = useUserRole()
  const { tenants, isLoading: tenantsLoading } = useTenant()

  // Combined loading state - ALL async operations must complete before any redirect
  // CRITICAL: isInitialized MUST be checked separately (not in isLoading) because
  // it gates whether we trust the other values at all
  const isLoading = authLoading || roleLoading || tenantsLoading

  // CONSOLIDATED REDIRECT LOGIC
  // All redirect decisions are made in this single effect to prevent race conditions
  useEffect(() => {
    // GATE 1: Never redirect until session has been confirmed from Supabase at least once.
    // This prevents the persisted localStorage value from triggering premature redirects
    // on page refresh or dev server restart.
    if (!isInitialized) {
      return
    }

    // GATE 2: Never redirect while ANY loading state is true
    // This prevents the "refresh redirects to home" bug
    if (isLoading) {
      return
    }

    // Priority 1: Unauthenticated → /login with returnTo param
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?returnTo=${returnTo}`, { replace: true })
      return
    }

    // Priority 2: sys_admin → /admin (Plane A)
    if (role === 'sys_admin') {
      navigate('/admin', { replace: true })
      return
    }

    // Priority 3: No role AND no tenant → /onboarding
    if (!role && tenants.length === 0) {
      navigate('/onboarding', { replace: true })
      return
    }

    // Priority 4: requiredRole mismatch → redirect based on actual role
    // Note: sys_admin already handled in Priority 2, so only client_user or org roles remain
    if (requiredRole && role && role !== requiredRole) {
      if (role === 'client_user') {
        navigate('/portal', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
      return
    }
  }, [isInitialized, isLoading, isAuthenticated, role, tenants.length, requiredRole, navigate, location.pathname, location.search])

  // Show loading spinner while session is initializing or checking auth, role, and tenants
  // CRITICAL: This MUST return before any redirect logic runs
  // Render spinner for entire time isInitialized === false (prevents flash of redirect)
  if (!isInitialized || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Determine if we're in a redirecting state (show spinner during navigation)
  const isOnOnboarding = location.pathname === '/onboarding'
  const needsOnboarding = !role && tenants.length === 0

  const isRedirecting =
    !isAuthenticated ||
    role === 'sys_admin' ||
    (needsOnboarding && !isOnOnboarding) ||
    (requiredRole && role !== requiredRole)

  if (isRedirecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // User is authenticated and authorized - render protected content
  return <>{children}</>
}
