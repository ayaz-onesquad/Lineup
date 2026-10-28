import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'

/** Review states for an error group (migration 073). */
export type AppErrorStatus = 'new' | 'acknowledged' | 'action_required' | 'resolved' | 'ignored'

export interface AppErrorGroup {
  id: string
  display_id: number
  fingerprint: string
  source: 'client' | 'api' | 'edge_function' | 'database'
  error_name: string | null
  message: string
  code: string | null
  stack: string | null
  occurrence_count: number
  affected_users: string[]
  first_seen_at: string
  last_seen_at: string
  last_url: string | null
  last_tenant_id: string | null
  release: string | null
  status: AppErrorStatus
  resolution_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  regressed_at: string | null
  tenants?: { name: string } | null
}

export interface AppErrorOccurrence {
  id: string
  group_id: string
  tenant_id: string | null
  user_id: string | null
  url: string | null
  user_agent: string | null
  release: string | null
  context: Record<string, unknown>
  occurred_at: string
  tenants?: { name: string } | null
}

export const APP_ERROR_STATUS_LABEL: Record<AppErrorStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  action_required: 'Action required',
  resolved: 'Resolved',
  ignored: 'Ignored',
}

/** All error groups, newest activity first. SysAdmin only (RLS). */
export function useAppErrorGroups() {
  return useQuery({
    queryKey: ['app-errors', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_error_groups')
        .select('*, tenants:last_tenant_id (name)')
        .order('last_seen_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as AppErrorGroup[]
    },
    // Errors keep arriving; keep the queue fresh while it is open.
    refetchInterval: 60_000,
  })
}

/** The latest occurrences of one group. */
export function useAppErrorOccurrences(groupId: string | null) {
  return useQuery({
    queryKey: ['app-errors', 'occurrences', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_error_occurrences')
        .select('*, tenants:tenant_id (name)')
        .eq('group_id', groupId!)
        .order('occurred_at', { ascending: false })
        .limit(25)
      if (error) throw error
      return (data ?? []) as AppErrorOccurrence[]
    },
  })
}

/** Change a group's review status, optionally with a note. */
export function useReviewAppError() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { groupId: string; status: AppErrorStatus; note?: string }) => {
      const { error } = await supabase.rpc('review_app_error', {
        p_group_id: input.groupId,
        p_status: input.status,
        p_note: input.note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-errors'] }),
  })
}
