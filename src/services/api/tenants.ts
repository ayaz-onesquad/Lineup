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
    // First get tenant users
    const { data: tenantUsers, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenantId)
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

    // Get admin's current user ID for verification
    const { data: { session: preSession } } = await supabase.auth.getSession()
    const adminUserId = preSession?.user?.id

    if (!adminUserId) {
      throw new Error('No active session. Please log in again.')
    }

    // 1. Create the auth user and profile
    const { userId, profile, adminUserId: returnedAdminId } = await authApi.adminCreateUser({
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      timezone: input.timezone,
    })

    // 2. VERIFY session is still the admin before tenant_users INSERT
    const { data: { session: postSession } } = await supabase.auth.getSession()
    if (postSession?.user.id !== adminUserId) {
      // Session changed unexpectedly - this is a critical error
      console.error('Session changed during user creation', {
        expected: adminUserId,
        actual: postSession?.user.id,
        returnedAdminId,
      })
      throw new Error(
        'Session changed during user creation. ' +
        'The user was created but may not be added to the tenant. ' +
        'Please refresh the page and check the user list.'
      )
    }

    // 3. Add user to tenant with specified role
    const { data: tenantUser, error: tenantError } = await supabase
      .from('tenant_users')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: input.role,
        status: 'active',
      })
      .select()
      .single()

    if (tenantError) {
      // If we fail to add to tenant, the user is still created
      // This is a partial failure state - log details for debugging
      console.error('Failed to add user to tenant:', {
        error: tenantError,
        tenantId,
        userId,
        role: input.role,
        adminUserId,
      })

      // Check if it's an RLS error
      if (tenantError.code === '42501' || tenantError.message.includes('permission denied')) {
        throw new Error(
          `User created but permission denied when adding to tenant. ` +
          `You may not have admin rights for this tenant. ` +
          `Please check your role or contact a system administrator.`
        )
      }

      throw new Error(
        `User created but failed to add to tenant: ${tenantError.message}. ` +
        `The user exists but may not appear in this tenant's list.`
      )
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
