import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '@/services/api'
import { useAuthStore, useTenantStore } from '@/stores'
import { toast } from '@/hooks/use-toast'
import type {
  CreateLeadInput,
  UpdateLeadInput,
  LinkLeadContactInput,
  ConvertLeadOptions,
} from '@/types/database'

export function useLeads() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['leads', currentTenant?.id],
    queryFn: () => leadsApi.getAll(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useLeadsByStatus(status: string) {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['leads', 'status', status, currentTenant?.id],
    queryFn: () => leadsApi.getByStatus(currentTenant!.id, status),
    enabled: !!currentTenant?.id && !!status,
  })
}

export function useLeadsByOwner(ownerId: string) {
  return useQuery({
    queryKey: ['leads', 'owner', ownerId],
    queryFn: () => leadsApi.getByOwner(ownerId),
    enabled: !!ownerId,
  })
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getById(id),
    enabled: !!id,
  })
}

export function useLeadPipelineStats() {
  const { currentTenant } = useTenantStore()

  return useQuery({
    queryKey: ['leads', 'pipeline-stats', currentTenant?.id],
    queryFn: () => leadsApi.getPipelineStats(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

export function useLeadContacts(leadId: string) {
  return useQuery({
    queryKey: ['lead-contacts', leadId],
    queryFn: () => leadsApi.getContacts(leadId),
    enabled: !!leadId,
  })
}

export function useLeadMutations() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { currentTenant } = useTenantStore()

  const createLead = useMutation({
    mutationFn: (input: CreateLeadInput) =>
      leadsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'pipeline-stats'] })
      toast({
        title: 'Lead created',
        description: 'The lead has been added to your pipeline.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create lead',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateLead = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateLeadInput) =>
      leadsApi.update(id, user!.id, input),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ['lead', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'pipeline-stats'] })
      toast({
        title: 'Lead updated',
        description: 'The lead has been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update lead',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateLeadStatus = useMutation({
    mutationFn: ({
      id,
      status,
      additionalData,
    }: {
      id: string
      status: string
      additionalData?: { lost_reason?: string; lost_reason_notes?: string }
    }) => leadsApi.updateStatus(id, user!.id, status, additionalData),
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ['lead', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'pipeline-stats'] })
      toast({
        title: 'Lead status updated',
        description: `Lead moved to ${variables.status}.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update status',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const convertToClient = useMutation({
    mutationFn: ({ leadId, options }: { leadId: string; options?: ConvertLeadOptions }) =>
      leadsApi.convertToClient(leadId, options),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'pipeline-stats'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast({
        title: 'Lead converted',
        description: 'The lead has been converted to a client.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to convert lead',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteLead = useMutation({
    mutationFn: leadsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead'] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'pipeline-stats'] })
      toast({
        title: 'Lead archived',
        description: 'The lead has been archived.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive lead',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Lead contacts mutations
  const linkContact = useMutation({
    mutationFn: (input: LinkLeadContactInput) =>
      leadsApi.linkContact(currentTenant!.id, user!.id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', variables.lead_id] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.lead_id] })
      toast({
        title: 'Contact linked',
        description: 'The contact has been linked to this lead.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to link contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateLeadContact = useMutation({
    mutationFn: ({
      id,
      leadId,
      ...input
    }: { id: string; leadId: string } & Partial<LinkLeadContactInput>) =>
      leadsApi.updateContact(id, user!.id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] })
      toast({
        title: 'Contact updated',
        description: 'The contact relationship has been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const unlinkContact = useMutation({
    mutationFn: ({ id }: { id: string; leadId: string }) => leadsApi.unlinkContact(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] })
      toast({
        title: 'Contact unlinked',
        description: 'The contact has been removed from this lead.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to unlink contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const setPrimaryContact = useMutation({
    mutationFn: ({ leadId, contactId }: { leadId: string; contactId: string }) =>
      leadsApi.setPrimaryContact(leadId, contactId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-contacts', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] })
      toast({
        title: 'Primary contact set',
        description: 'The primary contact has been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to set primary contact',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createLead,
    updateLead,
    updateLeadStatus,
    convertToClient,
    deleteLead,
    linkContact,
    updateLeadContact,
    unlinkContact,
    setPrimaryContact,
  }
}
