import { supabase } from '@/services/supabase'
import type {
  NotificationEmailConfig,
  UpdateNotificationEmailConfigInput,
  NotificationTemplate,
  UpdateNotificationTemplateInput,
  TenantNotificationSetting,
  TenantNotificationSettingWithTemplate,
  UpsertTenantNotificationSettingInput,
  NotificationSubscription,
  NotificationSubscriptionWithUser,
  NotificationLogFilters,
  NotificationLogStats,
  NotificationLogPage,
  NotificationSendLogWithTenant,
  TenantNotificationLogStats,
} from '@/types/notifications'

export const notificationsApi = {
  // ============================================================================
  // EMAIL CONFIG (Global - SysAdmin only)
  // ============================================================================

  /**
   * Get the global email sender configuration
   * Returns single row or null if not configured
   */
  getEmailConfig: async (): Promise<NotificationEmailConfig | null> => {
    const { data, error } = await supabase
      .from('notification_email_config')
      .select('*')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Upsert the global email sender configuration
   * Since there's only one row allowed, this creates or updates it
   */
  upsertEmailConfig: async (
    userId: string,
    input: UpdateNotificationEmailConfigInput
  ): Promise<NotificationEmailConfig> => {
    // First try to get existing config
    const existing = await notificationsApi.getEmailConfig()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('notification_email_config')
        .update({
          ...input,
          updated_by: userId,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return data
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('notification_email_config')
        .insert({
          from_name: input.from_name || 'LineUp',
          from_email: input.from_email || 'noreply@lineup.app',
          reply_to_email: input.reply_to_email,
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
  },

  // ============================================================================
  // GLOBAL TEMPLATES (SysAdmin manages)
  // ============================================================================

  /**
   * Get all global notification templates
   */
  getGlobalTemplates: async (): Promise<NotificationTemplate[]> => {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Get a single template by ID
   */
  getTemplateById: async (id: string): Promise<NotificationTemplate | null> => {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  /**
   * Update a global notification template (SysAdmin only)
   */
  updateGlobalTemplate: async (
    id: string,
    userId: string,
    input: UpdateNotificationTemplateInput
  ): Promise<NotificationTemplate> => {
    const { data, error } = await supabase
      .from('notification_templates')
      .update({
        ...input,
        updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ============================================================================
  // TENANT NOTIFICATION SETTINGS (Per-tenant overrides)
  // ============================================================================

  /**
   * Get all tenant notification settings with base template data
   */
  getTenantSettings: async (
    tenantId: string
  ): Promise<TenantNotificationSettingWithTemplate[]> => {
    const { data, error } = await supabase
      .from('tenant_notification_settings')
      .select(`
        *,
        notification_templates (*)
      `)
      .eq('tenant_id', tenantId)
      .order('trigger_key', { ascending: true })

    if (error) throw error
    return data || []
  },

  /**
   * Upsert a tenant notification setting
   * Creates or updates based on tenant_id + trigger_key unique constraint
   */
  upsertTenantSetting: async (
    tenantId: string,
    userId: string,
    input: UpsertTenantNotificationSettingInput
  ): Promise<TenantNotificationSetting> => {
    // Compute has_override based on whether custom subject/body are provided
    const hasOverride = !!(input.custom_subject || input.custom_html_body)

    // Check if setting already exists
    const { data: existing } = await supabase
      .from('tenant_notification_settings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('trigger_key', input.trigger_key)
      .single()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('tenant_notification_settings')
        .update({
          ...input,
          has_override: hasOverride,
          updated_by: userId,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return data
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('tenant_notification_settings')
        .insert({
          tenant_id: tenantId,
          trigger_key: input.trigger_key,
          template_id: input.template_id,
          is_active: input.is_active ?? true,
          custom_subject: input.custom_subject,
          custom_html_body: input.custom_html_body,
          has_override: hasOverride,
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
  },

  // ============================================================================
  // NOTIFICATION SUBSCRIPTIONS (User subscriptions)
  // ============================================================================

  /**
   * Get all subscriptions for a tenant
   */
  getSubscriptions: async (
    tenantId: string
  ): Promise<NotificationSubscriptionWithUser[]> => {
    const { data, error } = await supabase
      .from('notification_subscriptions')
      .select(`
        *,
        user_profiles:user_id (
          id,
          full_name,
          avatar_url
        ),
        subscribed_by_profile:subscribed_by (
          id,
          full_name
        )
      `)
      .eq('tenant_id', tenantId)
      .order('trigger_key', { ascending: true })

    if (error) throw error
    return (data || []) as NotificationSubscriptionWithUser[]
  },

  /**
   * Add a user subscription to a notification trigger
   */
  addSubscription: async (
    tenantId: string,
    triggerKey: string,
    userId: string,
    subscribedBy: string
  ): Promise<NotificationSubscription> => {
    const { data, error } = await supabase
      .from('notification_subscriptions')
      .insert({
        tenant_id: tenantId,
        trigger_key: triggerKey,
        user_id: userId,
        subscribed_by: subscribedBy,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Remove a subscription by ID
   */
  removeSubscription: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('notification_subscriptions')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ============================================================================
  // NOTIFICATION SEND LOG (SysAdmin - Global view)
  // ============================================================================

  /**
   * Get notification log statistics (sent/failed counts)
   */
  getNotificationLogStats: async (): Promise<NotificationLogStats> => {
    // Get today's date at midnight UTC for filtering
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // Fetch all counts in parallel
    const [totalSentResult, totalFailedResult, sentTodayResult, failedTodayResult] =
      await Promise.all([
        supabase
          .from('notification_send_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent'),
        supabase
          .from('notification_send_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed'),
        supabase
          .from('notification_send_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent')
          .gte('created_at', todayISO),
        supabase
          .from('notification_send_log')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('created_at', todayISO),
      ])

    // Check for errors
    if (totalSentResult.error) throw totalSentResult.error
    if (totalFailedResult.error) throw totalFailedResult.error
    if (sentTodayResult.error) throw sentTodayResult.error
    if (failedTodayResult.error) throw failedTodayResult.error

    return {
      totalSent: totalSentResult.count ?? 0,
      totalFailed: totalFailedResult.count ?? 0,
      sentToday: sentTodayResult.count ?? 0,
      failedToday: failedTodayResult.count ?? 0,
    }
  },

  /**
   * Get paginated notification send log with filters
   */
  getNotificationLog: async (
    filters: NotificationLogFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<NotificationLogPage> => {
    // Calculate range for pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build base query with tenant join
    let query = supabase
      .from('notification_send_log')
      .select('*, tenants(name)', { count: 'exact' })

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.triggerKey) {
      query = query.eq('trigger_key', filters.triggerKey)
    }

    if (filters.tenantId) {
      query = query.eq('tenant_id', filters.tenantId)
    }

    if (filters.dateFrom) {
      query = query.gte('sent_at', filters.dateFrom)
    }

    if (filters.dateTo) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.dateTo)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt('sent_at', endDate.toISOString())
    }

    if (filters.search) {
      // Search in recipient_email or subject
      query = query.or(
        `recipient_email.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`
      )
    }

    // Apply sorting and pagination
    const { data, error, count } = await query
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize)

    return {
      data: (data || []) as NotificationSendLogWithTenant[],
      totalCount,
      page,
      pageSize,
      totalPages,
    }
  },

  /**
   * Get distinct trigger keys from notification send log for filter dropdown
   */
  getLogTriggerKeys: async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from('notification_send_log')
      .select('trigger_key')
      .order('trigger_key', { ascending: true })

    if (error) throw error

    // Get unique trigger keys
    const uniqueKeys = [...new Set((data || []).map((row) => row.trigger_key))]
    return uniqueKeys
  },

  /**
   * Get all tenants with notification log entries for filter dropdown
   */
  getLogTenants: async (): Promise<{ id: string; name: string }[]> => {
    // First get distinct tenant IDs from the log
    const { data: logData, error: logError } = await supabase
      .from('notification_send_log')
      .select('tenant_id')
      .not('tenant_id', 'is', null)

    if (logError) throw logError

    const tenantIds = [...new Set((logData || []).map((row) => row.tenant_id).filter(Boolean))]

    if (tenantIds.length === 0) return []

    // Fetch tenant names
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', tenantIds)
      .order('name', { ascending: true })

    if (tenantsError) throw tenantsError

    return tenants || []
  },

  // ============================================================================
  // TENANT NOTIFICATION SEND LOG (OrgAdmin - Tenant-scoped view)
  // ============================================================================

  /**
   * Get tenant-scoped notification log statistics (sent/failed counts)
   */
  getTenantNotificationLogStats: async (
    tenantId: string
  ): Promise<TenantNotificationLogStats> => {
    // Get today's date at midnight UTC for filtering
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // Fetch all counts in parallel - filtered by tenant_id
    const [totalSentResult, totalFailedResult, sentTodayResult] = await Promise.all([
      supabase
        .from('notification_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'sent'),
      supabase
        .from('notification_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'failed'),
      supabase
        .from('notification_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'sent')
        .gte('created_at', todayISO),
    ])

    // Check for errors
    if (totalSentResult.error) throw totalSentResult.error
    if (totalFailedResult.error) throw totalFailedResult.error
    if (sentTodayResult.error) throw sentTodayResult.error

    return {
      totalSent: totalSentResult.count ?? 0,
      totalFailed: totalFailedResult.count ?? 0,
      sentToday: sentTodayResult.count ?? 0,
    }
  },

  /**
   * Get paginated tenant-scoped notification send log with filters
   */
  getTenantNotificationLog: async (
    tenantId: string,
    filters: NotificationLogFilters,
    page: number = 1,
    pageSize: number = 25
  ): Promise<NotificationLogPage> => {
    // Calculate range for pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build base query - always filter by tenant_id
    let query = supabase
      .from('notification_send_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.triggerKey) {
      query = query.eq('trigger_key', filters.triggerKey)
    }

    if (filters.search) {
      // Search in recipient_email or subject
      query = query.or(
        `recipient_email.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`
      )
    }

    // Apply sorting and pagination
    const { data, error, count } = await query
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize)

    // Transform to match expected type (no tenant join needed for tenant-scoped view)
    const transformedData: NotificationSendLogWithTenant[] = (data || []).map((row) => ({
      ...row,
      tenants: null, // Tenant column not needed in tenant-scoped view
    }))

    return {
      data: transformedData,
      totalCount,
      page,
      pageSize,
      totalPages,
    }
  },

  /**
   * Get distinct trigger keys from tenant's notification send log for filter dropdown
   */
  getTenantLogTriggerKeys: async (tenantId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from('notification_send_log')
      .select('trigger_key')
      .eq('tenant_id', tenantId)
      .order('trigger_key', { ascending: true })

    if (error) throw error

    // Get unique trigger keys
    const uniqueKeys = [...new Set((data || []).map((row) => row.trigger_key))]
    return uniqueKeys
  },
}
