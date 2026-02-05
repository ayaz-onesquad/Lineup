import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { useUserRole } from '@/hooks/useUserRole'
import { Loader2 } from 'lucide-react'

interface AdminGuardProps {
  children: React.ReactNode
}

/**
 * AdminGuard - Plane A: System Administration
 *
 * This guard protects the Admin Portal (/admin/*).
 * Only sys_admin users can access this plane.
 *
 * - sys_admin does NOT go through onboarding (they are platform owners)
 * - Non-sys_admin users are redirected to /dashboard
 * - Unauthenticated users are redirected to /admin/login
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { role, isLoading: roleLoading } = useUserRole()

  const isLoading = authLoading || roleLoading

  // Redirect unauthenticated users to admin login
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/admin/login', { replace: true })
    }
  }, [authLoading, isAuthenticated, navigate])

  // Redirect non-sys_admin users to dashboard (not onboarding)
  // sys_admin bypasses tenant/onboarding flow entirely
  useEffect(() => {
    if (!isLoading && isAuthenticated && role !== 'sys_admin') {
      // User is authenticated but not a sys_admin - they belong in Plane B
      navigate('/dashboard', { replace: true })
    }
  }, [isLoading, isAuthenticated, role, navigate])

  // Show loading while checking auth and role
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not authenticated - redirect in progress
  if (!isAuthenticated) {
    return null
  }

  // Not sys_admin - redirect in progress
  if (role !== 'sys_admin') {
    return null
  }

  // User is authenticated sys_admin - render protected content
  return <>{children}</>
}
