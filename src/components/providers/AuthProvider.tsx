import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores'
import { Loader2 } from 'lucide-react'
import { sessionSecurityApi } from '@/services/api/sessionSecurity'
import {
  ensureSessionStart,
  clearSessionMarkers,
  computeDeadlines,
  setLogoutReason,
  DEFAULT_SESSION_POLICY,
} from '@/lib/sessionPolicy'

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

        // SESSION LIMITS: a restored session must be checked against the
        // idle/absolute limits BEFORE the app renders. Without this, closing
        // the tab for longer than the idle timeout and reopening it would
        // restore a session that should already have ended.
        if (session) {
          ensureSessionStart()

          // Use the tenant's configured limits, not the built-in defaults, so
          // a tenant that allows a longer idle window is honoured on reload.
          let policy = DEFAULT_SESSION_POLICY
          try {
            policy = await sessionSecurityApi.getEffectivePolicy()
          } catch {
            /* keep defaults — enforcing something is safer than nothing */
          }

          const deadlines = computeDeadlines(policy)
          if (deadlines.expiresAt <= Date.now()) {
            setLogoutReason(deadlines.reason)
            clearSessionMarkers()
            await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
            if (mounted) {
              setUser(null)
              setLoading(false)
              useAuthStore.getState().setInitialized()
              setReady(true)
            }
            return
          }
        }

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
      (event, session) => {
        if (!mounted) return

        // Keep the session-lifetime markers in step with the real auth state.
        if (event === 'SIGNED_IN') {
          // Deliberately ensure-only, never reset: supabase-js also emits
          // SIGNED_IN on cross-tab session recovery, and resetting here would
          // silently extend the absolute lifetime forever. The real sign-in
          // path (useAuth) stamps a fresh start itself.
          ensureSessionStart()
        } else if (event === 'SIGNED_OUT') {
          clearSessionMarkers()
        } else if (event === 'TOKEN_REFRESHED') {
          // A refresh must NOT extend the absolute lifetime — that is exactly
          // the behaviour that kept sessions alive forever. Only make sure a
          // start marker exists.
          ensureSessionStart()
        }

        setUser(session?.user ?? null)
        if (!session) {
          logout()
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
