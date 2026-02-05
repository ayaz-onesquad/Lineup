import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'

/**
 * Hook for authentication operations
 * Auth state is managed by AuthProvider, this hook provides mutations
 */
export function useAuth() {
  const navigate = useNavigate()
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
      setUser(data.user)
      toast({
        title: 'Welcome back!',
        description: 'You have been signed in.',
      })
      // Navigate to onboarding - it will redirect based on role/tenants
      navigate('/onboarding')
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
