import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/services/api/notifications'
import { useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import { getUserFriendlyError } from '@/lib/utils'
import type {
  UpdateNotificationEmailConfigInput,
  UpdateNotificationTemplateInput,
  UpsertTenantNotificationSettingInput,
  NotificationLogFilters,
} from '@/types/notifications'

// ============================================================================
// EMAIL CONFIG HOOKS (SysAdmin only)
// ============================================================================

export function useNotificationEmailConfig() {
  return useQuery({
    queryKey: ['notification-email-config'],
    queryFn: notificationsApi.getEmailConfig,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useUpsertNotificationEmailConfig() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: (input: UpdateNotificationEmailConfigInput) => {
      if (!user?.id) {
        throw new Error('Cannot update email config: User not authenticated')
      }
      return notificationsApi.upsertEmailConfig(user.id, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-email-config'] })
      toast({
        title: 'Email configuration saved',
        description: 'The sender configuration has been updated successfully.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to save email configuration',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// NOTIFICATION TEMPLATES HOOKS
// ============================================================================

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ['notification-templates'],
    queryFn: notificationsApi.getGlobalTemplates,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useNotificationTemplate(id: string) {
  return useQuery({
    queryKey: ['notification-template', id],
    queryFn: () => notificationsApi.getTemplateById(id),
    enabled: !!id,
  })
}

export function useUpdateNotificationTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateNotificationTemplateInput) => {
      if (!user?.id) {
        throw new Error('Cannot update template: User not authenticated')
      }
      return notificationsApi.updateGlobalTemplate(id, user.id, input)
    },
    onSuccess: (updatedTemplate, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
      queryClient.invalidateQueries({ queryKey: ['notification-template', variables.id] })
      queryClient.setQueryData(['notification-template', variables.id], updatedTemplate)
      toast({
        title: 'Template saved',
        description: 'The notification template has been updated successfully.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to save template',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// TENANT NOTIFICATION SETTINGS HOOKS
// ============================================================================

export function useTenantNotificationSettings(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-notification-settings', tenantId],
    queryFn: () => notificationsApi.getTenantSettings(tenantId!),
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useUpsertTenantNotificationSetting() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: ({
      tenantId,
      ...input
    }: { tenantId: string } & UpsertTenantNotificationSettingInput) => {
      if (!user?.id) {
        throw new Error('Cannot update setting: User not authenticated')
      }
      return notificationsApi.upsertTenantSetting(tenantId, user.id, input)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['tenant-notification-settings', variables.tenantId],
      })
      toast({
        title: 'Setting saved',
        description: 'The notification setting has been updated successfully.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to save setting',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// NOTIFICATION SUBSCRIPTIONS HOOKS
// ============================================================================

export function useNotificationSubscriptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['notification-subscriptions', tenantId],
    queryFn: () => notificationsApi.getSubscriptions(tenantId!),
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useAddNotificationSubscription() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: ({
      tenantId,
      triggerKey,
      userId,
    }: {
      tenantId: string
      triggerKey: string
      userId: string
    }) => {
      if (!user?.id) {
        throw new Error('Cannot add subscription: User not authenticated')
      }
      return notificationsApi.addSubscription(tenantId, triggerKey, userId, user.id)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['notification-subscriptions', variables.tenantId],
      })
      toast({
        title: 'Subscription added',
        description: 'User has been subscribed to this notification.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to add subscription',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useRemoveNotificationSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string; tenantId: string }) =>
      notificationsApi.removeSubscription(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['notification-subscriptions', variables.tenantId],
      })
      toast({
        title: 'Subscription removed',
        description: 'User has been unsubscribed from this notification.',
      })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to remove subscription',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// NOTIFICATION SEND LOG HOOKS (SysAdmin)
// ============================================================================

/**
 * Get notification log statistics (sent/failed counts)
 */
export function useNotificationLogStats() {
  return useQuery({
    queryKey: ['notification-log-stats'],
    queryFn: notificationsApi.getNotificationLogStats,
    staleTime: 1000 * 60, // 1 minute - more frequent updates for stats
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  })
}

/**
 * Get paginated notification send log with filters
 */
export function useNotificationLog(filters: NotificationLogFilters, page: number = 1) {
  return useQuery({
    queryKey: ['notification-log', filters, page],
    queryFn: () => notificationsApi.getNotificationLog(filters, page),
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Get distinct trigger keys for filter dropdown
 */
export function useNotificationLogTriggerKeys() {
  return useQuery({
    queryKey: ['notification-log-trigger-keys'],
    queryFn: notificationsApi.getLogTriggerKeys,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Get tenants with log entries for filter dropdown
 */
export function useNotificationLogTenants() {
  return useQuery({
    queryKey: ['notification-log-tenants'],
    queryFn: notificationsApi.getLogTenants,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// ============================================================================
// TENANT NOTIFICATION SEND LOG HOOKS (OrgAdmin - Tenant-scoped)
// ============================================================================

/**
 * Get tenant-scoped notification log statistics (sent/failed counts)
 */
export function useTenantNotificationLogStats(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-notification-log-stats', tenantId],
    queryFn: () => notificationsApi.getTenantNotificationLogStats(tenantId!),
    enabled: !!tenantId,
    staleTime: 1000 * 60, // 1 minute - more frequent updates for stats
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  })
}

/**
 * Get paginated tenant-scoped notification send log with filters
 */
export function useTenantNotificationLog(
  tenantId: string | undefined,
  filters: NotificationLogFilters,
  page: number = 1
) {
  return useQuery({
    queryKey: ['tenant-notification-log', tenantId, filters, page],
    queryFn: () => notificationsApi.getTenantNotificationLog(tenantId!, filters, page),
    enabled: !!tenantId,
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Get distinct trigger keys for tenant's log filter dropdown
 */
export function useTenantNotificationLogTriggerKeys(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-notification-log-trigger-keys', tenantId],
    queryFn: () => notificationsApi.getTenantLogTriggerKeys(tenantId!),
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
