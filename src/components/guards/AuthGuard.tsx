import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/types/database'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, role } = useAuthStore()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login with return URL
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, {
        replace: true,
      })
    }
  }, [isLoading, isAuthenticated, navigate, location])

  useEffect(() => {
    if (!isLoading && isAuthenticated && requiredRole && role !== requiredRole) {
      // User doesn't have required role
      if (role === 'client_user') {
        navigate('/portal', { replace: true })
      } else if (role === 'sys_admin') {
        navigate('/admin', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [isLoading, isAuthenticated, requiredRole, role, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (requiredRole && role !== requiredRole) {
    return null
  }

  return <>{children}</>
}
