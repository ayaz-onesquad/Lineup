import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores'
import { Loader2 } from 'lucide-react'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * AuthProvider - Handles Supabase auth session state
 * Simple, idempotent, StrictMode compatible
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading, logout } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
          // AFTER_SESSION_RESOLVE: mark auth as fully initialized — enables AuthGuard redirects
          // This MUST come after setUser so the auth state is correct before guards run
          useAuthStore.getState().setInitialized()
          setReady(true)
        }
      } catch {
        // Any error (including abort) - just mark as loaded with no user
        if (mounted) {
          setUser(null)
          setLoading(false)
          // Also mark initialized on error so guards can handle unauthenticated state
          useAuthStore.getState().setInitialized()
          setReady(true)
        }
      }
    }

    initAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setUser(session?.user ?? null)
          if (!session) {
            logout()
          }
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [setUser, setLoading, logout])

  // Show loading spinner while auth is initializing (prevents blank screen)
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return <>{children}</>
}
