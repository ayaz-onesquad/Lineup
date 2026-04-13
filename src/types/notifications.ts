// Notification System Types
// Matches database schema from migration 060_notifications_system.sql

// ============================================================================
// NOTIFICATION EMAIL CONFIG
// ============================================================================

export interface NotificationEmailConfig {
  id: string
  from_name: string
  from_email: string
  reply_to_email: string | null
  provider: string
  api_key_encrypted: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface CreateNotificationEmailConfigInput {
  from_name: string
  from_email: string
  reply_to_email?: string | null
}

export interface UpdateNotificationEmailConfigInput {
  from_name?: string
  from_email?: string
  reply_to_email?: string | null
  is_active?: boolean
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export interface NotificationTemplate {
  id: string
  trigger_key: string
  name: string
  description: string | null
  subject: string
  html_body: string
  available_variables: Record<string, string>
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface UpdateNotificationTemplateInput {
  name?: string
  description?: string | null
  subject?: string
  html_body?: string
  is_active?: boolean
}

// ============================================================================
// TENANT NOTIFICATION SETTINGS
// ============================================================================

export interface TenantNotificationSetting {
  id: string
  tenant_id: string
  template_id: string | null
  trigger_key: string
  is_active: boolean
  custom_subject: string | null
  custom_html_body: string | null
  has_override: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface TenantNotificationSettingWithTemplate extends TenantNotificationSetting {
  notification_templates?: NotificationTemplate
}

export interface UpsertTenantNotificationSettingInput {
  template_id?: string | null
  trigger_key: string
  is_active?: boolean
  custom_subject?: string | null
  custom_html_body?: string | null
}

// ============================================================================
// NOTIFICATION SUBSCRIPTIONS
// ============================================================================

export interface NotificationSubscription {
  id: string
  tenant_id: string
  trigger_key: string
  user_id: string
  subscribed_by: string
  created_at: string
}

export interface NotificationSubscriptionWithUser extends NotificationSubscription {
  user_profiles?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  subscribed_by_profile?: {
    id: string
    full_name: string
  }
}

export interface CreateNotificationSubscriptionInput {
  trigger_key: string
  user_id: string
}

// ============================================================================
// NOTIFICATION SEND LOG (Read-only for display)
// ============================================================================

export interface NotificationSendLog {
  id: string
  tenant_id: string | null
  trigger_key: string
  recipient_email: string
  subject: string
  status: 'queued' | 'sent' | 'failed'
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface NotificationSendLogWithTenant extends NotificationSendLog {
  tenants?: {
    name: string
  } | null
}

// ============================================================================
// NOTIFICATION LOG FILTERS & STATS
// ============================================================================

export interface NotificationLogFilters {
  search?: string
  status?: 'sent' | 'failed' | null
  triggerKey?: string | null
  tenantId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

export interface NotificationLogStats {
  totalSent: number
  totalFailed: number
  sentToday: number
  failedToday: number
}

export interface TenantNotificationLogStats {
  totalSent: number
  totalFailed: number
  sentToday: number
}

export interface NotificationLogPage {
  data: NotificationSendLogWithTenant[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}
