// src/components/guards/AuthGuard.tsx
// Clean rewrite — single useEffect, single loading gate, no race conditions

import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { useTenant } from '@/hooks/useTenant'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/types/database'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // isLoading is TRUE while getSession() is in flight (starts true, set false after resolve)
  // isAuthenticated may be stale from localStorage until isLoading becomes false
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()
  const { role, isLoading: isRoleLoading } = useUserRole()
  const { tenants, isLoading: isTenantsLoading } = useTenant()

  useEffect(() => {
    // GATE: Never redirect until Supabase session check completes.
    // isAuthLoading = true means getSession() has not resolved yet.
    // This prevents persisted localStorage values from triggering premature redirects.
    if (isAuthLoading) return

    // GATE: Don't redirect while role/tenant RPCs are in flight (only after auth confirmed)
    if (isAuthenticated && (isRoleLoading || isTenantsLoading)) return

    // --- All decisions below are safe: session is confirmed from Supabase ---

    // Priority 1: Unauthenticated → /login with returnTo param
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?returnTo=${returnTo}`, { replace: true })
      return
    }

    // Priority 2: sys_admin → /admin (Plane A - they don't belong in tenant space)
    if (role === 'sys_admin') {
      navigate('/admin', { replace: true })
      return
    }

    // Priority 3: No role AND no tenant → /onboarding
    if (!role && (!tenants || tenants.length === 0)) {
      navigate('/onboarding', { replace: true })
      return
    }

    // Priority 4: requiredRole mismatch → redirect based on actual role
    if (requiredRole && role && role !== requiredRole) {
      if (role === 'client_user') {
        navigate('/portal', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
      return
    }

    // All checks passed — render children (handled by return below)
  }, [
    isAuthLoading,
    isAuthenticated,
    isRoleLoading,
    isTenantsLoading,
    role,
    tenants,
    requiredRole,
    navigate,
    location.pathname,
    location.search,
  ])

  // Show spinner while auth is loading — prevents flash of redirect
  if (isAuthLoading || (isAuthenticated && (isRoleLoading || isTenantsLoading))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // If not authenticated, render nothing (redirect fires via useEffect)
  if (!isAuthenticated) return null

  return <>{children}</>
}
