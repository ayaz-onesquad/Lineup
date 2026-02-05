import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '@/hooks/useTenant'
import { Loader2 } from 'lucide-react'

interface TenantGuardProps {
  children: React.ReactNode
}

export function TenantGuard({ children }: TenantGuardProps) {
  const navigate = useNavigate()
  const { currentTenant, tenants, isLoading } = useTenant()

  useEffect(() => {
    if (!isLoading && (tenants.length === 0 || !currentTenant)) {
      navigate('/onboarding', { replace: true })
    }
  }, [isLoading, tenants, currentTenant, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!currentTenant || tenants.length === 0) {
    return null
  }

  return <>{children}</>
}
