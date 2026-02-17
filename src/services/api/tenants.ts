import { supabase } from '@/services/supabase'
import type { Tenant, TenantUser, TenantUserWithProfile, CreateTenantInput, UserRole } from '@/types/database'
import { generateSlug } from '@/lib/utils'
import { authApi, type AdminCreateUserData } from './auth'

// Input for creating a new user in a tenant
export interface CreateTenantUserInput extends AdminCreateUserData {
  role: UserRole
  sendWelcomeEmail?: boolean
}

export const tenantsApi = {
  // Check if an email already exists in auth system
  checkEmailExists: async (email: string): Promise<boolean> => {
    // Use RPC function that checks auth.users (SECURITY DEFINER)
    const { data: rpcData, error } = await supabase
      .rpc('check_email_exists', { p_email: email.trim().toLowerCase() })

    if (error) {
      // If RPC doesn't exist or fails, return false to allow attempt
      // The actual creation will fail if email exists
      console.warn('check_email_exists RPC failed:', error)
      return false
    }

    return rpcData === true
  },

  // Create tenant and add creator as org_admin (for regular user onboarding)
  // Uses RPC function to bypass RLS for new users who don't have tenant access yet
  create: async (input: CreateTenantInput, _userId: string): Promise<Tenant> => {
    const slug = input.slug || generateSlug(input.name)

    // Use RPC function that has SECURITY DEFINER to bypass RLS
    const { data, error } = await supabase.rpc('create_tenant_for_onboarding', {
      p_name: input.name,
      p_slug: slug,
    })

    if (error) throw error

    // RPC returns JSON, cast to Tenant
    return data as Tenant
  },

  // SysAdmin: Create tenant without adding creator as org_admin
  // Used when SysAdmin creates tenants from admin dashboard
  createTenantOnly: async (input: CreateTenantInput): Promise<Tenant> => {
    const slug = input.slug || generateSlug(input.name)

    // Create tenant only - SysAdmin is global and shouldn't be added as org_admin
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: input.name,
        slug,
        status: 'active',
        plan_tier: 'starter',
      })
      .select()
      .single()

    if (tenantError) throw tenantError

    return tenant
  },

  getById: async (id: string): Promise<Tenant | null> => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  getBySlug: async (slug: string): Promise<Tenant | null> => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  update: async (id: string, updates: Partial<Tenant>): Promise<Tenant> => {
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  getUsers: async (tenantId: string): Promise<TenantUserWithProfile[]> => {
    // Get tenant users, excluding sys_admin (they have global access, not tenant-specific)
    const { data: tenantUsers, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('role', 'sys_admin')
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!tenantUsers || tenantUsers.length === 0) return []

    // Get user profiles for all tenant users
    const userIds = tenantUsers.map(tu => tu.user_id)
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', userIds)

    // Map profiles to tenant users
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

    return tenantUsers.map(tu => ({
      ...tu,
      user_profiles: profileMap.get(tu.user_id) || undefined,
    }))
  },

  inviteUser: async (
    tenantId: string,
    email: string,
    role: TenantUser['role']
  ): Promise<void> => {
    // First check if user exists
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('email', email)
      .single()

    if (existingUser) {
      // Add existing user to tenant
      const { error } = await supabase
        .from('tenant_users')
        .insert({
          tenant_id: tenantId,
          user_id: existingUser.user_id,
          role,
          status: 'invited',
        })

      if (error) throw error
    } else {
      // Send invite email (would need to implement invite flow)
      // For now, throw an error
      throw new Error('User not found. Please ask them to sign up first.')
    }
  },

  updateUserRole: async (
    tenantId: string,
    userId: string,
    role: TenantUser['role']
  ): Promise<void> => {
    const { error } = await supabase
      .from('tenant_users')
      .update({ role })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

    if (error) throw error
  },

  removeUser: async (tenantId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('tenant_users')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

    if (error) throw error
  },

  // Create a new user and add them to a tenant
  createUser: async (
    tenantId: string,
    input: CreateTenantUserInput
  ): Promise<TenantUserWithProfile> => {
    // Pre-flight validation
    if (!tenantId) {
      throw new Error('Tenant ID is required to create a user')
    }

    // 1. Create the auth user and profile via Edge Function
    // The Edge Function uses the service_role key server-side, so the admin's
    // browser session is never affected - no session switching or restoration needed.
    const { userId, profile } = await authApi.adminCreateUser({
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      timezone: input.timezone,
    })

    // 2. Add user to tenant using RPC function (SECURITY DEFINER bypasses RLS)
    const { data: tenantUserId, error: tenantError } = await supabase
      .rpc('add_user_to_tenant', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_role: input.role,
        p_status: 'active',
      })

    if (tenantError) {
      // If we fail to add to tenant, the user is still created
      console.error('Failed to add user to tenant:', {
        error: tenantError,
        tenantId,
        userId,
        role: input.role,
      })

      throw new Error(
        `User created but failed to add to tenant: ${tenantError.message}. ` +
        `The user exists but may not appear in this tenant's list.`
      )
    }

    // 3. Fetch the created tenant_user record to return
    const { data: tenantUser, error: fetchError } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('id', tenantUserId)
      .single()

    if (fetchError || !tenantUser) {
      console.error('Failed to fetch tenant_user after creation:', fetchError)
      // Return a minimal object since the user was created successfully
      return {
        id: tenantUserId,
        tenant_id: tenantId,
        user_id: userId,
        role: input.role,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_profiles: profile,
      } as TenantUserWithProfile
    }

    // TODO: If sendWelcomeEmail is true, trigger welcome email
    // This would require an edge function or email service integration

    return {
      ...tenantUser,
      user_profiles: profile,
    }
  },

  // SysAdmin functions
  getAll: async (): Promise<Tenant[]> => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  getAllTenants: async (): Promise<Tenant[]> => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Soft delete (legacy - prefer deactivateTenant for new workflow)
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('tenants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  suspendTenant: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('tenants')
      .update({ status: 'suspended' })
      .eq('id', id)

    if (error) throw error
  },

  activateTenant: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('tenants')
      .update({ status: 'active', deleted_at: null })
      .eq('id', id)

    if (error) throw error
  },

  // Step 1 of deletion: Deactivate tenant (blocks user login)
  deactivateTenant: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('deactivate_tenant', { p_tenant_id: id })
    if (error) throw error
  },

  // Step 2 of deletion: Permanently delete tenant (requires confirmation)
  permanentlyDeleteTenant: async (id: string, confirmationName: string): Promise<void> => {
    const { error } = await supabase.rpc('permanently_delete_tenant', {
      p_tenant_id: id,
      p_confirmation_name: confirmationName,
    })
    if (error) throw error
  },

  // Check if tenant is accessible (not inactive/deleted)
  checkTenantAccess: async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('check_tenant_access', { p_tenant_id: id })
    if (error) {
      console.error('Failed to check tenant access:', error)
      return false
    }
    return data === true
  },
}
