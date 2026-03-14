import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'

/**
 * Hook for authentication operations
 * Auth state is managed by AuthProvider, this hook provides mutations
 *
 * POST-LOGIN REDIRECT:
 * After successful login, checks for ?returnTo= param and navigates there.
 * Falls back to /onboarding if no returnTo param present.
 */
export function useAuth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const {
    user,
    profile,
    isLoading,
    isAuthenticated,
    setUser,
    logout: logoutStore,
  } = useAuthStore()
  const { clearTenant } = useTenantStore()

  // Sign up mutation
  const signUp = useMutation({
    mutationFn: authApi.signUp,
    onSuccess: () => {
      toast({
        title: 'Account created',
        description: 'You can now sign in to your account.',
      })
      navigate('/login')
    },
    onError: (error: Error) => {
      toast({
        title: 'Sign up failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Sign in mutation
  const signIn = useMutation({
    mutationFn: authApi.signIn,
    onSuccess: (data) => {
      // SECURITY: Clear all cached data from previous session before setting new user
      // This prevents data leakage between accounts/tenants
      queryClient.clear()
      clearTenant()

      setUser(data.user)
      toast({
        title: 'Welcome back!',
        description: 'You have been signed in.',
      })

      // POST-LOGIN REDIRECT: Check for returnTo param from AuthGuard redirect
      const returnTo = searchParams.get('returnTo')
      if (returnTo) {
        const decoded = decodeURIComponent(returnTo)
        // SECURITY: Validate returnTo to prevent open redirect attacks
        // Must start with '/' (relative) and NOT be a protocol-relative URL ('//')
        const isValidReturnTo =
          decoded.startsWith('/') &&
          !decoded.startsWith('//') &&
          !decoded.toLowerCase().startsWith('/http')
        if (isValidReturnTo) {
          navigate(decoded, { replace: true })
        } else {
          // Invalid returnTo - fall back to safe default
          navigate('/onboarding')
        }
      } else {
        // Default: Navigate to onboarding - it will redirect based on role/tenants
        navigate('/onboarding')
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Sign out mutation
  const signOut = useMutation({
    mutationFn: authApi.signOut,
    onSuccess: () => {
      logoutStore()
      clearTenant()
      queryClient.clear()
      navigate('/login')
      toast({
        title: 'Signed out',
        description: 'You have been signed out.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Sign out failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Reset password mutation
  const resetPassword = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast({
        title: 'Password reset email sent',
        description: 'Check your email for the reset link.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Reset failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    user,
    profile,
    isLoading,
    isAuthenticated,
    signUp,
    signIn,
    signOut,
    resetPassword,
  }
}
