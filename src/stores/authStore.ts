import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { UserProfile, UserRole } from '@/types/database'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  role: UserRole | null
  isLoading: boolean
  isAuthenticated: boolean
  // isInitialized: true only AFTER first getSession() resolves in AuthProvider
  // This prevents premature redirects from persisted localStorage values
  isInitialized: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: UserProfile | null) => void
  setRole: (role: UserRole | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      role: null,
      isLoading: true,
      isAuthenticated: false,
      // CRITICAL: isInitialized starts false and is set true only after getSession() resolves
      // This MUST NOT be persisted - it must reset to false on every page load
      isInitialized: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setProfile: (profile) => set({ profile }),

      setRole: (role) => set({ role }),

      setLoading: (isLoading) => set({ isLoading }),

      // LIFECYCLE: Called AFTER getSession() resolves in AuthProvider
      // Enables AuthGuard redirects only after live session is confirmed
      setInitialized: () => set({ isInitialized: true }),

      logout: () =>
        set({
          user: null,
          profile: null,
          role: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist non-sensitive data
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
