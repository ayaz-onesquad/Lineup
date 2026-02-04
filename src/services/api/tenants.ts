import { supabase } from '@/services/supabase'
import type { Tenant, TenantUser, TenantUserWithProfile, CreateTenantInput } from '@/types/database'
import { generateSlug } from '@/lib/utils'

export const tenantsApi = {
  create: async (input: CreateTenantInput, userId: string): Promise<Tenant> => {
    const slug = input.slug || generateSlug(input.name)

    // Create tenant
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

    // Add user as org_admin
    const { error: userError } = await supabase
      .from('tenant_users')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: 'org_admin',
        status: 'active',
      })

    if (userError) throw userError

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
    const { data, error } = await supabase
      .from('tenant_users')
      .select(`
        *,
        user_profiles!tenant_users_user_id_fkey (*)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
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
      .update({ status: 'active' })
      .eq('id', id)

    if (error) throw error
  },
}
