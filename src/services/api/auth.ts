import { supabase } from '@/services/supabase'
import type { UserProfile, Tenant, TenantUser } from '@/types/database'

export interface SignUpData {
  email: string
  password: string
  fullName: string
}

export interface SignInData {
  email: string
  password: string
}

export const authApi = {
  signUp: async ({ email, password, fullName }: SignUpData) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) throw error
    return data
  },

  signIn: async ({ email, password }: SignInData) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return data
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) throw error
  },

  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  },

  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  getUser: async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data.user
  },

  getUserProfile: async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    // If no profile exists, try to create one (fallback for when trigger didn't fire)
    if (!data) {
      const user = await authApi.getUser()
      if (user) {
        const fullName = user.user_metadata?.full_name || user.email || 'User'
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: userId,
            full_name: fullName,
          })
          .select()
          .single()

        if (createError) {
          console.error('Failed to create user profile:', createError)
          return null
        }
        return newProfile
      }
    }

    return data
  },

  updateUserProfile: async (userId: string, profile: Partial<UserProfile>) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(profile)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  getUserTenants: async (userId: string): Promise<Tenant[]> => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select(`
        tenant_id,
        role,
        tenants (*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error) throw error

    return data?.map((item) => item.tenants as unknown as Tenant).filter(Boolean) || []
  },

  getUserRoleInTenant: async (userId: string, tenantId: string): Promise<TenantUser | null> => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  // Check if user is a sys_admin in any tenant
  checkIsSysAdmin: async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'sys_admin')
      .eq('status', 'active')
      .limit(1)

    if (error) {
      console.error('Failed to check sys_admin status:', error)
      return false
    }

    return (data?.length || 0) > 0
  },

  // Get user's highest role - kept for backward compatibility
  // The useUserRole hook is the preferred way to get role
  getUserHighestRole: async (userId: string): Promise<TenantUser['role'] | null> => {
    // Try database function first (bypasses RLS)
    const { data: funcData, error: funcError } = await supabase
      .rpc('get_user_highest_role', { p_user_id: userId })

    if (!funcError && funcData) {
      return funcData as TenantUser['role']
    }

    // Fallback to direct query
    const { data, error } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error || !data || data.length === 0) {
      return null
    }

    // Return highest priority role
    const rolePriority = ['sys_admin', 'org_admin', 'org_user', 'client_user']
    for (const role of rolePriority) {
      if (data.some(tu => tu.role === role)) {
        return role as TenantUser['role']
      }
    }
    return data[0].role as TenantUser['role']
  },
}
