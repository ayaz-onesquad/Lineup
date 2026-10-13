import { supabase } from '@/services/supabase'
import type {
  Password,
  CreatePasswordInput,
  UpdatePasswordInput,
  PasswordAccessLogEntry,
  UserProfile,
} from '@/types/database'

/**
 * Columns the client is allowed to read.
 *
 * `password` and `password_encrypted` are deliberately absent: migration 070
 * revokes SELECT on them for the `authenticated` role, so a `select('*')` now
 * fails outright. The secret is reachable only through `reveal()`, which
 * decrypts a single row and writes an access-log entry.
 */
const PASSWORD_COLUMNS = `
  id, display_id, tenant_id, application_name, url, username, email,
  category, notes, password_changed_at,
  created_at, created_by, updated_at, updated_by, deleted_at
`

async function loadProfiles(
  ids: Iterable<string>
): Promise<Map<string, { full_name: string | null; avatar_url: string | null }>> {
  const unique = Array.from(new Set(Array.from(ids).filter(Boolean)))
  if (unique.length === 0) return new Map()

  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, avatar_url')
    .in('id', unique)

  return new Map(
    (data ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
  )
}

export const passwordsApi = {
  /**
   * All credentials for the tenant, WITHOUT the secrets.
   *
   * The list page previously received every plaintext credential whether or
   * not the user opened a record. It now receives metadata only.
   */
  getAll: async (tenantId: string): Promise<Password[]> => {
    const { data, error } = await supabase
      .from('passwords')
      .select(PASSWORD_COLUMNS)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('application_name', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as Password[]
  },

  /** One credential, WITHOUT the secret, plus creator/updater profiles. */
  getById: async (id: string): Promise<Password | null> => {
    const { data: password, error } = await supabase
      .from('passwords')
      .select(PASSWORD_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!password) return null

    const row = password as unknown as Password
    const profileMap = await loadProfiles(
      [row.created_by, row.updated_by].filter((v): v is string => !!v)
    )

    return {
      ...row,
      creator: row.created_by ? profileMap.get(row.created_by) ?? null : null,
      updater: row.updated_by ? profileMap.get(row.updated_by) ?? null : null,
    } as Password
  },

  /**
   * Decrypts and returns ONE secret, recording who asked.
   *
   * Call this only in direct response to a user action (clicking reveal or
   * copy), never to populate a list.
   */
  reveal: async (id: string): Promise<string> => {
    const { data, error } = await supabase.rpc('password_reveal', { p_id: id })
    if (error) throw error
    if (data === null || data === undefined) {
      throw new Error('This credential has no stored secret.')
    }
    return data as string
  },

  /**
   * Creates a credential. The secret is encrypted inside the database by
   * `password_create`, so it is never written to a plaintext column.
   */
  create: async (
    tenantId: string,
    _userProfileId: string,
    input: CreatePasswordInput
  ): Promise<Password> => {
    const { data: newId, error } = await supabase.rpc('password_create', {
      p_tenant_id: tenantId,
      p_application_name: input.application_name,
      p_password: input.password,
      p_url: input.url ?? null,
      p_username: input.username ?? null,
      p_email: input.email ?? null,
      p_category: input.category ?? null,
      p_notes: input.notes ?? null,
    })

    if (error) throw error

    const created = await passwordsApi.getById(newId as string)
    if (!created) throw new Error('The credential was saved but could not be read back.')
    return created
  },

  /**
   * Updates a credential.
   *
   * Metadata goes through a normal UPDATE (column-level grants allow it). The
   * secret, when supplied, goes through `password_set_secret` so it is
   * encrypted server-side and logged.
   */
  update: async (
    id: string,
    userProfileId: string,
    input: UpdatePasswordInput
  ): Promise<Password> => {
    // Secret first: if it fails, the metadata is not left half-applied with a
    // misleading password_changed_at.
    if (input.password !== undefined && input.password !== '') {
      const { error: secretError } = await supabase.rpc('password_set_secret', {
        p_id: id,
        p_password: input.password,
      })
      if (secretError) throw secretError
    }

    const updateData: Record<string, unknown> = { updated_by: userProfileId }

    if (input.application_name !== undefined) updateData.application_name = input.application_name
    if (input.url !== undefined) updateData.url = input.url || null
    if (input.username !== undefined) updateData.username = input.username || null
    if (input.email !== undefined) updateData.email = input.email || null
    if (input.category !== undefined) updateData.category = input.category || null
    if (input.notes !== undefined) updateData.notes = input.notes || null
    // password_changed_at is owned by password_set_secret when the secret
    // changes; an explicit value is still honoured for manual corrections.
    if (input.password_changed_at !== undefined) {
      updateData.password_changed_at = input.password_changed_at || null
    }

    // Only issue the UPDATE when there is something besides updated_by.
    if (Object.keys(updateData).length > 1) {
      const { error } = await supabase
        .from('passwords')
        .update(updateData)
        .eq('id', id)

      if (error) throw error
    }

    const updated = await passwordsApi.getById(id)
    if (!updated) throw new Error('The credential was updated but could not be read back.')
    return updated
  },

  /** Soft delete, recorded in the access log. */
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('password_soft_delete', { p_id: id })
    if (error) throw error
  },

  /**
   * Who revealed, created, changed or deleted this credential, and when.
   * Readable by the tenant's admins only (RLS).
   */
  getAccessLog: async (
    passwordId: string,
    limit = 100
  ): Promise<PasswordAccessLogEntry[]> => {
    const { data, error } = await supabase
      .from('password_access_log')
      .select('*')
      .eq('password_id', passwordId)
      .order('accessed_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const entries = (data ?? []) as PasswordAccessLogEntry[]

    // password_access_log.user_id references auth.users, so profiles are
    // resolved through user_profiles.user_id rather than .id.
    const userIds = Array.from(new Set(entries.map(e => e.user_id)))
    let profiles = new Map<string, UserProfile>()
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('user_profiles')
        .select('id, user_id, first_name, last_name, full_name, avatar_url')
        .in('user_id', userIds)
      profiles = new Map((profileRows ?? []).map(p => [p.user_id, p as UserProfile]))
    }

    return entries.map(e => ({ ...e, user: profiles.get(e.user_id) ?? null }))
  },
}
