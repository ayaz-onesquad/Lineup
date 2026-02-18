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
    console.log('[TenantGuard] State:', {
      isLoading,
      tenantsCount: tenants.length,
      currentTenantId: currentTenant?.id || null,
    })

    if (!isLoading && (tenants.length === 0 || !currentTenant)) {
      console.log('[TenantGuard] No tenant found, redirecting to onboarding')
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

  console.log('[TenantGuard] Tenant ready, rendering children with tenant:', currentTenant.id)
  return <>{children}</>
}
