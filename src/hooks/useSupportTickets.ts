import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supportTicketsApi } from '@/services/api/supportTickets'
import type { CreateTicketInput, UpdateTicketInput } from '@/services/api/supportTickets'
import { useTenant } from './useTenant'
import { useAuth } from './useAuth'
import { toast } from './use-toast'

// Query keys
const ticketKeys = {
  all: ['support-tickets'] as const,
  myTickets: (tenantId: string, userId: string) =>
    [...ticketKeys.all, 'my', tenantId, userId] as const,
  tenantTickets: (tenantId: string) => [...ticketKeys.all, 'tenant', tenantId] as const,
  allTickets: () => [...ticketKeys.all, 'all'] as const,
  detail: (id: string) => [...ticketKeys.all, id] as const,
  stats: () => [...ticketKeys.all, 'stats'] as const,
}

/**
 * Get current user's tickets
 */
export function useMyTickets() {
  const { currentTenant } = useTenant()
  const { user } = useAuth()

  return useQuery({
    queryKey: ticketKeys.myTickets(currentTenant?.id || '', user?.id || ''),
    queryFn: () => supportTicketsApi.getMyTickets(currentTenant!.id, user!.id),
    enabled: !!currentTenant?.id && !!user?.id,
  })
}

/**
 * Get all tickets for tenant (OrgAdmin)
 */
export function useTenantTickets() {
  const { currentTenant } = useTenant()

  return useQuery({
    queryKey: ticketKeys.tenantTickets(currentTenant?.id || ''),
    queryFn: () => supportTicketsApi.getTenantTickets(currentTenant!.id),
    enabled: !!currentTenant?.id,
  })
}

/**
 * Get all tickets across all tenants (SysAdmin)
 */
export function useAllTickets() {
  return useQuery({
    queryKey: ticketKeys.allTickets(),
    queryFn: () => supportTicketsApi.getAllTickets(),
  })
}

/**
 * Get ticket by ID
 */
export function useTicketById(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => supportTicketsApi.getById(id),
    enabled: !!id,
  })
}

/**
 * Get ticket statistics (SysAdmin)
 */
export function useTicketStats() {
  return useQuery({
    queryKey: ticketKeys.stats(),
    queryFn: () => supportTicketsApi.getStats(),
  })
}

/**
 * Support ticket mutations
 */
export function useSupportTicketMutations() {
  const queryClient = useQueryClient()
  const { currentTenant } = useTenant()
  const { user } = useAuth()

  const createTicket = useMutation({
    mutationFn: (input: CreateTicketInput) =>
      supportTicketsApi.create(currentTenant!.id, user!.id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      toast({
        title: 'Ticket submitted',
        description: `Ticket ${data.ticket_id_display} has been created successfully.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error submitting ticket',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const updateTicket = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTicketInput }) =>
      supportTicketsApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      toast({
        title: 'Ticket updated',
        description: 'The ticket has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating ticket',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const resolveTicket = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      supportTicketsApi.resolve(id, user!.id, resolution),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      toast({
        title: 'Ticket resolved',
        description: `Ticket ${data.ticket_id_display} has been resolved.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error resolving ticket',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return {
    createTicket,
    updateTicket,
    resolveTicket,
  }
}
