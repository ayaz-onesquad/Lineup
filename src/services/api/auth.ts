import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/services/supabase'
import type { UserProfile, Tenant, TenantUser } from '@/types/database'
import { checkRateLimit, RATE_LIMITS, RateLimitError, isValidEmail, enforceMaxLength, INPUT_LIMITS } from '@/lib/security'

// Edge Function URL for admin password reset
const ADMIN_RESET_PASSWORD_URL = `${SUPABASE_URL}/functions/v1/admin-reset-password`

export interface SignUpData {
  email: string
  password: string
  fullName: string
}

export interface SignInData {
  email: string
  password: string
}

export { RateLimitError }

// Admin-only: create user with specific details
export interface AdminCreateUserData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  timezone?: string
}

export const authApi = {
  signUp: async ({ email, password, fullName }: SignUpData) => {
    // Rate limiting: 3 signups per minute
    const rateLimitResult = checkRateLimit('auth:signup', RATE_LIMITS.signup)
    if (!rateLimitResult.allowed) {
      const seconds = Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)
      throw new RateLimitError(`Too many signup attempts. Please try again in ${seconds} seconds.`, rateLimitResult.retryAfterMs)
    }

    // Input validation
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address')
    }
    const sanitizedName = enforceMaxLength(fullName.trim(), INPUT_LIMITS.name)
    const sanitizedEmail = enforceMaxLength(email.trim().toLowerCase(), INPUT_LIMITS.email)

    const { data, error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password,
      options: {
        data: {
          full_name: sanitizedName,
        },
      },
    })

    if (error) throw error
    return data
  },

  signIn: async ({ email, password }: SignInData) => {
    // Input validation
    const sanitizedEmail = enforceMaxLength(email.trim().toLowerCase(), INPUT_LIMITS.email)

    // SERVER-SIDE Rate limiting: Check against database (persists across page refreshes)
    try {
      const { data: rateLimitData, error: rateLimitError } = await supabase
        .rpc('check_rate_limit', { p_email: sanitizedEmail, p_action_type: 'login' })

      if (!rateLimitError && rateLimitData && !rateLimitData.allowed) {
        const seconds = rateLimitData.retry_after_seconds || 300
        throw new RateLimitError(
          `Too many login attempts. Please try again in ${seconds} seconds.`,
          seconds * 1000
        )
      }
    } catch (e) {
      // If rate limit check is a RateLimitError, rethrow it
      if (e instanceof RateLimitError) throw e
      // Otherwise, fall back to client-side rate limiting (for backwards compatibility)
      console.warn('Server-side rate limit check failed, using client-side:', e)
      const rateLimitResult = checkRateLimit(`auth:signin:${email}`, RATE_LIMITS.auth)
      if (!rateLimitResult.allowed) {
        const seconds = Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)
        throw new RateLimitError(`Too many login attempts. Please try again in ${seconds} seconds.`, rateLimitResult.retryAfterMs)
      }
    }

    // Attempt login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password,
    })

    // Record the attempt (server-side)
    try {
      await supabase.rpc('record_login_attempt', {
        p_email: sanitizedEmail,
        p_success: !error,
        p_error_message: error?.message || null,
      })
    } catch (recordError) {
      // Non-blocking - don't fail login because of recording failure
      console.warn('Failed to record login attempt:', recordError)
    }

    if (error) throw error
    return data
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  resetPassword: async (email: string) => {
    // Rate limiting: 3 password resets per 15 minutes
    const rateLimitResult = checkRateLimit(`auth:reset:${email}`, RATE_LIMITS.passwordReset)
    if (!rateLimitResult.allowed) {
      const minutes = Math.ceil((rateLimitResult.retryAfterMs || 900000) / 60000)
      throw new RateLimitError(`Too many password reset requests. Please try again in ${minutes} minutes.`, rateLimitResult.retryAfterMs)
    }

    // Input validation
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address')
    }
    const sanitizedEmail = enforceMaxLength(email.trim().toLowerCase(), INPUT_LIMITS.email)

    const { error } = await supabase.auth.resetPasswordForEmail(sanitizedEmail, {
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

  // Admin function to create a new user (requires admin privileges)
  // This preserves the admin's session by saving and restoring it
  adminCreateUser: async (data: AdminCreateUserData): Promise<{ userId: string; profile: UserProfile; adminUserId: string }> => {
    const fullName = `${data.firstName} ${data.lastName}`

    // CRITICAL: Save the current admin session BEFORE creating the new user
    // signUp() may auto-login as the new user, which would kick out the admin
    const { data: currentSession } = await supabase.auth.getSession()
    const adminSession = currentSession?.session
    const adminUserId = adminSession?.user?.id

    if (!adminSession || !adminUserId) {
      throw new Error('Admin session not found. Please log in again.')
    }

    let newUserId: string | null = null

    try {
      // Create the auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: fullName,
            phone: data.phone,
            timezone: data.timezone,
          },
        },
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create user')

      newUserId = authData.user.id

      // CRITICAL: Restore the admin's session immediately
      // This prevents the admin from being logged out as the new user
      const { error: restoreError } = await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      })

      if (restoreError) {
        console.error('Failed to restore admin session:', restoreError)
        // Try one more time
        const { error: retryError } = await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        })
        if (retryError) {
          throw new Error(
            'Failed to restore admin session after user creation. ' +
            'Please refresh the page and try again. The user may have been created.'
          )
        }
      }

      // VERIFY session was actually restored
      const { data: verifySession } = await supabase.auth.getSession()
      if (verifySession.session?.user.id !== adminUserId) {
        // Session restoration failed - try one more time
        const { error: finalRetryError } = await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        })

        if (finalRetryError) {
          throw new Error(
            'Session verification failed. Please refresh the page and try again. ' +
            'The user may have been created.'
          )
        }

        // Final verification
        const { data: finalSession } = await supabase.auth.getSession()
        if (finalSession.session?.user.id !== adminUserId) {
          throw new Error(
            'Session verification failed after retry. Please refresh the page. ' +
            'The user may have been created.'
          )
        }
      }

      // Create user profile (the trigger may not fire for admin-created users)
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: newUserId,
          full_name: fullName,
        })
        .select()
        .single()

      if (profileError) {
        console.error('Failed to create user profile:', profileError)
        throw new Error(
          `User was created in auth but profile creation failed: ${profileError.message}. ` +
          'The user exists but may not appear in the list. Try refreshing.'
        )
      }

      return {
        userId: newUserId,
        profile,
        adminUserId,
      }
    } catch (error) {
      // If anything fails, try to restore admin session
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        }).catch(() => {
          // Silent fail - admin may need to re-login
        })
      }
      throw error
    }
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

  // Admin function to reset another user's password (requires sys_admin role)
  // This calls an Edge Function that uses the service_role key
  adminResetPassword: async (targetUserId: string, newPassword: string): Promise<void> => {
    // Validate password length
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    // Get current session for authorization
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }

    // Call the Edge Function
    const response = await fetch(ADMIN_RESET_PASSWORD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        targetUserId,
        newPassword,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password')
    }
  },
}
