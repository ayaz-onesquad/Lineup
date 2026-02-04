import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { authApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'

export function useAuth() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    user,
    profile,
    role,
    isLoading,
    isAuthenticated,
    setUser,
    setProfile,
    setRole,
    setLoading,
    logout: logoutStore,
  } = useAuthStore()
  const { clearTenant } = useTenantStore()

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await authApi.getSession()
        if (session?.user) {
          setUser(session.user)
          const userProfile = await authApi.getUserProfile(session.user.id)
          setProfile(userProfile)
        }
      } catch (error) {
        console.error('Auth init error:', error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          const userProfile = await authApi.getUserProfile(session.user.id)
          setProfile(userProfile)
        } else if (event === 'SIGNED_OUT') {
          logoutStore()
          clearTenant()
          queryClient.clear()
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [setUser, setProfile, setLoading, logoutStore, clearTenant, queryClient])

  // Sign up mutation
  const signUp = useMutation({
    mutationFn: authApi.signUp,
    onSuccess: () => {
      toast({
        title: 'Account created',
        description: 'Please check your email to verify your account.',
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
    onSuccess: async (data) => {
      setUser(data.user)
      if (data.user) {
        const userProfile = await authApi.getUserProfile(data.user.id)
        setProfile(userProfile)
      }
      toast({
        title: 'Welcome back!',
        description: 'You have been signed in.',
      })
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
    role,
    isLoading,
    isAuthenticated,
    setRole,
    signUp,
    signIn,
    signOut,
    resetPassword,
  }
}

export function useUserTenants() {
  const { user } = useAuthStore()

  return useQuery({
    queryKey: ['userTenants', user?.id],
    queryFn: () => authApi.getUserTenants(user!.id),
    enabled: !!user?.id,
  })
}
