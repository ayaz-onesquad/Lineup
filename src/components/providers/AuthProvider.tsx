import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores'

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
          setReady(true)
        }
      } catch {
        // Any error (including abort) - just mark as loaded with no user
        if (mounted) {
          setUser(null)
          setLoading(false)
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

  // Don't render children until auth is initialized
  if (!ready) {
    return null
  }

  return <>{children}</>
}
