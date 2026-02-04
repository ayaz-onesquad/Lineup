import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenantStore } from '@/stores'
import { Loader2 } from 'lucide-react'

interface TenantGuardProps {
  children: React.ReactNode
}

export function TenantGuard({ children }: TenantGuardProps) {
  const navigate = useNavigate()
  const { currentTenant, tenants, isLoading } = useTenantStore()

  useEffect(() => {
    if (!isLoading && tenants.length === 0) {
      // User has no tenants, redirect to onboarding
      navigate('/onboarding', { replace: true })
    }
  }, [isLoading, tenants, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!currentTenant) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return <>{children}</>
}
