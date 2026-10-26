import { supabase } from '@/services/supabase'
import type { LeadIntakeSettings, UpdateLeadIntakeSettingsInput } from '@/types/database'

export const leadIntakeSettingsApi = {
  /** One tenant's lead notification settings, or null when none are saved yet. */
  get: async (tenantId: string): Promise<LeadIntakeSettings | null> => {
    const { data, error } = await supabase
      .from('lead_intake_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) throw error
    return data
  },

  /** Saves one tenant's settings (recipients, assignee, confirm_to_contact). RLS restricts this to org admins. */
  save: async (
    tenantId: string,
    input: UpdateLeadIntakeSettingsInput
  ): Promise<LeadIntakeSettings> => {
    const { data, error } = await supabase
      .from('lead_intake_settings')
      .upsert({ tenant_id: tenantId, ...input }, { onConflict: 'tenant_id' })
      .select()
      .single()

    if (error) throw error
    return data
  },
}
