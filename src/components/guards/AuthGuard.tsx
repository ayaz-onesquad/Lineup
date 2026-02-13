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

/**
 * AuthGuard - Base Authentication Guard
 *
 * This guard handles authentication and role-based routing:
 *
 * 1. Unauthenticated users → /login
 * 2. sys_admin users → /admin (Plane A - they don't belong in tenant space)
 * 3. Users with no role AND no tenant → /onboarding
 * 4. Users with requiredRole mismatch → appropriate redirect
 *
 * useUserRole is the single source of truth for role-based decisions.
 */
export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { role, isLoading: roleLoading } = useUserRole()
  const { tenants, isLoading: tenantsLoading } = useTenant()

  const isLoading = authLoading || roleLoading || tenantsLoading

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, {
        replace: true,
      })
    }
  }, [authLoading, isAuthenticated, navigate, location])

  // Handle sys_admin users - they belong in Plane A (Admin Portal)
  useEffect(() => {
    if (!isLoading && isAuthenticated && role === 'sys_admin') {
      navigate('/admin', { replace: true })
    }
  }, [isLoading, isAuthenticated, role, navigate])

  // Handle users with no role AND no tenant - send to onboarding
  useEffect(() => {
    if (!isLoading && isAuthenticated && role !== 'sys_admin') {
      // User is authenticated but has no role and no tenants
      if (!role && tenants.length === 0) {
        navigate('/onboarding', { replace: true })
      }
    }
  }, [isLoading, isAuthenticated, role, tenants.length, navigate])

  // Handle requiredRole mismatch
  useEffect(() => {
    if (!isLoading && isAuthenticated && requiredRole && role && role !== requiredRole) {
      // Redirect based on actual role
      if (role === 'client_user') {
        navigate('/portal', { replace: true })
      } else if (role === 'sys_admin') {
        navigate('/admin', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [isLoading, isAuthenticated, requiredRole, role, navigate])

  // Show loading while checking auth, role, and tenants
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Show spinner during redirect transitions (prevents blank screen)
  // Note: Don't show redirect spinner if we're already at the destination
  const isOnOnboarding = location.pathname === '/onboarding'
  const needsOnboarding = !role && tenants.length === 0

  const isRedirecting =
    !isAuthenticated ||
    role === 'sys_admin' ||
    (needsOnboarding && !isOnOnboarding) || // Only redirect if NOT already on onboarding
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
