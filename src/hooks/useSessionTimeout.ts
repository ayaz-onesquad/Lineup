import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { sessionSecurityApi } from '@/services/api/sessionSecurity'
import {
  SESSION_KEYS,
  computeDeadlines,
  ensureSessionStart,
  clearSessionMarkers,
  recordActivity,
  setLogoutReason,
  type LogoutReason,
} from '@/lib/sessionPolicy'

/** User gestures that count as activity. Passive so scrolling stays smooth. */
const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'wheel',
  'touchstart',
  'pointerdown',
  'focus',
] as const

/**
 * Activity is written to localStorage at most this often. Without throttling a
 * single scroll would issue hundreds of synchronous storage writes.
 */
const ACTIVITY_WRITE_THROTTLE_MS = 10_000

/** How often the deadlines are re-evaluated. */
const TICK_INTERVAL_MS = 1_000

export interface SessionTimeoutState {
  /** True while the pre-logout warning should be shown. */
  isWarning: boolean
  /** Milliseconds until forced sign-out, or null when not warning. */
  msRemaining: number | null
  /** Which limit is about to fire. */
  reason: LogoutReason
  /** Resets the idle clock and dismisses the warning. */
  staySignedIn: () => void
  /** Signs out immediately as a deliberate user action. */
  signOutNow: () => void
}

/**
 * Enforces the idle timeout and the absolute session lifetime.
 *
 * Cross-tab behaviour: the activity timestamp and session start live in
 * localStorage, and every tab polls them. Activity in one tab therefore keeps
 * all tabs alive, and `supabase.auth.signOut()` propagates the sign-out to
 * every tab through Supabase's own storage event handling.
 */
export function useSessionTimeout(): SessionTimeoutState {
  const { isAuthenticated, user } = useAuthStore()
  const { policy } = useSessionPolicy()

  const [isWarning, setIsWarning] = useState(false)
  const [msRemaining, setMsRemaining] = useState<number | null>(null)
  const [reason, setReason] = useState<LogoutReason>('idle_timeout')

  /** Guards against the sign-out running twice (e.g. tick + storage event). */
  const isSigningOutRef = useRef(false)
  const lastActivityWriteRef = useRef(0)

  const performTimeoutLogout = useCallback(
    async (timeoutReason: LogoutReason) => {
      if (isSigningOutRef.current) return
      isSigningOutRef.current = true

      // Record the reason BEFORE signing out so the login page can explain it.
      setLogoutReason(timeoutReason)

      // Fire-and-forget audit write; must not delay the sign-out.
      const eventType =
        timeoutReason === 'absolute_timeout'
          ? 'absolute_timeout'
          : timeoutReason === 'idle_timeout'
            ? 'idle_timeout'
            : 'logout'
      const detail =
        timeoutReason === 'absolute_timeout'
          ? `Absolute session limit of ${policy.absolute_session_hours}h reached`
          : timeoutReason === 'idle_timeout'
            ? `Idle for ${policy.idle_timeout_minutes} minutes`
            : 'User signed out'

      void sessionSecurityApi.logAuthEvent({
        userId: user?.id ?? null,
        email: user?.email ?? null,
        eventType,
        detail,
      })

      clearSessionMarkers()

      try {
        // 'global' revokes the refresh token server-side, so a stolen token
        // from this session cannot be replayed after the timeout.
        await supabase.auth.signOut({ scope: 'global' })
      } catch (err) {
        console.error('[useSessionTimeout] signOut failed:', err)
      }

      // Hard navigation clears all in-memory React Query caches, which may hold
      // tenant data that must not survive the sign-out.
      window.location.replace('/login')
    },
    [policy.absolute_session_hours, policy.idle_timeout_minutes, user?.email, user?.id]
  )

  // -------------------------------------------------------------------------
  // Activity tracking (throttled, cross-tab via localStorage)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return

    const onActivity = () => {
      const now = Date.now()
      if (now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return
      lastActivityWriteRef.current = now
      recordActivity(now)
    }

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, onActivity, { passive: true, capture: true })
    )

    return () => {
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, onActivity, { capture: true })
      )
    }
  }, [isAuthenticated])

  // -------------------------------------------------------------------------
  // Make sure an already-open session has an absolute-cap start marker.
  // Sessions created before this feature shipped have none, and would
  // otherwise never hit the absolute limit.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated) ensureSessionStart()
  }, [isAuthenticated])

  // -------------------------------------------------------------------------
  // Another tab extended the session: drop our warning dialog.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return

    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_KEYS.lastActivity) return
      const deadlines = computeDeadlines(policy)
      const remaining = deadlines.expiresAt - Date.now()
      if (remaining > policy.warn_before_logout_seconds * 1000) {
        setIsWarning(false)
        setMsRemaining(null)
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [isAuthenticated, policy])

  // -------------------------------------------------------------------------
  // The tick: evaluate deadlines once a second.
  // -------------------------------------------------------------------------
  useEffect(() => {
    // SessionTimeoutProvider only mounts this hook for a signed-in user, and
    // unmounts it on sign-out, so there is no un-authenticated state to clear.
    if (!isAuthenticated) return

    const warnWindowMs = policy.warn_before_logout_seconds * 1000

    const tick = () => {
      const now = Date.now()
      const deadlines = computeDeadlines(policy, now)
      const remaining = deadlines.expiresAt - now

      if (remaining <= 0) {
        void performTimeoutLogout(deadlines.reason)
        return
      }

      if (remaining <= warnWindowMs) {
        setIsWarning(true)
        setMsRemaining(remaining)
        setReason(deadlines.reason)
      } else {
        setIsWarning(false)
        setMsRemaining(null)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, TICK_INTERVAL_MS)

    // A laptop waking from sleep does not fire interval ticks while asleep;
    // re-check immediately on wake so a long sleep expires the session.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isAuthenticated, policy, performTimeoutLogout])

  const staySignedIn = useCallback(() => {
    const now = Date.now()
    recordActivity(now)
    lastActivityWriteRef.current = now
    setIsWarning(false)
    setMsRemaining(null)
  }, [])

  const signOutNow = useCallback(() => {
    void performTimeoutLogout('manual')
  }, [performTimeoutLogout])

  return { isWarning, msRemaining, reason, staySignedIn, signOutNow }
}
