import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leadAutomationsApi } from '@/services/api'
import { useTenantStore, useAuthStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type {
  LeadAutomation,
  AutomationRun,
  CreateLeadAutomationInput,
  UpdateLeadAutomationInput,
} from '@/services/api/leadAutomations'

/**
 * Hook to fetch all lead automations for the current tenant
 */
export function useLeadAutomations() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['lead_automations', currentTenant?.id],
    queryFn: () => leadAutomationsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Hook to fetch a single lead automation by ID
 */
export function useLeadAutomation(id: string) {
  return useQuery({
    queryKey: ['lead_automation', id],
    queryFn: () => leadAutomationsApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Hook to fetch automation runs with live polling when running
 */
export function useAutomationRuns(automationId: string) {
  return useQuery({
    queryKey: ['automation_runs', automationId],
    queryFn: () => leadAutomationsApi.getRuns(automationId),
    enabled: !!automationId,
    refetchInterval: (query) => {
      // Poll every 3 seconds if latest run is still running
      const runs = query.state.data as AutomationRun[] | undefined
      const latestRun = runs?.[0]
      return latestRun?.status === 'running' ? 3000 : false
    },
  })
}

/**
 * Hook for lead automation mutations (create, update, delete, toggle, trigger)
 */
export function useLeadAutomationMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenantStore()
  const { user } = useAuthStore()
  // Use auth user ID (not profile ID) - FK references auth.users
  const userId = user?.id

  const createAutomation = useMutation({
    mutationFn: (input: CreateLeadAutomationInput) =>
      leadAutomationsApi.create(currentTenant!.id, userId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_automations', currentTenant?.id] })
      toast({
        title: 'Automation created',
        description: 'Your lead automation has been saved.',
      })
    },
    onError: (error: Error) => {
      console.error('[useLeadAutomations.createAutomation] Error:', error)
      toast({
        title: 'Failed to create automation',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateAutomation = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateLeadAutomationInput) =>
      leadAutomationsApi.update(id, userId!, input),
    onSuccess: async (_, variables) => {
      await queryClient.refetchQueries({ queryKey: ['lead_automation', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['lead_automations', currentTenant?.id] })
      toast({
        title: 'Automation updated',
        description: 'Your changes have been saved.',
      })
    },
    onError: (error: Error) => {
      console.error('[useLeadAutomations.updateAutomation] Error:', error)
      toast({
        title: 'Failed to update automation',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteAutomation = useMutation({
    mutationFn: leadAutomationsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_automations', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['lead_automation'] })
      toast({
        title: 'Automation deleted',
        description: 'The automation has been removed.',
      })
    },
    onError: (error: Error) => {
      console.error('[useLeadAutomations.deleteAutomation] Error:', error)
      toast({
        title: 'Failed to delete automation',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      leadAutomationsApi.update(id, userId!, { is_active }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead_automations', currentTenant?.id] })
      queryClient.invalidateQueries({ queryKey: ['lead_automation', variables.id] })
      toast({
        title: variables.is_active ? 'Automation activated' : 'Automation paused',
      })
    },
    onError: (error: Error) => {
      console.error('[useLeadAutomations.toggleActive] Error:', error)
      toast({
        title: 'Failed to update automation',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const triggerRun = useMutation({
    mutationFn: ({ automationId }: { automationId: string }) =>
      leadAutomationsApi.runManually(automationId, userId!),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation_runs', variables.automationId] })
      queryClient.invalidateQueries({ queryKey: ['leads', currentTenant?.id] })
      toast({
        title: 'Automation started',
        description: 'Check the run history for results.',
      })
    },
    onError: (error: Error) => {
      console.error('[useLeadAutomations.triggerRun] Error:', error)
      toast({
        title: 'Run failed',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleActive,
    triggerRun,
  }
}

// Re-export types for convenience
export type { LeadAutomation, AutomationRun, CreateLeadAutomationInput, UpdateLeadAutomationInput }
