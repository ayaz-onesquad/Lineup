import type { ReactNode } from 'react'
import { useAuthStore } from '@/stores'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { useSessionPolicy } from '@/hooks/useSessionPolicy'
import { formatCountdown } from '@/lib/sessionPolicy'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ShieldAlert, Clock } from 'lucide-react'

/**
 * Mounts the idle/absolute session enforcement and renders the pre-logout
 * warning. Must sit inside the router (it navigates) and inside AuthProvider
 * (it reads the auth store).
 */
export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  return (
    <>
      {children}
      {isAuthenticated && <SessionTimeoutWatcher />}
    </>
  )
}

/**
 * Split into its own component so the timeout machinery only mounts for a
 * signed-in user and unmounts cleanly on sign-out.
 */
function SessionTimeoutWatcher() {
  const { isWarning, msRemaining, reason, staySignedIn, signOutNow } = useSessionTimeout()
  const { policy } = useSessionPolicy()

  // The absolute cap cannot be extended by activity, so offering
  // "Stay signed in" there would be a lie: the dialog would reopen at once.
  const canExtend = reason !== 'absolute_timeout'

  return (
    <AlertDialog open={isWarning}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>
              {canExtend ? 'Still there?' : 'Session ending'}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p>
                {canExtend
                  ? `You have been inactive. For security you will be signed out automatically after ${policy.idle_timeout_minutes} minutes of inactivity.`
                  : `This session has reached its maximum length of ${policy.absolute_session_hours} hours. You will need to sign in again.`}
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-lg tabular-nums">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatCountdown(msRemaining ?? 0)}</span>
                <span className="font-sans text-xs text-muted-foreground">
                  until sign-out
                </span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={signOutNow}>
            Sign out now
          </Button>
          {canExtend && (
            <Button onClick={staySignedIn} autoFocus>
              Stay signed in
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
