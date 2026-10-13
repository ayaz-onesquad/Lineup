import { supabase } from '@/services/supabase'
import { DEFAULT_SESSION_POLICY } from '@/lib/sessionPolicy'
import type {
  EffectiveSessionPolicy,
  TenantSecuritySettings,
  UpdateTenantSecuritySettingsInput,
  AuthEvent,
  AuthEventType,
} from '@/types/database'

/** User-agent strings are capped before storage to avoid unbounded log rows. */
const MAX_USER_AGENT_LENGTH = 400

function currentUserAgent(): string {
  return (navigator.userAgent || '').slice(0, MAX_USER_AGENT_LENGTH)
}

export const sessionSecurityApi = {
  /**
   * Resolves the strictest session policy across every tenant the caller
   * belongs to. Falls back to the built-in defaults if the RPC is unavailable
   * (e.g. migration 068 not yet applied) so the timeout still engages.
   */
  getEffectivePolicy: async (): Promise<EffectiveSessionPolicy> => {
    const { data, error } = await supabase.rpc('get_effective_session_policy')

    if (error) {
      console.warn(
        '[sessionSecurityApi.getEffectivePolicy] falling back to defaults:',
        error.message
      )
      return DEFAULT_SESSION_POLICY
    }

    // The RPC returns a single-row table.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return DEFAULT_SESSION_POLICY

    return {
      idle_timeout_minutes: row.idle_timeout_minutes ?? DEFAULT_SESSION_POLICY.idle_timeout_minutes,
      absolute_session_hours: row.absolute_session_hours ?? DEFAULT_SESSION_POLICY.absolute_session_hours,
      warn_before_logout_seconds:
        row.warn_before_logout_seconds ?? DEFAULT_SESSION_POLICY.warn_before_logout_seconds,
      allow_remember_device: row.allow_remember_device ?? DEFAULT_SESSION_POLICY.allow_remember_device,
      remember_device_days: row.remember_device_days ?? DEFAULT_SESSION_POLICY.remember_device_days,
      block_document_download:
        row.block_document_download ?? DEFAULT_SESSION_POLICY.block_document_download,
      signed_url_ttl_seconds:
        row.signed_url_ttl_seconds ?? DEFAULT_SESSION_POLICY.signed_url_ttl_seconds,
    }
  },

  /** Reads one tenant's stored policy (org_admin screens). */
  getTenantSettings: async (tenantId: string): Promise<TenantSecuritySettings | null> => {
    const { data, error } = await supabase
      .from('tenant_security_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) throw error
    return data
  },

  /** Upserts one tenant's policy. RLS restricts this to org_admin. */
  updateTenantSettings: async (
    tenantId: string,
    userId: string,
    input: UpdateTenantSecuritySettingsInput
  ): Promise<TenantSecuritySettings> => {
    const { data, error } = await supabase
      .from('tenant_security_settings')
      .upsert(
        { tenant_id: tenantId, ...input, updated_by: userId },
        { onConflict: 'tenant_id' }
      )
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Appends an authentication audit event. Never throws: a failed audit write
   * must not block a sign-in or a sign-out.
   */
  logAuthEvent: async (params: {
    userId: string | null
    tenantId?: string | null
    email?: string | null
    eventType: AuthEventType
    detail?: string | null
  }): Promise<void> => {
    // RLS requires user_id = auth.uid(), so anonymous events cannot be stored.
    if (!params.userId) return

    try {
      await supabase.from('auth_events').insert({
        user_id: params.userId,
        tenant_id: params.tenantId ?? null,
        email: params.email ?? null,
        event_type: params.eventType,
        user_agent: currentUserAgent(),
        detail: params.detail ?? null,
      })
    } catch (err) {
      console.warn('[sessionSecurityApi.logAuthEvent] failed:', err)
    }
  },

  /** Recent authentication events for a tenant (org_admin view). */
  getAuthEvents: async (tenantId: string, limit = 100): Promise<AuthEvent[]> => {
    const { data, error } = await supabase
      .from('auth_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('occurred_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },
}
