import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Tenant, TenantUserWithProfile } from '@/types/database'

interface TenantState {
  currentTenant: Tenant | null
  tenants: Tenant[]
  tenantUsers: TenantUserWithProfile[]
  isLoading: boolean
  setCurrentTenant: (tenant: Tenant | null) => void
  setTenants: (tenants: Tenant[]) => void
  setTenantUsers: (users: TenantUserWithProfile[]) => void
  setLoading: (loading: boolean) => void
  switchTenant: (tenantId: string) => void
  clearTenant: () => void
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      currentTenant: null,
      tenants: [],
      tenantUsers: [],
      isLoading: true,

      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),

      setTenants: (tenants) => set({ tenants }),

      setTenantUsers: (users) => set({ tenantUsers: users }),

      setLoading: (isLoading) => set({ isLoading }),

      switchTenant: (tenantId) => {
        const { tenants } = get()
        const tenant = tenants.find((t) => t.id === tenantId)
        if (tenant) {
          set({ currentTenant: tenant })
        }
      },

      clearTenant: () =>
        set({
          currentTenant: null,
          tenants: [],
          tenantUsers: [],
        }),
    }),
    {
      name: 'tenant-storage',
      partialize: (state) => ({
        currentTenant: state.currentTenant,
      }),
    }
  )
)
